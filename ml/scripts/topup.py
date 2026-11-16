"""Add images from NASA's Photojournal and ESA/Hubble + ESA/Webb, for classes that need more.

Wikimedia Commons rate-limited our downloads and some classes were short after review, so this
step adds two further public archives (see ml/data/topup_sources.json):

- "pia":  JPL Photojournal images (ids "PIA....."), found through the NASA Image and Video Library
          search (images-api.nasa.gov). Keeping only PIA ids drops event and people photos.
          NASA images are not copyrighted; images credited to other agencies keep their own terms.
- "esa":  image archive search on ESA/Hubble (esahubble.org), ESA/Webb (esawebb.org), NOIRLab
          (noirlab.edu, the US national optical observatory) or ESO (eso.org). All CC BY 4.0.
- "epic": NASA DSCOVR EPIC full-disc photos of Earth (epic.gsfc.nasa.gov API), spread evenly
          over the mission's dates; public domain.

A result is kept only if its title contains the object's name or one of its aliases from
objects.json. New images are saved as ml/data/raw/images/<class>/<class>_t_<hash>.jpg and
listed in ml/data/manifest_topup.csv (re-running skips what is already there). They are then
reviewed by eye like every other image:  python ml/scripts/review_sheets.py sheets <class>_topup

Usage (from the project root):
    python ml/scripts/topup.py
    python ml/scripts/topup.py --unknown     # out-of-class test photos (ml/data/unknown_sources.json)
"""

import csv
import hashlib
import html
import io
import json
import re
import ssl
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import quote, urlencode

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
CONFIG = ROOT / "ml" / "data" / "topup_sources.json"
OBJECTS = ROOT / "backend" / "app" / "data" / "objects.json"
IMAGES = ROOT / "ml" / "data" / "raw" / "images"
MANIFEST_TOPUP = ROOT / "ml" / "data" / "manifest_topup.csv"

# HTTPS: normal certificate checks, plus two public Let's Encrypt "link" certificates
# (ISRG Root X2 signed by ISRG Root X1, and Root YE signed by ISRG Root X2). Some Wikimedia
# servers leave these out of their chain; Windows fetches them by itself, Python does not.
# They only connect the chain to ISRG Root X1, which Windows already trusts; no check is disabled.
SSL_CONTEXT = ssl.create_default_context()
for _pem in sorted((ROOT / "ml" / "data" / "certs").glob("*.pem")):
    SSL_CONTEXT.load_verify_locations(str(_pem))
FIELDS = ["file", "class", "set", "title", "page", "author", "licence", "width", "height"]
HEADERS = {"User-Agent": "Mozilla/5.0 (AstroLens student project; one-off dataset download)"}

NASA_API = "https://images-api.nasa.gov/search"
PIA_IMAGE = "https://assets.science.nasa.gov/dynamicimage/assets/science/psd/photojournal/pia/pia{p}/pia{n}/PIA{n}.jpg?w=1024"
ESA_SITES = {
    "hubble": {"site": "https://esahubble.org", "cdn": "https://cdn.esahubble.org", "name": "ESA/Hubble"},
    "webb": {"site": "https://esawebb.org", "cdn": "https://cdn.esawebb.org", "name": "ESA/Webb"},
    "noirlab": {"site": "https://noirlab.edu/public", "cdn": "https://storage.noirlab.edu/media", "name": "NOIRLab"},
    # ESO (European Southern Observatory), CC BY 4.0; its image files have no "/archives" in the path
    "eso": {"site": "https://www.eso.org/public", "cdn": "https://cdn.eso.org", "name": "ESO",
            "image": "{cdn}/images/screen/{id}.jpg"},
}
EPIC_API = "https://epic.gsfc.nasa.gov/api/natural"
EPIC_IMAGE = "https://epic.gsfc.nasa.gov/archive/natural/{y}/{m}/{d}/jpg/{name}.jpg"
MAX_SIDE = 800  # keep files small; training uses 224 px
DEFAULT_MAX = 80  # results kept per source
EXCLUDE = re.compile(r"diagram|illustration|artist|concept|chart|\bmap\b|graph|animation|video|"
                     r"infographic|poster|spectrum|team|launch|rocket|comparison|annotated", re.I)


def fetch(url: str) -> bytes:
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), context=SSL_CONTEXT, timeout=90) as r:
                return r.read()
        except urllib.error.HTTPError as err:
            if err.code in (403, 404) or attempt == 3:
                raise
            time.sleep(10 * (attempt + 1))
        except urllib.error.URLError:
            if attempt == 3:
                raise
            time.sleep(10 * (attempt + 1))
    raise RuntimeError("unreachable")


