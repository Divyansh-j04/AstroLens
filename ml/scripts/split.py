"""Build the final dataset: apply the review, remove near-duplicates, cap each class, split 70/15/15.

Each kept image is a "whole" object view or an identifiable "closeup" (tagged in review).
Close-ups are capped at 30% of a class, and the split is made separately for each view type,
so validation and test both contain whole objects and close-ups in the same proportion.

Near-duplicates (the same picture resized, re-compressed or slightly re-edited) are found with a
difference hash (dHash): shrink the image to 9x8 grey pixels and record, for each pixel, whether it
is brighter than its right-hand neighbour. That gives 64 bits; two images whose bits differ in at
most HAMMING_LIMIT places are treated as the same picture. Removing them BEFORE splitting stops
the same picture landing in both training and test (test-set leakage).

Outputs:
    ml/data/split.csv                 one row per image: file, class, split (train / val / test)
    ml/results/dataset_counts.json    counts per class at every step, for REPORT.md Table B

Usage (from the project root):
    python ml/scripts/split.py
"""

import csv
import json
import random
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
IMAGES = ROOT / "ml" / "data" / "raw" / "images"
MANIFEST = ROOT / "ml" / "data" / "manifest.csv"
MANIFEST_TOPUP = ROOT / "ml" / "data" / "manifest_topup.csv"  # extra images from ml/scripts/topup.py
EXCLUDED = ROOT / "ml" / "data" / "review_excluded.csv"
CLOSEUPS = ROOT / "ml" / "data" / "review_closeups.csv"
REVIEWED = ROOT / "ml" / "data" / "review_done.txt"  # only images someone has looked at are used
SPLIT = ROOT / "ml" / "data" / "split.csv"
COUNTS = ROOT / "ml" / "results" / "dataset_counts.json"

HAMMING_LIMIT = 6  # of 64 bits
MAX_PER_CLASS = 150
MAX_CLOSEUP_SHARE = 0.30  # close-ups may be at most 30% of a class
FRACTIONS = {"train": 0.70, "val": 0.15}  # test gets the rest (about 15%)
SEED = 0


def dhash(path: Path) -> int:
    grey = np.asarray(Image.open(path).convert("L").resize((9, 8), Image.Resampling.LANCZOS), dtype=np.int16)
    bits = (grey[:, 1:] > grey[:, :-1]).flatten()
    return int("".join("1" if b else "0" for b in bits), 2)


def main() -> None:
    rows = []
    for manifest in (MANIFEST, MANIFEST_TOPUP):
        if manifest.exists():
            with manifest.open(encoding="utf-8") as fh:
                rows += [r for r in csv.DictReader(fh) if r["set"] == "known"]
    excluded = set()
    if EXCLUDED.exists():
        with EXCLUDED.open(encoding="utf-8") as fh:
            excluded = {r["file"] for r in csv.DictReader(fh)}
    closeups = set()
    if CLOSEUPS.exists():
        with CLOSEUPS.open(encoding="utf-8") as fh:
            closeups = {r["file"] for r in csv.DictReader(fh)}
    reviewed = set(REVIEWED.read_text(encoding="utf-8").split()) if REVIEWED.exists() else set()
    for r in rows:
        r["view"] = "closeup" if r["file"] in closeups else "whole"

    counts: dict[str, dict[str, int]] = defaultdict(dict)
    for r in rows:
        counts[r["class"]]["candidates"] = counts[r["class"]].get("candidates", 0) + 1
    kept = [r for r in rows if r["file"] in reviewed and r["file"] not in excluded
            and (IMAGES / r["class"] / r["file"]).exists()]
    for cls in counts:
        counts[cls]["after_review"] = sum(r["class"] == cls for r in kept)

    # Near-duplicates, compared across ALL classes. Keep the first of each group (by file name);
    # if a group spans two classes the picture is ambiguous, so the whole group is dropped.
    kept.sort(key=lambda r: r["file"])
    hashes = [dhash(IMAGES / r["class"] / r["file"]) for r in kept]
    group = list(range(len(kept)))
    for i in range(len(kept)):
        if group[i] != i:
            continue
        for j in range(i + 1, len(kept)):
            if group[j] == j and bin(hashes[i] ^ hashes[j]).count("1") <= HAMMING_LIMIT:
                group[j] = i
    members: dict[int, list[int]] = defaultdict(list)
    for j, g in enumerate(group):
        members[g].append(j)
    unique = []
    cross_class = 0
    for g, idx in members.items():
        if len({kept[j]["class"] for j in idx}) > 1:
            cross_class += len(idx)
            continue
        unique.append(kept[g])
    for cls in counts:
        counts[cls]["after_dedup"] = sum(r["class"] == cls for r in unique)

    # Cap (close-ups at most 30%), then split each view type 70/15/15, with a fixed seed.
    rng = random.Random(SEED)
    out: list[dict] = []
    for cls in sorted(counts):
        by_view = {}
        for view in ("whole", "closeup"):
            items = sorted((r for r in unique if r["class"] == cls and r["view"] == view), key=lambda r: r["file"])
            rng.shuffle(items)
            by_view[view] = items
        target = min(MAX_PER_CLASS, len(by_view["whole"]) + len(by_view["closeup"]))
        n_close = min(len(by_view["closeup"]), int(MAX_CLOSEUP_SHARE * target))
        n_whole = min(len(by_view["whole"]), target - n_close)
        n_close = min(n_close, int(MAX_CLOSEUP_SHARE / (1 - MAX_CLOSEUP_SHARE) * n_whole))
        for view, n in (("whole", n_whole), ("closeup", n_close)):
            items = by_view[view][:n]
            n_train = round(n * FRACTIONS["train"])
            n_val = round(n * FRACTIONS["val"])
            for k, r in enumerate(items):
                split = "train" if k < n_train else "val" if k < n_train + n_val else "test"
                out.append({"file": r["file"], "class": cls, "view": view, "split": split, "licence": r["licence"]})
        mine = [o for o in out if o["class"] == cls]
        c = Counter(o["split"] for o in mine)
        counts[cls].update(used=len(mine), whole=n_whole, closeup=n_close,
                           train=c["train"], val=c["val"], test=c["test"])

    out.sort(key=lambda r: (r["class"], r["split"], r["file"]))
    with SPLIT.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=["file", "class", "view", "split"])
        w.writeheader()
        w.writerows({k: r[k] for k in ("file", "class", "view", "split")} for r in out)

    totals = {k: sum(c.get(k, 0) for c in counts.values()) for k in
              ("candidates", "after_review", "after_dedup", "used", "whole", "closeup", "train", "val", "test")}
    result = {
        "script": "ml/scripts/split.py",
        "hamming_limit": HAMMING_LIMIT,
        "max_per_class": MAX_PER_CLASS,
        "max_closeup_share": MAX_CLOSEUP_SHARE,
        "seed": SEED,
        "duplicates_removed": len(kept) - len(unique),
        "cross_class_duplicates_dropped": cross_class,
        "totals": totals,
        "licences_used": dict(Counter(r["licence"] or "unknown" for r in out).most_common()),
        "per_class": dict(sorted(counts.items())),
    }
    COUNTS.parent.mkdir(parents=True, exist_ok=True)
    COUNTS.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(totals))
    for cls, c in sorted(counts.items()):
        print(f"{cls:<18} {c}")


if __name__ == "__main__":
    main()
