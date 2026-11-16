"""Final evaluation on the held-out test set, the confidence threshold, and the unknown-object test.

- Table A: top-1 and top-3 accuracy and macro F1 on the test set, for both trained models.
- Table B: per-class precision, recall and F1 of the main model (with augmentation).
- Accuracy per view type: whole objects, identifiable close-ups, and all test images.
- Confusion matrix image and the most-confused pairs.
- Confidence threshold, chosen on the VALIDATION set only: the 5th percentile of the top-1
  confidence over correctly classified validation images (so about 95% of correct answers pass).
- Unknown-object test: share of out-of-class photos that fall below that threshold.

Writes ml/results/metrics.json, ml/results/confusion_matrix.png and backend/app/data/classifier.json.

Usage (from the project root, after both training runs):
    python ml/scripts/evaluate.py
"""

import csv
import json
import math
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import torch  # noqa: E402
from PIL import Image  # noqa: E402
from sklearn.metrics import classification_report, confusion_matrix, f1_score  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
from app.cv.classifier import IMAGE_SIZE, MEAN, RESIZE, STD, build_model, eval_transform  # noqa: E402

RAW = ROOT / "ml" / "data" / "raw"
SPLIT = ROOT / "ml" / "data" / "split.csv"
MANIFEST = ROOT / "ml" / "data" / "manifest.csv"
EXCLUDED = ROOT / "ml" / "data" / "review_excluded.csv"
OBJECTS = ROOT / "backend" / "app" / "data" / "objects.json"
WEIGHTS = ROOT / "backend" / "weights"
RESULTS = ROOT / "ml" / "results"
CLASSIFIER_JSON = ROOT / "backend" / "app" / "data" / "classifier.json"

RUNS = {"without augmentation": "efficientnet_b0_noaug", "with augmentation": "efficientnet_b0_aug"}
MAIN_RUN = "efficientnet_b0_aug"  # decided before testing: the augmented model is the one the app uses
THRESHOLD_PERCENTILE = 5


@torch.no_grad()
def probabilities(model, paths: list[Path], device) -> np.ndarray:
    tf = eval_transform()
    out = []
    for i in range(0, len(paths), 64):
        x = torch.stack([tf(Image.open(p).convert("RGB")) for p in paths[i:i + 64]]).to(device)
        out.append(torch.softmax(model(x), dim=1).cpu().numpy())
    return np.concatenate(out)


def load(run: str, classes: list[str], device):
    ckpt = torch.load(WEIGHTS / f"{run}.pt", map_location=device)
    assert ckpt["classes"] == classes
    model = build_model(len(classes))
    model.load_state_dict(ckpt["state_dict"])
    return model.to(device).eval()


