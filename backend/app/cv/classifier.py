"""The image classifier: EfficientNet-B0 with a 20-class head.

One place defines the model and the image preprocessing, so training (ml/scripts/train.py),
evaluation (ml/scripts/evaluate.py) and the server (Phase 3) all treat images the same way.
"""

import json
from pathlib import Path

import torch
from PIL import Image
from torch import nn
from torchvision import models, transforms

APP_DIR = Path(__file__).resolve().parents[1]
CONFIG_FILE = APP_DIR / "data" / "classifier.json"
WEIGHTS_DIR = APP_DIR.parent / "weights"

IMAGE_SIZE = 224  # EfficientNet-B0's input size
RESIZE = 256  # shorter side before the centre crop
MEAN = [0.485, 0.456, 0.406]  # ImageNet colour averages the backbone was trained with
STD = [0.229, 0.224, 0.225]


def build_model(num_classes: int, pretrained: bool = False) -> nn.Module:
    """EfficientNet-B0; with pretrained=True it starts from ImageNet weights (transfer learning)."""
    weights = models.EfficientNet_B0_Weights.IMAGENET1K_V1 if pretrained else None
    model = models.efficientnet_b0(weights=weights)
    model.classifier[1] = nn.Linear(model.classifier[1].in_features, num_classes)  # new 20-class head
    return model


def eval_transform() -> transforms.Compose:
    """Preprocessing for validation, test and real uploads: resize, centre crop, normalise."""
    return transforms.Compose([
        transforms.Resize(RESIZE),
        transforms.CenterCrop(IMAGE_SIZE),
        transforms.ToTensor(),
        transforms.Normalize(MEAN, STD),
    ])


class Classifier:
    """Loads the trained model once and returns the top guesses for an image."""

    def __init__(self, config_file: Path = CONFIG_FILE, weights_dir: Path = WEIGHTS_DIR) -> None:
        self.config = json.loads(config_file.read_text(encoding="utf-8"))
        self.classes: list[str] = self.config["classes"]
        self.threshold: float = self.config["threshold"]
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        checkpoint = torch.load(weights_dir / self.config["weights_file"], map_location=self.device)
        if checkpoint["classes"] != self.classes:
            raise ValueError("class order in the weights file does not match classifier.json")
        self.model = build_model(len(self.classes))
        self.model.load_state_dict(checkpoint["state_dict"])
        self.model.to(self.device).eval()
        self.transform = eval_transform()

    @torch.no_grad()
    def predict(self, image: Image.Image, k: int = 3) -> list[tuple[str, float]]:
        """Top-k (class id, probability) pairs, most likely first."""
        x = self.transform(image.convert("RGB")).unsqueeze(0).to(self.device)
        probs = torch.softmax(self.model(x), dim=1)[0]
        top = torch.topk(probs, k)
        return [(self.classes[i], float(p)) for p, i in zip(top.values, top.indices)]

    def is_unknown(self, top: list[tuple[str, float]]) -> bool:
        """True when even the best guess is below the confidence threshold chosen on validation data."""
        return top[0][1] < self.threshold
