"""Robustness check: which model copes better with messy, user-like photos?

Both trained models (with and without augmentation) are scored on the VALIDATION images, first
clean and then after one change at a time that a real upload might have: rotation, blur, darker
or brighter exposure, heavy JPEG compression, low resolution, sensor noise, grey, or a tight crop.
The test set is not used, so choosing the app's model from this check keeps the test scores fair.

Every change is fixed (no randomness except the noise, which has a fixed seed), so the result
is the same on every run.

Writes ml/results/robustness_val.json.

Usage (from the project root, after both training runs):
    python ml/scripts/robustness.py
"""

import csv
import io
import json
import sys
from pathlib import Path
from typing import Callable

import numpy as np
import torch
from PIL import Image, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
from app.cv.classifier import build_model, eval_transform  # noqa: E402

IMAGES = ROOT / "ml" / "data" / "raw" / "images"
SPLIT = ROOT / "ml" / "data" / "split.csv"
WEIGHTS = ROOT / "backend" / "weights"
OUT = ROOT / "ml" / "results" / "robustness_val.json"
RUNS = {"without augmentation": "efficientnet_b0_noaug", "with augmentation": "efficientnet_b0_aug"}


def jpeg(img: Image.Image, quality: int) -> Image.Image:
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=quality)
    return Image.open(io.BytesIO(buf.getvalue())).convert("RGB")


def low_res(img: Image.Image, side: int) -> Image.Image:
    small = img.copy()
    small.thumbnail((side, side))
    return small.resize(img.size, Image.BILINEAR)


def noise(img: Image.Image, sigma: float, seed: int) -> Image.Image:
    a = np.asarray(img).astype(np.float32)
    a += np.random.default_rng(seed).normal(0, sigma, a.shape)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def centre_crop(img: Image.Image, keep: float) -> Image.Image:
    w, h = img.size
    cw, ch = int(w * keep), int(h * keep)
    left, top = (w - cw) // 2, (h - ch) // 2
    return img.crop((left, top, left + cw, top + ch))


# name -> (what it imitates, change)
CHANGES: dict[str, tuple[str, Callable[[Image.Image, int], Image.Image]]] = {
    "clean": ("the photo as it is", lambda im, i: im),
    "rotated 45 deg": ("a tilted phone or telescope shot", lambda im, i: im.rotate(45, fillcolor=(0, 0, 0))),
    "rotated 90 deg": ("a sideways photo", lambda im, i: im.rotate(90, expand=True)),
    "blurred": ("out of focus or atmospheric shake", lambda im, i: im.filter(ImageFilter.GaussianBlur(3))),
    "darker (50%)": ("under-exposed", lambda im, i: ImageEnhance.Brightness(im).enhance(0.5)),
    "brighter (160%)": ("over-exposed", lambda im, i: ImageEnhance.Brightness(im).enhance(1.6)),
    "JPEG quality 10": ("a heavily compressed chat-app image", lambda im, i: jpeg(im, 10)),
    "low resolution (64 px)": ("a small or distant object, digitally zoomed", lambda im, i: low_res(im, 64)),
    "sensor noise": ("a grainy night-time phone photo", lambda im, i: noise(im, 25, i)),
    "grey": ("a black-and-white photo", lambda im, i: im.convert("L").convert("RGB")),
    "centre crop 50%": ("a zoomed-in close-up", lambda im, i: centre_crop(im, 0.5)),
}


def load(run: str, device) -> tuple[torch.nn.Module, list[str]]:
    ckpt = torch.load(WEIGHTS / f"{run}.pt", map_location=device)
    model = build_model(len(ckpt["classes"]))
    model.load_state_dict(ckpt["state_dict"])
    return model.to(device).eval(), ckpt["classes"]


@torch.no_grad()
def score(model, images: list[Image.Image], labels: np.ndarray, device) -> dict:
    tf = eval_transform()
    probs = []
    for i in range(0, len(images), 64):
        x = torch.stack([tf(im) for im in images[i:i + 64]]).to(device)
        probs.append(torch.softmax(model(x), dim=1).cpu().numpy())
    p = np.concatenate(probs)
    top3 = np.argsort(-p, axis=1)[:, :3]
    return {"top1_accuracy_pct": round(100 * float((top3[:, 0] == labels).mean()), 1),
            "top3_accuracy_pct": round(100 * float((top3 == labels[:, None]).any(axis=1).mean()), 1)}


def main() -> None:
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    with SPLIT.open(encoding="utf-8") as fh:
        rows = [r for r in csv.DictReader(fh) if r["split"] == "val"]
    originals = [Image.open(IMAGES / r["class"] / r["file"]).convert("RGB") for r in rows]

    models = {label: load(run, device) for label, run in RUNS.items()}
    classes = next(iter(models.values()))[1]
    assert all(c == classes for _, c in models.values()), "both runs must use the same classes"
    labels = np.array([classes.index(r["class"]) for r in rows])

    results = []
    for name, (meaning, change) in CHANGES.items():
        changed = [change(im, i) for i, im in enumerate(originals)]
        row = {"change": name, "imitates": meaning}
        for label, (model, _) in models.items():
            row[label] = score(model, changed, labels, device)
        results.append(row)
        print(f"{name:<24} " + "  ".join(f"{label}: {row[label]['top1_accuracy_pct']:5.1f}%" for label in RUNS))

    messy = [r for r in results if r["change"] != "clean"]
    mean = {label: round(sum(r[label]["top1_accuracy_pct"] for r in messy) / len(messy), 1) for label in RUNS}
    wins = {label: sum(r[label]["top1_accuracy_pct"] > r[other]["top1_accuracy_pct"] for r in messy)
            for label, other in zip(RUNS, reversed(list(RUNS)))}
    summary = {
        "script": "ml/scripts/robustness.py",
        "images": len(rows),
        "set": "validation (the test set is not used)",
        "device": torch.cuda.get_device_name(0) if device.type == "cuda" else "cpu",
        "results": results,
        "mean_top1_over_messy_changes_pct": mean,
        "messy_changes_won": wins,
        "messy_changes": len(messy),
    }
    OUT.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(f"mean top-1 over {len(messy)} messy changes: {mean}; changes won: {wins}")


if __name__ == "__main__":
    main()