def main() -> None:
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    objects = json.loads(OBJECTS.read_text(encoding="utf-8"))
    classes = [o["id"] for o in objects]
    names = {o["id"]: o["name"] for o in objects}

    with SPLIT.open(encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    part = {s: [r for r in rows if r["split"] == s] for s in ("train", "val", "test")}
    paths = {s: [RAW / "images" / r["class"] / r["file"] for r in part[s]] for s in part}
    labels = {s: np.array([classes.index(r["class"]) for r in part[s]]) for s in part}
    test_view = np.array([r["view"] for r in part["test"]])

    excluded = set()
    if EXCLUDED.exists():
        with EXCLUDED.open(encoding="utf-8") as fh:
            excluded = {r["file"] for r in csv.DictReader(fh)}
    unknown_rows = []
    for manifest in (MANIFEST, MANIFEST.with_name("manifest_unknown.csv")):  # Wikimedia, then archive unknowns
        if manifest.exists():
            with manifest.open(encoding="utf-8") as fh:
                unknown_rows += [r for r in csv.DictReader(fh) if r["set"] == "unknown" and r["file"] not in excluded]
    unknown_paths = [RAW / "unknown" / r["file"] for r in unknown_rows]

    def slice_scores(p: np.ndarray) -> dict:
        y = labels["test"]
        hit1 = p.argmax(1) == y
        hit3 = (np.argsort(-p, axis=1)[:, :3] == y[:, None]).any(1)
        out = {}
        for name, mask in (("whole", test_view == "whole"), ("closeup", test_view == "closeup"),
                           ("all", np.ones(len(y), bool))):
            n = int(mask.sum())
            out[name] = {"images": n,
                         "top1_accuracy_pct": round(100 * float(hit1[mask].mean()), 1) if n else None,
                         "top3_accuracy_pct": round(100 * float(hit3[mask].mean()), 1) if n else None}
        return out

    table_a = []
    by_view = {}
    main_probs = {}
    for label, run in RUNS.items():
        model = load(run, classes, device)
        p_test = probabilities(model, paths["test"], device)
        pred = p_test.argmax(1)
        top3 = np.argsort(-p_test, axis=1)[:, :3]
        train_info = json.loads((RESULTS / f"train_{run}.json").read_text(encoding="utf-8"))
        table_a.append({
            "model": f"EfficientNet-B0 {label}",
            "run": run,
            "top1_accuracy_pct": round(100 * float((pred == labels["test"]).mean()), 1),
            "top3_accuracy_pct": round(100 * float((top3 == labels["test"][:, None]).any(1).mean()), 1),
            "macro_f1": round(float(f1_score(labels["test"], pred, average="macro")), 3),
            "training_minutes": train_info["training_minutes"],
            "best_epoch": train_info["best_epoch"],
        })
        by_view[run] = slice_scores(p_test)
        if run == MAIN_RUN:
            main_probs = {"test": p_test, "val": probabilities(model, paths["val"], device),
                          "unknown": probabilities(model, unknown_paths, device)}
        print(table_a[-1])

    # Threshold from the validation set only.
    p_val = main_probs["val"]
    correct_val = p_val.argmax(1) == labels["val"]
    conf_val = p_val.max(1)
    threshold = math.floor(float(np.percentile(conf_val[correct_val], THRESHOLD_PERCENTILE)) * 100) / 100

    p_test = main_probs["test"]
    pred = p_test.argmax(1)
    conf_test = p_test.max(1)
    accepted = conf_test >= threshold
    report = classification_report(labels["test"], pred, labels=list(range(len(classes))), target_names=classes,
                                   output_dict=True, zero_division=0)
    cm = confusion_matrix(labels["test"], pred, labels=list(range(len(classes))))
    pairs = [(int(cm[i, j]), classes[i], classes[j]) for i in range(len(classes)) for j in range(len(classes))
             if i != j and cm[i, j] > 0]
    pairs.sort(reverse=True)

    p_unk = main_probs["unknown"]
    unknown_items = []
    for r, p in zip(unknown_rows, p_unk):
        k = int(p.argmax())
        unknown_items.append({"file": r["file"], "source_category": r["class"], "top1": classes[k],
                              "confidence": round(float(p[k]), 3), "rejected": bool(p[k] < threshold)})
    by_source: dict[str, list[dict]] = {}
    for u in unknown_items:
        by_source.setdefault(u["source_category"], []).append(u)

    per_class = []
    for i, c in enumerate(classes):
        r = report[c]
        per_class.append({
            "class": c, "name": names[c],
            "train_images": int((labels["train"] == i).sum()),
            "val_images": int((labels["val"] == i).sum()),
            "test_images": int((labels["test"] == i).sum()),
            "precision": round(r["precision"], 3), "recall": round(r["recall"], 3), "f1": round(r["f1-score"], 3),
        })

    metrics = {
        "script": "ml/scripts/evaluate.py",
        "device": torch.cuda.get_device_name(0) if device.type == "cuda" else "cpu",
        "main_model": MAIN_RUN,
        "test_images": len(part["test"]),
        "table_a": table_a,
        "accuracy_by_view": by_view,
        "per_class": per_class,
        "most_confused_pairs": [{"true": t, "predicted": p, "count": n} for n, t, p in pairs[:8]],
        "threshold": {
            "value": threshold,
            "rule": f"{THRESHOLD_PERCENTILE}th percentile of top-1 confidence on correctly classified validation images",
            "val_images": len(part["val"]),
            "test_share_accepted_pct": round(100 * float(accepted.mean()), 1),
            "test_accuracy_of_accepted_pct": round(100 * float((pred[accepted] == labels["test"][accepted]).mean()), 1),
            "test_correct_but_rejected": int(((pred == labels["test"]) & ~accepted).sum()),
            "test_wrong_but_accepted": int(((pred != labels["test"]) & accepted).sum()),
        },
        "unknown_test": {
            "images": len(unknown_items),
            "rejected": sum(u["rejected"] for u in unknown_items),
            "rejected_pct": round(100 * sum(u["rejected"] for u in unknown_items) / max(1, len(unknown_items)), 1),
            "by_source": {s: {"images": len(v), "rejected": sum(u["rejected"] for u in v)} for s, v in by_source.items()},
            "items": unknown_items,
        },
    }
    (RESULTS / "metrics.json").write_text(json.dumps(metrics, indent=2) + "\n", encoding="utf-8")

    # Confusion matrix image (rows: true class, columns: predicted class).
    fig, ax = plt.subplots(figsize=(11, 10))
    ax.imshow(cm, cmap="Blues")
    ax.set_xticks(range(len(classes)), [names[c] for c in classes], rotation=60, ha="right", fontsize=8)
    ax.set_yticks(range(len(classes)), [names[c] for c in classes], fontsize=8)
    for i in range(len(classes)):
        for j in range(len(classes)):
            if cm[i, j]:
                ax.text(j, i, cm[i, j], ha="center", va="center", fontsize=7,
                        color="white" if cm[i, j] > cm.max() / 2 else "black")
    ax.set_xlabel("Predicted class")
    ax.set_ylabel("True class")
    ax.set_title(f"Confusion matrix, test set ({len(part['test'])} images), {MAIN_RUN}")
    fig.tight_layout()
    fig.savefig(RESULTS / "confusion_matrix.png", dpi=130)

    CLASSIFIER_JSON.write_text(json.dumps({
        "model": "EfficientNet-B0",
        "weights_file": f"{MAIN_RUN}.pt",
        "classes": classes,
        "image_size": IMAGE_SIZE,
        "resize": RESIZE,
        "mean": MEAN,
        "std": STD,
        "threshold": threshold,
        "threshold_source": "ml/results/metrics.json (chosen on the validation set)",
    }, indent=2) + "\n", encoding="utf-8")

    print(f"threshold {threshold}; unknown rejected {metrics['unknown_test']['rejected']}/{len(unknown_items)}")
    print("most confused:", metrics["most_confused_pairs"][:5])


if __name__ == "__main__":
    main()
