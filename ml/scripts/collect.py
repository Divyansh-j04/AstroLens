"""Collect candidate training images from Wikimedia Commons, with licence and author.

Reads ml/data/collect_sources.json (which Commons categories or searches feed each class),
keeps photos only (JPEG/PNG, at least 256 px, no diagrams, maps or artwork by title),
and saves a 500 px copy of each into ml/data/raw/images/<class>/ (not committed).
Every image is listed in ml/data/manifest.csv with its source page, author and licence.

The unknown-object test set (things outside the 20 classes) goes to ml/data/raw/unknown/.

Usage (from the project root):
    python ml/scripts/collect.py --dry-run     # only count candidates per class
    python ml/scripts/collect.py               # download (skips files already downloaded)
    python ml/scripts/collect.py --manifest-only   # no downloads: list the files already on disk
                                                   # (used when a download run had to be stopped)
"""

import argparse
import csv
import hashlib
import http.client
import io
import json
import random
import re
import ssl
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlencode

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
CONFIG = ROOT / "ml" / "data" / "collect_sources.json"
OBJECTS = ROOT / "backend" / "app" / "data" / "objects.json"
RAW = ROOT / "ml" / "data" / "raw"
MANIFEST = ROOT / "ml" / "data" / "manifest.csv"

# HTTPS: normal certificate checks, plus two public Let's Encrypt "link" certificates
# (ISRG Root X2 signed by ISRG Root X1, and Root YE signed by ISRG Root X2). Some Wikimedia
# servers leave these out of their chain; Windows fetches them by itself, Python does not.
# They only connect the chain to ISRG Root X1, which Windows already trusts; no check is disabled.
SSL_CONTEXT = ssl.create_default_context()
for _pem in sorted((ROOT / "ml" / "data" / "certs").glob("*.pem")):
    SSL_CONTEXT.load_verify_locations(str(_pem))

API = "https://commons.wikimedia.org/w/api.php"
# Wikimedia blocks some HTTP libraries by fingerprint; Python's built-in urllib is accepted.
HEADERS = {"User-Agent": "AstroLensAssetFetcher/0.1 (student project, one-off download)"}
THUMB_WIDTH = 500  # one of Commons' standard thumbnail sizes; training uses 224 px
MIN_SIDE = 256
MAX_CANDIDATES = 260  # per class; review and de-duplication bring this down to at most 150
SEARCH_MAX_PAGES = 6  # keyword searches: read at most 6 pages of 50 results
PER_SOURCE_MAX = 150  # random picks per source, so one huge source cannot crowd out the others
SEED = 0

# File names that are almost never photos of the object itself.
EXCLUDE = re.compile(
    r"map|diagram|chart|logo|stamp|coin|poster|drawing|illustration|artist|render|comparison|"
    r"size|plot|graph|spectr|schem|animation|globe|model|infographic|sketch|label|annotated|"
    r"symbol|cartoon|painting|art\b|book|cover|mosaic of|timeline|orbit|transit|eclipse|"
    r"comet|meteor|aurora|rocket|launch|astronaut|telescope|observatory|team|people|crew",
    re.IGNORECASE,
)


def fetch(url: str) -> bytes:
    """GET a URL; wait and try again if Wikimedia says "too many requests" (429) or if a
    connection fails or is cut off midway (Wikimedia occasionally serves a certificate chain Python cannot verify;
    the next connection is fine). Every attempt is fully verified; nothing is accepted unverified."""
    conn_failures = 0
    for attempt in range(12):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), context=SSL_CONTEXT, timeout=60) as r:
                return r.read()
        except urllib.error.HTTPError as err:
            if err.code != 429 or attempt == 11:
                raise
            wait = int(err.headers.get("Retry-After") or 15 * (attempt + 1))
            print(f"  rate limited, waiting {wait} s", file=sys.stderr)
            time.sleep(wait)
        except (urllib.error.URLError, TimeoutError, ConnectionError, http.client.IncompleteRead) as err:
            conn_failures += 1
            if conn_failures >= 5:
                raise
            print(f"  connection failed ({str(err)[:60]}), retry {conn_failures}/4 in 5 s", file=sys.stderr)
            time.sleep(5)
    raise RuntimeError("unreachable")