def name_pattern(obj: dict) -> re.Pattern:
    """Matches the object's name or any alias as a whole word, e.g. 'Crab Nebula', 'M1', 'Messier 1'."""
    names = [obj["name"], *obj["aliases"]]
    names += [n.replace(" Nebula", "").replace(" Cluster", "") for n in names]
    alts = sorted({re.escape(n) for n in names if len(n) >= 2}, key=len, reverse=True)
    return re.compile(r"\b(" + "|".join(alts) + r")\b", re.I)


def pia_results(query: str, pages: int) -> list[dict]:
    out = []
    for page in range(1, pages + 1):
        data = json.loads(fetch(f"{NASA_API}?{urlencode({'q': query, 'media_type': 'image', 'page': page})}"))
        items = data["collection"]["items"]
        for it in items:
            m = it["data"][0]
            nid = m["nasa_id"]
            if not re.fullmatch(r"PIA\d{5}", nid):
                continue
            n = nid[3:]
            out.append({
                "key": nid, "title": m["title"],
                "page": f"https://science.nasa.gov/photojournal/{quote(m['title'].lower().replace(' ', '-'))}/",
                "image": PIA_IMAGE.format(p=n[:2], n=n),
                "author": (m.get("secondary_creator") or m.get("photographer") or "NASA/JPL")[:150],
                "licence": "NASA Photojournal (NASA images not copyrighted; other credits keep their terms)",
            })
        if len(items) < 100:
            break
        time.sleep(0.5)
    return out


def esa_results(which: str, query: str, pages: int) -> list[dict]:
    site = ESA_SITES[which]
    out = []
    for page in range(1, pages + 1):
        path = "/images/" if page == 1 else f"/images/page/{page}/"
        try:
            text = fetch(f"{site['site']}{path}?{urlencode({'search': query})}").decode("utf-8", "replace")
        except urllib.error.HTTPError:
            break
        found = re.findall(r"id: '([^']+)',\s*title: '((?:[^'\\]|\\.)*)'", text)
        for img_id, title in found:
            out.append({
                "key": f"{which}:{img_id}", "title": html.unescape(title.replace("\\'", "'")),
                "page": f"{site['site']}/images/{img_id}/",
                "image": site.get("image", "{cdn}/archives/images/screen/{id}.jpg").format(cdn=site["cdn"], id=img_id),
                "author": site["name"], "licence": "CC BY 4.0",
            })
        if len(found) < 50:
            break
        time.sleep(0.5)
    return out


def epic_results(count: int) -> list[dict]:
    """One EPIC photo on each of `count` evenly spaced dates; a different time of day each time,
    so different sides of the Earth face the camera."""
    dates = [d["date"] for d in json.loads(fetch(f"{EPIC_API}/all"))]
    picks = [dates[round(i * (len(dates) - 1) / max(1, count - 1))] for i in range(count)]
    out = []
    for i, date in enumerate(picks):
        items = json.loads(fetch(f"{EPIC_API}/date/{date}"))
        if not items:
            continue
        name = items[(i * 7) % len(items)]["image"]
        y, m, d = date.split("-")
        out.append({
            "key": f"epic:{name}", "title": f"Earth from DSCOVR EPIC, {date} ({name})",
            "page": f"https://epic.gsfc.nasa.gov/?date={date}#{name}",
            "image": EPIC_IMAGE.format(y=y, m=m, d=d, name=name),
            "author": "NASA EPIC Team", "licence": "Public domain (NASA)",
        })
        time.sleep(0.3)
    return out


def esa_credit(page_url: str, fallback: str) -> str:
    """The credit line printed on an ESA image page (needed for CC BY attribution)."""
    try:
        text = fetch(page_url).decode("utf-8", "replace")
    except Exception:
        return fallback
    m = re.search(r'class="credit"[^>]*>(.*?)</div>', text, re.S)
    if not m:
        return fallback
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", m.group(1)))).strip()[:150] or fallback


def save(url: str, dst: Path) -> tuple[int, int] | None:
    try:
        img = Image.open(io.BytesIO(fetch(url))).convert("RGB")
    except Exception as err:
        print(f"    skip {url}: {err}", file=sys.stderr)
        return None
    if min(img.size) < 256:
        return None
    img.thumbnail((MAX_SIDE, MAX_SIDE))
    img.save(dst, "JPEG", quality=90)
    return img.size


