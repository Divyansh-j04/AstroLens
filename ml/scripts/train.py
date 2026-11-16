"""Train the 20-class classifier: EfficientNet-B0 with transfer learning.

Stage 1 (head only): the ImageNet backbone is frozen and only the new 20-class layer learns.
Stage 2 (fine-tune): every layer learns, with a smaller learning rate that decays on a cosine
curve. Early stopping keeps the epoch with the lowest validation loss. The test set is never
used here.

Writes:
    backend/weights/<run>.pt                 trained weights (not committed)
    ml/results/train_<run>.json              settings, per-epoch history, best epoch, time taken
    ml/results/training_curve_<run>.png      loss and accuracy per epoch

Usage (from the project root; uses the GPU if there is one, also runs on Google Colab):
    python ml/scripts/train.py                  # with augmentation (the model the app uses)
    python ml/scripts/train.py --no-augment     # comparison row for REPORT.md Table A
"""

import argparse
import copy
import csv
import json
import random
import sys
import time
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import torch  # noqa: E402
from PIL import Image  # noqa: E402
from torch import nn  # noqa: E402
from torch.utils.data import DataLoader, Dataset  # noqa: E402
from torchvision import transforms  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
from app.cv.classifier import IMAGE_SIZE, MEAN, RESIZE, STD, build_model, eval_transform  # noqa: E402

IMAGES = ROOT / "ml" / "data" / "raw" / "images"
SPLIT = ROOT / "ml" / "data" / "split.csv"
OBJECTS = ROOT / "backend" / "app" / "data" / "objects.json"
WEIGHTS = ROOT / "backend" / "weights"
RESULTS = ROOT / "ml" / "results"

CROP_SCALE = (0.25, 1.0)  # random crop keeps 25-100% of the image area

SETTINGS = {
    "backbone": "EfficientNet-B0 (torchvision, ImageNet-1k weights)",
    "image_size": IMAGE_SIZE,
    "batch_size": 32,
    "head_epochs": 5,
    "head_lr": 3e-4,
    "finetune_epochs": 15,
    "finetune_lr": 1e-4,
    "weight_decay": 1e-4,
    "label_smoothing": 0.1,
    "early_stopping_patience": 4,
    "optimizer": "AdamW",
    "schedule": "cosine decay during fine-tuning",
    "seed": 0,
    "augmentation": "random resized crop (25-100% of area), horizontal and vertical flip, rotation up to 180 deg, "
                    "colour jitter (brightness/contrast/saturation 0.3, hue 0.05), grayscale 10%",
}


def train_transform() -> transforms.Compose:
    """Augmentation: random crops down to 25% of the image (zoomed-in, close-up-like views),
    flips, any rotation (space has no 'up'), colour changes, some grey."""
    return transforms.Compose([
        transforms.RandomResizedCrop(IMAGE_SIZE, scale=CROP_SCALE),
        transforms.RandomHorizontalFlip(),
        transforms.RandomVerticalFlip(),
        transforms.RandomRotation(180),
        transforms.ColorJitter(brightness=0.3, contrast=0.3, saturation=0.3, hue=0.05),
        transforms.RandomGrayscale(p=0.1),
        transforms.ToTensor(),
        transforms.Normalize(MEAN, STD),
    ])


class Images(Dataset):
    """Images decoded once into memory (shorter side 256 px), transformed on each access."""

    def __init__(self, rows: list[dict], classes: list[str], transform: transforms.Compose) -> None:
        self.labels = [classes.index(r["class"]) for r in rows]
        self.images = []
        for r in rows:
            img = Image.open(IMAGES / r["class"] / r["file"]).convert("RGB")
            img = transforms.Resize(RESIZE)(img)
            self.images.append(img)
        self.transform = transform

    def __len__(self) -> int:
        return len(self.images)

    def __getitem__(self, i: int) -> tuple[torch.Tensor, int]:
        return self.transform(self.images[i]), self.labels[i]


