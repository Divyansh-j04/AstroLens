"""Turn the HYG star catalogue into a small file the 3D page can load.

Keeps only stars visible to the naked eye (magnitude below 6.5) and only the
fields the scene needs: position (x, y, z), brightness (mag) and colour index (ci).

Usage:
    python ml/scripts/build_stars.py ml/data/raw/hyg/hyg.csv frontend/public/data/hyg_stars.json
"""

import csv
import json
import sys
from pathlib import Path

MAG_LIMIT = 6.5  # faintest magnitude the human eye can see on a dark night
DEFAULT_CI = 0.65  # colour index of a Sun-like (white-yellow) star, used when missing


def build(src: Path, dst: Path) -> int:
    stars: list[list[float]] = []
    with src.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row["id"] == "0":  # row 0 is the Sun itself, drawn separately
                continue
            mag = float(row["mag"])
            if mag >= MAG_LIMIT:
                continue
            ci = float(row["ci"]) if row["ci"] else DEFAULT_CI
            stars.append([
                round(float(row["x"]), 3),
                round(float(row["y"]), 3),
                round(float(row["z"]), 3),
                round(mag, 2),
                round(ci, 3),
            ])

    out = {
        "source": "HYG Database v4.1, https://github.com/astronexus/HYG-Database (CC BY-SA 4.0)",
        "units": "parsec, equatorial coordinates (x towards RA 0h, z towards north celestial pole)",
        "mag_limit": MAG_LIMIT,
        "fields": ["x", "y", "z", "mag", "ci"],
        "stars": stars,
    }
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    return len(stars)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    n = build(Path(sys.argv[1]), Path(sys.argv[2]))
    print(f"Wrote {n} stars to {sys.argv[2]}")
