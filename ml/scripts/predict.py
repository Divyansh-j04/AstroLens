"""Classify one photo and print the top 3 guesses.

Usage (from the project root):
    python ml/scripts/predict.py path/to/photo.jpg
"""

import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
from app.cv.classifier import Classifier  # noqa: E402


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    names = {o["id"]: o["name"] for o in json.loads((ROOT / "backend/app/data/objects.json").read_text(encoding="utf-8"))}
    clf = Classifier()
    top = clf.predict(Image.open(sys.argv[1]))
    for rank, (cls, p) in enumerate(top, 1):
        print(f"{rank}. {names[cls]:<24} {p:6.1%}")
    if clf.is_unknown(top):
        print(f"-> Not one of my known objects (best guess below the {clf.threshold:.0%} threshold)")
    else:
        print(f"-> {names[top[0][0]]}")


if __name__ == "__main__":
    main()