def run_epoch(model, loader, loss_fn, device, optimizer=None) -> tuple[float, float]:
    training = optimizer is not None
    model.train(training)
    total_loss, correct, n = 0.0, 0, 0
    with torch.set_grad_enabled(training):
        for x, y in loader:
            x, y = x.to(device), y.to(device)
            logits = model(x)
            loss = loss_fn(logits, y)
            if training:
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()
            total_loss += loss.item() * len(y)
            correct += (logits.argmax(1) == y).sum().item()
            n += len(y)
    return total_loss / n, correct / n


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-augment", action="store_true", help="train without data augmentation")
    args = ap.parse_args()
    augment = not args.no_augment
    run = "efficientnet_b0_aug" if augment else "efficientnet_b0_noaug"

    seed = SETTINGS["seed"]
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    with SPLIT.open(encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    # Classes in objects.json order, minus any left out by split.py for having too few images.
    present = {r["class"] for r in rows}
    classes = [o["id"] for o in json.loads(OBJECTS.read_text(encoding="utf-8")) if o["id"] in present]
    train_rows = [r for r in rows if r["split"] == "train"]
    val_rows = [r for r in rows if r["split"] == "val"]
    print(f"{run}: {len(train_rows)} train, {len(val_rows)} val images, device {device}")

    train_ds = Images(train_rows, classes, train_transform() if augment else eval_transform())
    val_ds = Images(val_rows, classes, eval_transform())
    g = torch.Generator().manual_seed(seed)
    train_dl = DataLoader(train_ds, batch_size=SETTINGS["batch_size"], shuffle=True, generator=g)
    val_dl = DataLoader(val_ds, batch_size=64)

    model = build_model(len(classes), pretrained=True).to(device)
    loss_fn = nn.CrossEntropyLoss(label_smoothing=SETTINGS["label_smoothing"])
    history: list[dict] = []
    best = {"val_loss": float("inf"), "state": None, "epoch": 0}
    start = time.perf_counter()

    def log(stage: str, epoch: int, tr: tuple[float, float], va: tuple[float, float]) -> None:
        history.append({"epoch": epoch, "stage": stage, "train_loss": round(tr[0], 4), "train_acc": round(tr[1], 4),
                        "val_loss": round(va[0], 4), "val_acc": round(va[1], 4)})
        print(f"  {stage:<8} epoch {epoch:>2}  train loss {tr[0]:.3f} acc {tr[1]:.3f}  "
              f"val loss {va[0]:.3f} acc {va[1]:.3f}")
        if va[0] < best["val_loss"]:
            best.update(val_loss=va[0], state=copy.deepcopy(model.state_dict()), epoch=epoch)

    # Stage 1: only the new head learns.
    for p in model.features.parameters():
        p.requires_grad = False
    opt = torch.optim.AdamW(model.classifier.parameters(), lr=SETTINGS["head_lr"], weight_decay=SETTINGS["weight_decay"])
    epoch = 0
    for _ in range(SETTINGS["head_epochs"]):
        epoch += 1
        log("head", epoch, run_epoch(model, train_dl, loss_fn, device, opt), run_epoch(model, val_dl, loss_fn, device))

    # Stage 2: everything learns; stop early when validation loss stops improving.
    for p in model.parameters():
        p.requires_grad = True
    opt = torch.optim.AdamW(model.parameters(), lr=SETTINGS["finetune_lr"], weight_decay=SETTINGS["weight_decay"])
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=SETTINGS["finetune_epochs"])
    stopped_early = False
    for _ in range(SETTINGS["finetune_epochs"]):
        epoch += 1
        log("finetune", epoch, run_epoch(model, train_dl, loss_fn, device, opt), run_epoch(model, val_dl, loss_fn, device))
        sched.step()
        if epoch - best["epoch"] >= SETTINGS["early_stopping_patience"]:
            stopped_early = True
            print(f"  early stop: no val-loss improvement for {SETTINGS['early_stopping_patience']} epochs")
            break
    minutes = (time.perf_counter() - start) / 60

    WEIGHTS.mkdir(parents=True, exist_ok=True)
    torch.save({"classes": classes, "state_dict": best["state"], "run": run}, WEIGHTS / f"{run}.pt")

    best_row = next(h for h in history if h["epoch"] == best["epoch"])
    summary = {
        "run": run,
        "script": "ml/scripts/train.py" + ("" if augment else " --no-augment"),
        "augmentation": augment,
        "settings": SETTINGS,
        "device": torch.cuda.get_device_name(0) if device.type == "cuda" else "cpu",
        "torch_version": torch.__version__,
        "train_images": len(train_rows),
        "val_images": len(val_rows),
        "epochs_run": epoch,
        "stopped_early": stopped_early,
        "best_epoch": best["epoch"],
        "best_val_loss": best_row["val_loss"],
        "best_val_acc": best_row["val_acc"],
        "training_minutes": round(minutes, 2),
        "weights_file": f"backend/weights/{run}.pt",
        "history": history,
    }
    RESULTS.mkdir(parents=True, exist_ok=True)
    (RESULTS / f"train_{run}.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")

    fig, (a1, a2) = plt.subplots(1, 2, figsize=(10, 4))
    ep = [h["epoch"] for h in history]
    a1.plot(ep, [h["train_loss"] for h in history], label="train")
    a1.plot(ep, [h["val_loss"] for h in history], label="validation")
    a2.plot(ep, [h["train_acc"] for h in history], label="train")
    a2.plot(ep, [h["val_acc"] for h in history], label="validation")
    for a, name in ((a1, "Loss"), (a2, "Accuracy")):
        a.axvline(SETTINGS["head_epochs"] + 0.5, color="grey", ls=":", lw=1)
        a.axvline(best["epoch"], color="green", ls="--", lw=1, label=f"best (epoch {best['epoch']})")
        a.set_xlabel("epoch")
        a.set_title(name)
        a.legend()
    fig.suptitle(f"{run}: head only (epochs 1-{SETTINGS['head_epochs']}), then full fine-tune")
    fig.tight_layout()
    fig.savefig(RESULTS / f"training_curve_{run}.png", dpi=120)
    print(f"done in {minutes:.1f} min; best epoch {best['epoch']} val acc {best_row['val_acc']:.3f}")


if __name__ == "__main__":
    main()