def api(**params: str | int) -> dict:
    params = {"action": "query", "format": "json", **params}
    data = json.loads(fetch(f"{API}?{urlencode(params)}"))
    time.sleep(0.5)
    return data


def files_with_info(generator_params: dict, max_pages: int | None = None) -> list[dict]:
    """All files from a generator (category members or search), with URL, size and licence.
    max_pages limits how many result pages are read (used for keyword searches)."""
    out: list[dict] = []
    pages = 0
    params = {
        **generator_params,
        "prop": "imageinfo",
        "iiprop": "url|size|mime|extmetadata",
        "iiurlwidth": THUMB_WIDTH,
        "iiextmetadatafilter": "LicenseShortName|Artist",
    }
    while True:
        data = api(**params)
        for page in data.get("query", {}).get("pages", {}).values():
            if "imageinfo" not in page:
                continue
            info = page["imageinfo"][0]
            meta = info.get("extmetadata", {})
            out.append({
                "title": page["title"].removeprefix("File:"),
                "page": info["descriptionurl"],
                "thumb": info.get("thumburl", info["url"]),
                "mime": info["mime"],
                "width": info["width"],
                "height": info["height"],
                "licence": re.sub(r"<[^>]+>", "", meta.get("LicenseShortName", {}).get("value", "")).strip(),
                "author": re.sub(r"<[^>]+>", "", meta.get("Artist", {}).get("value", "")).strip()[:150],
            })
        pages += 1
        if "continue" not in data or (max_pages is not None and pages >= max_pages):
            return out
        params.update(data["continue"])


def category_files(category: str) -> list[dict]:
    return files_with_info({"generator": "categorymembers", "gcmtitle": f"Category:{category}",
                            "gcmtype": "file", "gcmlimit": 50})


def subcategories(category: str) -> list[str]:
    data = api(list="categorymembers", cmtitle=f"Category:{category}", cmtype="subcat", cmlimit=200)
    return [m["title"].removeprefix("Category:") for m in data["query"]["categorymembers"]]


def search_files(query: str) -> list[dict]:
    return files_with_info({"generator": "search", "gsrsearch": f"{query} filetype:bitmap",
                            "gsrnamespace": 6, "gsrlimit": 50}, max_pages=SEARCH_MAX_PAGES)


def is_photo(f: dict) -> bool:
    return (
        f["mime"] in ("image/jpeg", "image/png")
        and min(f["width"], f["height"]) >= MIN_SIDE
        and not EXCLUDE.search(f["title"])
    )


def gather(sources: list[dict], rng: random.Random) -> dict[str, dict]:
    """Candidates in source order (main categories are listed first in the config, so they win the cap)."""
    found: dict[str, dict] = {}
    for src in sources:
        if "search" in src:
            batch = search_files(src["search"])
            where = f"search '{src['search']}'"
        else:
            cats = [src["category"]] + (subcategories(src["category"]) if src.get("depth", 0) >= 1 else [])
            batch = [f for c in cats for f in category_files(c)]
            where = f"category '{src['category']}' (+{len(cats) - 1} subcats)"
        kept = sorted((f for f in batch if is_photo(f)), key=lambda f: f["title"])
        limit = src.get("max", PER_SOURCE_MAX)
        print(f"    {where}: {len(batch)} files, {len(kept)} photos, taking {min(limit, len(kept))}", file=sys.stderr)
        if len(kept) > limit:
            kept = rng.sample(kept, limit)
        for f in kept:
            found.setdefault(f["title"], f)
    return found


def file_name(cls: str, title: str) -> str:
    return f"{cls}_{hashlib.sha1(title.encode()).hexdigest()[:10]}.jpg"


