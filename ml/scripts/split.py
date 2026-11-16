"""Build the final dataset: apply the review, remove near-duplicates, cap each class, split 70/15/15.

Each kept image is a "whole" object view or an identifiable "closeup" (tagged in review).
Close-ups are capped at 30% of a class, and the split is made separately for each view type,
so validation and test both contain whole objects and close-ups in the same proportion.

Short classes (fewer than SHORT_CLASS_MIN images under the normal rules) may use zoomed-in views
that were first rejected as "ambiguous" and then re-admitted on a second look
(ml/data/review_readmitted.csv), and their close-ups may make up to 60% of the class. Users often
upload zoomed-in photos, and these classes have too few whole-object images. Accuracy is still
reported separately for whole objects and close-ups.

Duplicates are found by comparing images with their EfficientNet-B0 features (the
ImageNet-pretrained network, before any training on our data), using cosine similarity:
  - at least DUPLICATE_SIMILARITY (0.985): the same picture (copy, resize, re-encode). Only one is kept.
  - at least FEATURE_SIMILARITY (0.95): versions of one picture (other crops or colours). All are
    kept, but as one group that always goes into the same part of the split.
  - a duplicate or group that spans two classes is ambiguous and dropped.
This happens BEFORE splitting, so the same picture cannot land in both training and test.
The thresholds were chosen by looking at sample pairs: above 0.95, pairs were almost always the same
picture; at 0.90 different photos of the same object (e.g. all EPIC Earth images) chained together.
A 64-bit difference hash (dHash) was tried first and rejected: on dark space images it matched
unrelated pictures (a Beehive star field "matched" M13, Jupiter and the Moon; 1,515 false
cross-class pairs), while the feature similarity found no cross-class pairs at all.

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

DUPLICATE_SIMILARITY = 0.985  # cosine similarity of EfficientNet-B0 features: same picture, keep one
FEATURE_SIMILARITY = 0.95  # versions of one picture: kept, but in the same part of the split
MAX_PER_CLASS = 150
MAX_CLOSEUP_SHARE = 0.30  # close-ups may be at most 30% of a class
SHORT_CLASS_MIN = 80  # the plan's minimum per class
SHORT_CLASS_CLOSEUP_SHARE = 0.60  # close-up limit for classes below SHORT_CLASS_MIN
MIN_CLASS_IMAGES = 50  # a class with fewer usable images is left out of the classifier (author's decision)
READMITTED = ROOT / "ml" / "data" / "review_readmitted.csv"
FRACTIONS = {"train": 0.70, "val": 0.15}  # test gets the rest (about 15%)
SEED = 0


def feature_similarity(paths: list[Path]):
    """Cosine similarity of EfficientNet-B0 (ImageNet) features for every pair of images."""
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
    return (f @ f.T).cpu()


def groups_at(sim, threshold: float) -> list[int]:
    """Group id per image: pairs with similarity >= threshold are joined (transitively)."""
    import torch

    parent = list(range(sim.shape[0]))

    def find(a: int) -> int:
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    pairs = (torch.triu(sim, diagonal=1) >= threshold).nonzero().tolist()
    for a, b in pairs:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra
    return [find(i) for i in range(sim.shape[0])]


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
    readmitted: dict[str, str] = {}
    if READMITTED.exists():
        with READMITTED.open(encoding="utf-8") as fh:
            readmitted = {r["file"]: r["class"] for r in csv.DictReader(fh)}
    for r in rows:
        r["view"] = "closeup" if (r["file"] in closeups or r["file"] in readmitted) else "whole"

    counts: dict[str, dict[str, int]] = defaultdict(dict)
    for r in rows:
        counts[r["class"]]["candidates"] = counts[r["class"]].get("candidates", 0) + 1
    licence_rejected = [r for r in rows if not licence_ok(r["licence"], r.get("author", ""))]
    for r in licence_rejected:
        counts[r["class"]]["excluded_licence"] = counts[r["class"]].get("excluded_licence", 0) + 1
    # Which classes are short under the normal rules (re-admitted views not counted)?
    normal = [r for r in rows if r["file"] in reviewed and r["file"] not in excluded]
    short_classes = set()
    for cls in {r["class"] for r in rows}:
        w = sum(r["class"] == cls and r["view"] == "whole" for r in normal)
        c = sum(r["class"] == cls and r["view"] == "closeup" for r in normal)
        n = min(MAX_PER_CLASS, w + c)
        nc = min(c, int(MAX_CLOSEUP_SHARE * n))
        nw = min(w, n - nc)
        nc = min(nc, int(MAX_CLOSEUP_SHARE / (1 - MAX_CLOSEUP_SHARE) * nw))
        if nw + nc < SHORT_CLASS_MIN:
            short_classes.add(cls)
    # Re-admitted zoomed-in views are only used for short classes.
    excluded = {f for f in excluded if not (f in readmitted and readmitted[f] in short_classes)}
    kept = [r for r in rows if r["file"] in reviewed and r["file"] not in excluded
            and licence_ok(r["licence"], r.get("author", "")) and (IMAGES / r["class"] / r["file"]).exists()]
    for cls in counts:
        counts[cls]["after_review"] = sum(r["class"] == cls for r in kept)

    # Duplicates (same picture), compared across ALL classes. Keep the first of each duplicate set
    # (by file name); if a set spans two classes the picture is ambiguous, so the whole set is dropped.
    kept.sort(key=lambda r: r["file"])
    sim = feature_similarity([IMAGES / r["class"] / r["file"] for r in kept])
    dup = groups_at(sim, DUPLICATE_SIMILARITY)
    members: dict[int, list[int]] = defaultdict(list)
    for j, g in enumerate(dup):
        members[g].append(j)
    unique_idx = []
    cross_class = 0
    for g, idx in members.items():
        if len({kept[j]["class"] for j in idx}) > 1:
            cross_class += len(idx)
            continue
        unique_idx.append(min(idx))
    unique_idx.sort()
    unique = [kept[j] for j in unique_idx]
    for cls in counts:
        counts[cls]["after_dedup"] = sum(r["class"] == cls for r in unique)

    # Deep-feature groups (crops and colour versions of one picture). A group spanning two
    # classes is ambiguous and dropped, like the dHash rule above.
    gid = groups_at(sim[unique_idx][:, unique_idx], FEATURE_SIMILARITY)
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
    out: list[dict] = []
    for cls in sorted(counts):
        # Each class gets its own seeded shuffle, so adding or removing other classes never
        # changes this class's train/val/test split.
        rng = random.Random(f"{SEED}-{cls}")
        by_view: dict[str, list[list[dict]]] = {"whole": [], "closeup": []}
        for members in sorted((m for m in groups if m[0]["class"] == cls), key=lambda m: m[0]["file"]):
            views = Counter(r["view"] for r in members)
            by_view["closeup" if views["closeup"] > views["whole"] else "whole"].append(members)
        for view in by_view:
            rng.shuffle(by_view[view])
        avail = {v: sum(len(m) for m in by_view[v]) for v in by_view}
        share = SHORT_CLASS_CLOSEUP_SHARE if cls in short_classes else MAX_CLOSEUP_SHARE
        target = min(MAX_PER_CLASS, avail["whole"] + avail["closeup"])
        quota_close = min(avail["closeup"], int(share * target))
        quota_whole = min(avail["whole"], target - quota_close)
        quota_close = min(quota_close, int(share / (1 - share) * quota_whole))
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
        counts[cls]["short_class"] = cls in short_classes
        counts[cls].update(used=len(mine), whole=used["whole"], closeup=used["closeup"],
                           train=c["train"], val=c["val"], test=c["test"])

    # Classes that still have too few images are left out of the classifier (they stay in the 3D scene).
    dropped_classes = sorted(c for c in counts if counts[c].get("used", 0) < MIN_CLASS_IMAGES)
    for c in dropped_classes:
        counts[c]["dropped_from_classifier"] = True
    out = [o for o in out if o["class"] not in dropped_classes]
    out.sort(key=lambda r: (r["class"], r["split"], r["file"]))
    with SPLIT.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=["file", "class", "view", "split"])
        w.writeheader()
        w.writerows({k: r[k] for k in ("file", "class", "view", "split")} for r in out)

    totals = {k: sum(c.get(k, 0) for cl, c in counts.items() if cl not in dropped_classes) for k in
              ("candidates", "after_review", "after_dedup", "used", "whole", "closeup", "train", "val", "test")}
    result = {
        "script": "ml/scripts/split.py",
        "duplicate_similarity": DUPLICATE_SIMILARITY,
        "feature_similarity": FEATURE_SIMILARITY,
        "images_in_similarity_groups": grouped_images,
        "cross_class_similar_images_dropped": cross_class_groups,
        "max_per_class": MAX_PER_CLASS,
        "max_closeup_share": MAX_CLOSEUP_SHARE,
        "short_class_min": SHORT_CLASS_MIN,
        "short_class_closeup_share": SHORT_CLASS_CLOSEUP_SHARE,
        "short_classes": sorted(short_classes),
        "min_class_images": MIN_CLASS_IMAGES,
        "dropped_classes": dropped_classes,
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
