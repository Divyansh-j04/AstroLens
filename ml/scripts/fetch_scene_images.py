"""Download the images the 3D scene needs and record their licences.

- Planets, Sun and Moon: map textures by Solar System Scope (CC BY 4.0), hosted on Wikimedia Commons.
- The other moons (added Nov 17): global surface maps from NASA/JPL/USGS spacecraft mosaics on Wikimedia
  Commons (public domain), or colour maps built from them (CC BY-SA 3.0), listed in MOON_MAPS.
- Nebulae and clusters: the lead image of the object's Wikipedia article (the Wikipedia link
  already listed in that object's `sources` in objects.json), hosted on Wikimedia Commons.

Every file is saved as frontend/public/textures/<object id>.jpg, so the page finds it by id.
The script prints a Markdown table of sources and licences to paste into ml/data/SOURCES.md.

Usage (from the project root):
    python ml/scripts/fetch_scene_images.py
    python ml/scripts/fetch_scene_images.py --only=io,europa   # just these objects
"""

import io
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import quote, unquote, urlencode

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OBJECTS = ROOT / "backend" / "app" / "data" / "objects.json"
OUT_DIR = ROOT / "frontend" / "public" / "textures"

COMMONS_API = "https://commons.wikimedia.org/w/api.php"
WIKI_SUMMARY = "https://en.wikipedia.org/api/rest_v1/page/summary/"
# Wikimedia blocks some HTTP libraries by fingerprint; Python's built-in urllib is accepted.
HEADERS = {"User-Agent": "AstroLensAssetFetcher/0.1 (student project, one-off download)"}

# Requested widths; Commons rounds up to its standard thumbnail sizes (1280 and 960 px).
PLANET_WIDTH = 1024  # equirectangular map, about 1024 x 512 is enough for small spheres
SPRITE_WIDTH = 512  # nebula / cluster picture shown as a flat glowing sprite

# Solar System Scope names some maps differently from our ids.
TEXTURE_NAME = {"earth": "earth daymap", "venus": "venus atmosphere"}
EXTRA_FILES = {"saturn_ring.png": "Solarsystemscope texture 2k saturn ring alpha.png"}
# Global maps of the moons (equirectangular, about 2:1), chosen on Commons for a free licence.
MOON_MAPS = {
    "phobos": "Phobos Viking Mosaic DLRcontrol 7200.jpg",
    "deimos": "Deimos color map.jpg",
    "io": "Io modest scale map Io SSI-only color SIMP0 med.cub.jpg",
    "europa": "Europa Voyager GalileoSSI global mosaic.jpg",
    "ganymede": "Ganymede map by Askaniy.png",
    "callisto": "Callisto map NASA JPL Voyager.jpg",
    "titan": "Titan map April 2011 full.png",
    "enceladus": "Enceladus Color Map.jpg",
    "mimas": "Map of Mimas colorized 2014-04 PIA18437.jpg",
    "rhea": "Rhea Color Map.jpg",
    "iapetus": "Iapetus Color Map.jpg",
    "miranda": "Miranda map JPL USGS.jpg",
    "ariel": "Ariel map JPL USGS.jpg",
    "titania": "Titania map JPL USGS.jpg",
    "oberon": "Oberon map JPL USGS.jpg",
    "triton": "Triton map no grid.jpg",
}


def fetch(url: str) -> bytes:
    """GET a URL; if Wikimedia says "too many requests" (429), wait and try again."""
    for attempt in range(8):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=60) as r:
                return r.read()
        except urllib.error.HTTPError as err:
            if err.code != 429 or attempt == 7:
                raise
            wait = int(err.headers.get("Retry-After") or 10 * (attempt + 1))
            print(f"  rate limited, waiting {wait} s", file=sys.stderr)
            time.sleep(wait)
    raise RuntimeError("unreachable")