def save(f: dict, dst: Path) -> None:
    img = Image.open(io.BytesIO(fetch(f["thumb"])))
    img.convert("RGB").save(dst, "JPEG", quality=90)
    time.sleep(0.3)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="only count candidates")
    ap.add_argument("--manifest-only", action="store_true", help="write the manifest for files already on disk")
    args = ap.parse_args()

    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    ids = [o["id"] for o in json.loads(OBJECTS.read_text(encoding="utf-8"))]
    assert set(config["classes"]) == set(ids), "collect_sources.json must list exactly the 20 objects"

    # 1. Candidates per class
    rng = random.Random(SEED)
    per_class: dict[str, dict[str, dict]] = {}
    for cls in ids:
        print(f"{cls}", file=sys.stderr)
        per_class[cls] = gather(config["classes"][cls], rng)

    # 2. A file found under two different classes is ambiguous (e.g. "Jupiter and Saturn"): drop it.
    seen: dict[str, int] = {}
    for found in per_class.values():
        for t in found:
            seen[t] = seen.get(t, 0) + 1
    chosen: dict[str, list[dict]] = {}
    for cls, found in per_class.items():
        files = [f for t, f in found.items() if seen[t] == 1][:MAX_CANDIDATES]  # earlier sources first
        chosen[cls] = sorted(files, key=lambda f: f["title"])

    print("\nCandidates per class (after ambiguity removal and cap):", file=sys.stderr)
    for cls, files in chosen.items():
        print(f"  {cls:<18} {len(files)}", file=sys.stderr)
    if args.dry_run:
        return

    # 3. Manifest first: list every chosen file that is already on disk, so stopping the run
    #    later can never lose the licence records. It is rewritten after every class.
    rows: dict[str, dict] = {}

    def add_row(name: str, cls: str, set_: str, f: dict) -> None:
        rows[name] = {"file": name, "class": cls, "set": set_, **{k: f[k] for k in
                      ("title", "page", "author", "licence", "width", "height")}}

    def write_manifest() -> None:
        with MANIFEST.open("w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=["file", "class", "set", "title", "page", "author", "licence",
                                               "width", "height"])
            w.writeheader()
            w.writerows(rows.values())

    for cls, files in chosen.items():
        for f in files:
            name = file_name(cls, f["title"])
            if (RAW / "images" / cls / name).exists():
                add_row(name, cls, "known", f)
    write_manifest()
    print(f"Manifest: {len(rows)} files already on disk", file=sys.stderr)

    # 4. Download what is missing (skipped with --manifest-only)
    for cls, files in chosen.items():
        if args.manifest_only:
            break
        folder = RAW / "images" / cls
        folder.mkdir(parents=True, exist_ok=True)
        for f in files:
            name = file_name(cls, f["title"])
            if not (folder / name).exists():
                try:
                    save(f, folder / name)
                except Exception as err:  # a broken file should not stop the run
                    print(f"  skip {f['title']}: {err}", file=sys.stderr)
                    continue
            add_row(name, cls, "known", f)
        write_manifest()
        print(f"{cls}: {len(files)} done", file=sys.stderr)

    # 5. Unknown-object test set
    unk = config["unknown"]
    folder = RAW / "unknown"
    folder.mkdir(parents=True, exist_ok=True)
    for src in unk["sources"]:
        files = [f for f in category_files(src["category"]) if is_photo(f)]
        files = sorted(rng.sample(files, min(unk["per_source"], len(files))), key=lambda f: f["title"])
        for f in files:
            name = file_name("unknown", f["title"])
            if args.manifest_only and not (folder / name).exists():
                continue
            if not (folder / name).exists():
                try:
                    save(f, folder / name)
                except Exception as err:
                    print(f"  skip {f['title']}: {err}", file=sys.stderr)
                    continue
            add_row(name, src["category"], "unknown", f)
        write_manifest()
        print(f"unknown / {src['category']}: {len(files)}", file=sys.stderr)

    write_manifest()
    print(f"Wrote {len(rows)} rows to {MANIFEST.relative_to(ROOT)}", file=sys.stderr)


if __name__ == "__main__":
    main()
