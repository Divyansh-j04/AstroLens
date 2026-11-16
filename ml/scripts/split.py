"""Build the final dataset: apply the review, remove near-duplicates, cap each class, split 70/15/15.

Each kept image is a "whole" object view or an identifiable "closeup" (tagged in review).
Close-ups are capped at 30% of a class, and the split is made separately for each view type,
so validation and test both contain whole objects and close-ups in the same proportion.

Near-duplicates (the same picture resized, re-compressed or slightly re-edited) are found with a
difference hash (dHash): shrink the image to 9x8 grey pixels and record, for each pixel, whether it
is brighter than its right-hand neighbour. That gives 64 bits; two images whose bits differ in at
most HAMMING_LIMIT places are treated as the same picture. Removing them BEFORE splitting stops
the same picture landing in both training and test (test-set leakage).

dHash misses different crops or colour versions of one famous picture (e.g. several crops of the
Hubble Crab Nebula mosaic). So we also compare images by their EfficientNet-B0 features (the
ImageNet-pretrained network, before any training on our data): images whose feature similarity
(cosine) is at least FEATURE_SIMILARITY are put in one group, and a group always goes into the same
part of the split (all train, all validation or all test). 0.95 was chosen by looking at sample
pairs: above it, pairs were almost always the same picture; at 0.90 different photos of the same
object (e.g. all EPIC Earth images) chained into one large group.

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

from licences import licence_ok  # ml/scripts/licences.py: the agreed licence allowlist

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
FEATURE_SIMILARITY = 0.95  # cosine similarity of EfficientNet-B0 features; same group at or above
MAX_PER_CLASS = 150
MAX_CLOSEUP_SHARE = 0.30  # close-ups may be at most 30% of a class
FRACTIONS = {"train": 0.70, "val": 0.15}  # test gets the rest (about 15%)
SEED = 0


def dhash(path: Path) -> int:
    grey = np.asarray(Image.open(path).convert("L").resize((9, 8), Image.Resampling.LANCZOS), dtype=np.int16)
    bits = (grey[:, 1:] > grey[:, :-1]).flatten()
    return int("".join("1" if b else "0" for b in bits), 2)


def feature_groups(paths: list[Path]) -> list[int]:
    """Group id per image: images with deep-feature similarity >= FEATURE_SIMILARITY share a group."""
    import sys

    import torch
    from torchvision import models

    sys.path.insert(0, str(ROOT / "backend"))
    from app.cv.classifier import eval_transform

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    net = models.efficientnet_b0(weights=models.EfficientNet_B0_Weights.IMAGENET1K_V1)
    net.classifier = torch.nn.Identity()  # keep the 1280 features, drop the ImageNet classes
    net = net.to(device).eval()
    tf = eval_transform()
    feats = []
    with torch.no_grad():
        for i in range(0, len(paths), 64):
            x = torch.stack([tf(Image.open(q).convert("RGB")) for q in paths[i:i + 64]]).to(device)
            feats.append(torch.nn.functional.normalize(net(x), dim=1))
    f = torch.cat(feats)
    sim = (f @ f.T).cpu()
    parent = list(range(len(paths)))

    def find(a: int) -> int:
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    pairs = (torch.triu(sim, diagonal=1) >= FEATURE_SIMILARITY).nonzero().tolist()
    for a, b in pairs:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra
    return [find(i) for i in range(len(paths))]


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
    licence_rejected = [r for r in rows if not licence_ok(r["licence"], r.get("author", ""))]
    for r in licence_rejected:
        counts[r["class"]]["excluded_licence"] = counts[r["class"]].get("excluded_licence", 0) + 1
    kept = [r for r in rows if r["file"] in reviewed and r["file"] not in excluded
            and licence_ok(r["licence"], r.get("author", "")) and (IMAGES / r["class"] / r["file"]).exists()]
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

    # Deep-feature groups (crops and colour versions of one picture). A group spanning two
    # classes is ambiguous and dropped, like the dHash rule above.
    unique.sort(key=lambda r: r["file"])
    gid = feature_groups([IMAGES / r["class"] / r["file"] for r in unique])
    by_group: dict[int, list[dict]] = defaultdict(list)
    for r, g in zip(unique, gid):
        by_group[g].append(r)
    groups = []
    cross_class_groups = 0
    for g, members in by_group.items():
        if len({r["class"] for r in members}) > 1:
            cross_class_groups += len(members)
            continue
        groups.append(members)
    grouped_images = sum(len(m) for m in groups if len(m) > 1)

    # Cap (close-ups at most 30%), then split each view type 70/15/15 by whole groups, fixed seed.
    rng = random.Random(SEED)
    out: list[dict] = []
    for cls in sorted(counts):
        by_view: dict[str, list[list[dict]]] = {"whole": [], "closeup": []}
        for members in sorted((m for m in groups if m[0]["class"] == cls), key=lambda m: m[0]["file"]):
            views = Counter(r["view"] for r in members)
            by_view["closeup" if views["closeup"] > views["whole"] else "whole"].append(members)
        for view in by_view:
            rng.shuffle(by_view[view])
        avail = {v: sum(len(m) for m in by_view[v]) for v in by_view}
        target = min(MAX_PER_CLASS, avail["whole"] + avail["closeup"])
        quota_close = min(avail["closeup"], int(MAX_CLOSEUP_SHARE * target))
        quota_whole = min(avail["whole"], target - quota_close)
        quota_close = min(quota_close, int(MAX_CLOSEUP_SHARE / (1 - MAX_CLOSEUP_SHARE) * quota_whole))
        used = {}
        for view, quota in (("whole", quota_whole), ("closeup", quota_close)):
            chosen, n = [], 0
            for members in by_view[view]:
                if n + len(members) <= quota:
                    chosen.append(members)
                    n += len(members)
            used[view] = n
            done = 0
            for members in chosen:  # whole groups go to one split, filled in order train -> val -> test
                split = ("train" if done < FRACTIONS["train"] * n
                         else "val" if done < (FRACTIONS["train"] + FRACTIONS["val"]) * n else "test")
                for r in members:
                    out.append({"file": r["file"], "class": cls, "view": view, "split": split,
                                "licence": r["licence"]})
                done += len(members)
        mine = [o for o in out if o["class"] == cls]
        c = Counter(o["split"] for o in mine)
        counts[cls].update(used=len(mine), whole=used["whole"], closeup=used["closeup"],
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
        "feature_similarity": FEATURE_SIMILARITY,
        "images_in_similarity_groups": grouped_images,
        "cross_class_similar_images_dropped": cross_class_groups,
        "max_per_class": MAX_PER_CLASS,
        "max_closeup_share": MAX_CLOSEUP_SHARE,
        "seed": SEED,
        "licence_rule": "allowed: public domain, CC0, CC BY, CC BY-SA, NASA works (ml/scripts/licences.py)",
        "excluded_by_licence": len(licence_rejected),
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