def main() -> None:
    config = json.loads(CONFIG.read_text(encoding="utf-8"))["classes"]
    objects = {o["id"]: o for o in json.loads(OBJECTS.read_text(encoding="utf-8"))}
    old: list[dict] = []
    if MANIFEST_TOPUP.exists():
        with MANIFEST_TOPUP.open(encoding="utf-8") as fh:
            old = list(csv.DictReader(fh))
    done_pages = {r["page"] for r in old}
    rows = list(old)

    only = next((a.split("=", 1)[1].split(",") for a in sys.argv if a.startswith("--only=")), None)
    for cls, sources in config.items():
        if only and cls not in only:
            continue
        pattern = name_pattern(objects[cls])
        candidates: dict[str, dict] = {}
        for src in sources:
            if "pia" in src:
                hits = pia_results(src["pia"], src.get("pages", 5))
                label = f"Photojournal '{src['pia']}'"
            elif "epic" in src:
                hits = epic_results(src["count"])
                label = "DSCOVR EPIC"
            else:
                hits = esa_results(src["esa"], src["search"], src.get("pages", 3))
                label = f"ESA/{src['esa']} '{src['search']}'"
            # EPIC only ever photographs the Earth, so its titles need no name check.
            kept = [h for h in hits if "epic" in src or (pattern.search(h["title"]) and not EXCLUDE.search(h["title"]))]
            kept = kept[: src.get("max", DEFAULT_MAX)]
            print(f"{cls}: {label}: {len(hits)} results, {len(kept)} with the object's name", file=sys.stderr)
            for h in kept:
                candidates.setdefault(h["key"], h)
            time.sleep(0.5)

        added = 0
        for key, h in sorted(candidates.items()):
            if h["page"] in done_pages:
                continue
            name = f"{cls}_t_{hashlib.sha1(key.encode()).hexdigest()[:10]}.jpg"
            dst = IMAGES / cls / name
            dst.parent.mkdir(parents=True, exist_ok=True)
            size = Image.open(dst).size if dst.exists() else save(h["image"], dst)
            if size is None:
                continue
            author = h["author"]
            if h["licence"] == "CC BY 4.0":
                author = esa_credit(h["page"], author)
            rows.append({"file": name, "class": cls, "set": "known", "title": h["title"], "page": h["page"],
                         "author": author, "licence": h["licence"], "width": size[0], "height": size[1]})
            done_pages.add(h["page"])
            added += 1
            time.sleep(0.3)
        print(f"{cls}: added {added} images", file=sys.stderr)

        # Save after every class, so an interrupted run keeps what it has.
        with MANIFEST_TOPUP.open("w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=FIELDS)
            w.writeheader()
            w.writerows(rows)
    print(f"{MANIFEST_TOPUP.relative_to(ROOT)}: {len(rows)} rows", file=sys.stderr)


def unknown() -> None:
    """Out-of-class test photos (ml/data/unknown_sources.json) -> ml/data/raw/unknown/ + manifest_unknown.csv."""
    cfg = json.loads((ROOT / "ml" / "data" / "unknown_sources.json").read_text(encoding="utf-8"))
    out_dir = ROOT / "ml" / "data" / "raw" / "unknown"
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest = ROOT / "ml" / "data" / "manifest_unknown.csv"
    rows: list[dict] = []
    for label, spec in cfg["objects"].items():
        pattern = re.compile(spec["title"], re.I)
        found: dict[str, dict] = {}
        for src in spec["sources"]:
            hits = pia_results(src["pia"], src.get("pages", 2)) if "pia" in src else \
                esa_results(src["esa"], src["search"], src.get("pages", 1))
            for h in hits:
                if pattern.search(h["title"]) and not EXCLUDE.search(h["title"]):
                    found.setdefault(h["key"], h)
            time.sleep(0.5)
        added = 0
        for key, h in sorted(found.items()):
            if added >= cfg["per_source"]:
                break
            name = f"unknown_{hashlib.sha1(key.encode()).hexdigest()[:10]}.jpg"
            dst = out_dir / name
            size = Image.open(dst).size if dst.exists() else save(h["image"], dst)
            if size is None:
                continue
            author = esa_credit(h["page"], h["author"]) if h["licence"] == "CC BY 4.0" else h["author"]
            rows.append({"file": name, "class": label, "set": "unknown", "title": h["title"], "page": h["page"],
                         "author": author, "licence": h["licence"], "width": size[0], "height": size[1]})
            added += 1
            time.sleep(0.3)
        print(f"unknown / {label}: {added}", file=sys.stderr)
    with manifest.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(rows)
    print(f"{manifest.relative_to(ROOT)}: {len(rows)} rows", file=sys.stderr)


if __name__ == "__main__":
    unknown() if "--unknown" in sys.argv else main()
