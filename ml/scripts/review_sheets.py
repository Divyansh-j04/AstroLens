"""Make numbered contact sheets so every candidate image can be checked by eye, and record rejections.

Usage (from the project root):
    python ml/scripts/review_sheets.py sheets [class ...]       # writes ml/data/raw/review/<class>_<k>.jpg
    Use "<class>_topup" instead of "<class>" to review only images added by ml/scripts/topup.py,
    "<class>_wiki" for only the Wikimedia images, or "<class>_new" for images not yet reviewed.
    python ml/scripts/review_sheets.py done GROUP
        -> records every image of GROUP (e.g. "saturn_new") as reviewed in ml/data/review_done.txt
    python ml/scripts/review_sheets.py mark CLASS "3,17,40" "reason"
        -> adds those numbered images of CLASS to ml/data/review_excluded.csv (dropped)
    python ml/scripts/review_sheets.py closeup CLASS "5,22"
        -> tags those images as identifiable close-ups in ml/data/review_closeups.csv (kept)

Review rule: keep whole-object photos and close-ups a person could identify (Jupiter's Great
Red Spot, Saturn's rings, the Pillars of Creation, sunspots); drop ambiguous close-ups, diagrams,
artwork, the wrong object, and broken or near-black images.

Numbers follow the sorted file names in ml/data/raw/images/<class>/, so they are stable.
"""

import csv
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
IMAGES = ROOT / "ml" / "data" / "raw" / "images"
REVIEW = ROOT / "ml" / "data" / "raw" / "review"
EXCLUDED = ROOT / "ml" / "data" / "review_excluded.csv"
CLOSEUPS = ROOT / "ml" / "data" / "review_closeups.csv"
DONE = ROOT / "ml" / "data" / "review_done.txt"  # every image that has been looked at
COLS, ROWS, CELL = 10, 8, 128  # 80 thumbnails per sheet


def files_of(cls: str) -> list[Path]:
    if cls == "unknown":
        return sorted((ROOT / "ml" / "data" / "raw" / "unknown").glob("*.jpg"))
    base = real_class(cls)
    files = sorted((IMAGES / base).glob("*.jpg"))
    if cls.endswith("_topup"):
        return [f for f in files if "_t_" in f.name]
    if cls.endswith("_wiki"):
        return [f for f in files if "_t_" not in f.name]
    if cls.endswith("_new"):
        done = set(DONE.read_text(encoding="utf-8").split()) if DONE.exists() else set()
        return [f for f in files if f.name not in done]
    return files


def real_class(cls: str) -> str:
    for suffix in ("_topup", "_wiki", "_new"):
        cls = cls.removesuffix(suffix)
    return cls


def done(group: str) -> None:
    files = files_of(group)
    with DONE.open("a", encoding="utf-8") as fh:
        fh.writelines(f"{f.name}\n" for f in files)
    print(f"{group}: recorded {len(files)} images as reviewed")


def sheets(classes: list[str]) -> None:
    REVIEW.mkdir(parents=True, exist_ok=True)
    font = ImageFont.load_default(size=18)
    for cls in classes:
        files = files_of(cls)
        per = COLS * ROWS
        for k in range(0, len(files), per):
            sheet = Image.new("RGB", (COLS * CELL, ROWS * CELL), "#202020")
            draw = ImageDraw.Draw(sheet)
            for j, path in enumerate(files[k:k + per]):
                img = Image.open(path).convert("RGB")
                img.thumbnail((CELL - 4, CELL - 4))
                x, y = (j % COLS) * CELL, (j // COLS) * CELL
                sheet.paste(img, (x + 2, y + 2))
                draw.rectangle([x + 2, y + 2, x + 38, y + 22], fill="#000000")
                draw.text((x + 4, y + 2), str(k + j), fill="#ffff00", font=font)
            out = REVIEW / f"{cls}_{k // per}.jpg"
            sheet.save(out, quality=85)
            print(out.relative_to(ROOT))


def mark(cls: str, numbers: str, reason: str) -> None:
    files = files_of(cls)
    picked = [files[int(n)] for n in numbers.replace(" ", "").split(",") if n]
    new = not EXCLUDED.exists()
    with EXCLUDED.open("a", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        if new:
            w.writerow(["file", "class", "reason"])
        for p in picked:
            w.writerow([p.name, real_class(cls), reason])
    print(f"{cls}: excluded {len(picked)} ({reason})")


def closeup(cls: str, numbers: str) -> None:
    files = files_of(cls)
    picked = [files[int(n)] for n in numbers.replace(" ", "").split(",") if n]
    new = not CLOSEUPS.exists()
    with CLOSEUPS.open("a", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        if new:
            w.writerow(["file", "class"])
        for p in picked:
            w.writerow([p.name, real_class(cls)])
    print(f"{cls}: tagged {len(picked)} close-ups")


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "sheets":
        sheets(sys.argv[2:] or sorted(p.name for p in IMAGES.iterdir() if p.is_dir()))
    elif len(sys.argv) == 5 and sys.argv[1] == "mark":
        mark(sys.argv[2], sys.argv[3], sys.argv[4])
    elif len(sys.argv) == 4 and sys.argv[1] == "closeup":
        closeup(sys.argv[2], sys.argv[3])
    elif len(sys.argv) == 3 and sys.argv[1] == "done":
        done(sys.argv[2])
    else:
        sys.exit(__doc__)