def commons_info(file_title: str, width: int) -> dict:
    """Ask Commons for a resized copy of a file plus its licence and author."""
    params = {
        "action": "query",
        "titles": f"File:{file_title}",
        "prop": "imageinfo",
        "iiprop": "url|extmetadata",
        "iiurlwidth": width,
        "format": "json",
    }
    pages = json.loads(fetch(f"{COMMONS_API}?{urlencode(params)}"))["query"]["pages"]
    info = next(iter(pages.values()))["imageinfo"][0]
    meta = info["extmetadata"]

    def clean(key: str) -> str:
        text = meta.get(key, {}).get("value", "")
        return re.sub(r"<[^>]+>", "", text).strip().replace("\n", " ").replace("|", "/")

    return {
        "thumb": info["thumburl"],
        "page": info["descriptionurl"],
        "licence": clean("LicenseShortName"),
        "author": clean("Artist")[:120],
    }


def lead_image_title(wiki_url: str) -> str:
    """File name of the main picture at the top of a Wikipedia article."""
    article = wiki_url.rsplit("/", 1)[-1]
    summary = json.loads(fetch(WIKI_SUMMARY + quote(unquote(article))))
    src = summary["originalimage"]["source"]
    # .../commons/thumb/0/00/Crab_Nebula.jpg/3840px-Crab_Nebula.jpg  or  .../commons/a/ab/Name.jpg
    match = re.search(r"/commons/(?:thumb/)?[0-9a-f]/[0-9a-f]{2}/([^/?]+)", src)
    if not match:
        raise ValueError(f"cannot read the file name from {src}")
    return unquote(match.group(1)).replace("_", " ")


def download(url: str, dst: Path) -> int:
    """Save the image; .jpg outputs are re-encoded as real JPEGs (some Commons thumbs are PNG)."""
    data = fetch(url)
    if dst.suffix == ".jpg":
        Image.open(io.BytesIO(data)).convert("RGB").save(dst, "JPEG", quality=85)
    else:
        dst.write_bytes(data)
    return dst.stat().st_size


def is_placeholder(path: Path) -> bool:
    """Plain-colour stand-ins (ml/scripts/make_placeholder_textures.py) carry a JPEG comment saying so."""
    with Image.open(path) as img:
        return img.info.get("comment") == b"placeholder"


def main() -> None:
    objects = json.loads(OBJECTS.read_text(encoding="utf-8"))
    only = next((a.split("=", 1)[1].split(",") for a in sys.argv[1:] if a.startswith("--only=")), None)
    if only:
        objects = [o for o in objects if o["id"] in only]
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    rows: list[str] = []

    jobs: list[tuple[str, str, int]] = []  # (output file, Commons file title, width)
    for obj in objects:
        if obj["id"] in MOON_MAPS:
            jobs.append((f"{obj['id']}.jpg", MOON_MAPS[obj["id"]], PLANET_WIDTH))
        elif obj["scene_mode"] == "solar_system":
            name = TEXTURE_NAME.get(obj["id"], obj["id"])
            jobs.append((f"{obj['id']}.jpg", f"Solarsystemscope texture 2k {name}.jpg", PLANET_WIDTH))
        else:
            wiki = next(str(s) for s in obj["sources"] if "wikipedia.org/wiki/" in str(s))
            jobs.append((f"{obj['id']}.jpg", lead_image_title(wiki), SPRITE_WIDTH))
    for out_name, title in ({} if only else EXTRA_FILES).items():
        jobs.append((out_name, title, PLANET_WIDTH))

    for out_name, title, width in jobs:
        info = commons_info(title, width)  # licence and author, also for files already here
        if only and (OUT_DIR / out_name).exists() and not is_placeholder(OUT_DIR / out_name):
            size = (OUT_DIR / out_name).stat().st_size  # downloaded by an earlier, interrupted run
        else:
            size = download(info["thumb"], OUT_DIR / out_name)
        print(f"{out_name:<24} {size / 1024:7.0f} KB  {info['licence']:<14} {title}", file=sys.stderr)
        rows.append(f"| `{out_name}` | [{title}]({info['page']}) | {info['author']} | {info['licence']} |")
        time.sleep(8 if only else 2)  # be polite to Wikimedia

    print("| File | Commons source | Author | Licence |")
    print("| --- | --- | --- | --- |")
    print("\n".join(rows))


if __name__ == "__main__":
    main()
