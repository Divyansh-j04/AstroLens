"""Grad-CAM: which parts of the photo made the model choose its answer.

How it works, in four steps:
1. Run the photo through the network and keep the output of the last convolution block
   (1280 feature maps of 7 x 7 cells; each map reacts to some pattern, such as rings or bands).
2. Ask PyTorch for the gradient of the chosen class's score with respect to those maps:
   how much the score would rise if each cell of each map were a little stronger.
3. Average each map's gradient into one weight (how important that map is for this class),
   add up the maps times their weights, and keep only the positive part (ReLU).
4. The 7 x 7 result is stretched to the photo's size, coloured (dark = ignored,
   yellow = decisive) and blended over the photo.

Reference: Selvaraju et al., "Grad-CAM: Visual Explanations from Deep Networks via
Gradient-based Localization", ICCV 2017. Written here with a PyTorch hook instead of the
pytorch-grad-cam package: one fewer dependency, and short enough to explain line by line.
"""

import io

import numpy as np
import torch
from PIL import Image
from torch import nn
from torch.nn import functional as F

# Colour scale for the heatmap: black -> purple -> red -> orange -> pale yellow ("inferno"-like).
_STOPS = np.array([[0, 0, 4], [87, 16, 110], [188, 55, 84], [249, 142, 9], [252, 255, 164]], dtype=np.float32)
HEAT_SHARE = 0.5  # how strongly the heatmap is blended over the photo


def forward_with_cam(model: nn.Module, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
    """One forward pass that returns the logits and the Grad-CAM map (7 x 7, values 0-1)
    for the top-1 class. `model` must be an EfficientNet (its `features` end in the last conv block)."""
    saved: dict[str, torch.Tensor] = {}
    hook = model.features[-1].register_forward_hook(lambda _m, _i, out: saved.__setitem__("maps", out))
    try:
        with torch.enable_grad():
            logits = model(x)
            top1 = int(logits[0].argmax())
            # Gradient of the top-1 score with respect to the feature maps only (no weight gradients).
            (grads,) = torch.autograd.grad(logits[0, top1], saved["maps"])
    finally:
        hook.remove()
    maps = saved["maps"].detach()[0]  # (1280, 7, 7)
    weights = grads[0].mean(dim=(1, 2))  # one importance weight per map
    cam = F.relu((weights[:, None, None] * maps).sum(dim=0))
    cam = cam / cam.max() if cam.max() > 0 else cam
    return logits.detach(), cam


def colourise(cam: np.ndarray) -> np.ndarray:
    """Map values 0-1 to RGB colours along _STOPS."""
    pos = np.clip(cam, 0, 1) * (len(_STOPS) - 1)
    lo = np.floor(pos).astype(int).clip(0, len(_STOPS) - 2)
    t = (pos - lo)[..., None]
    return (_STOPS[lo] * (1 - t) + _STOPS[lo + 1] * t).astype(np.uint8)


def overlay_png(photo: Image.Image, cam: torch.Tensor) -> bytes:
    """Blend the Grad-CAM map over `photo` (the same crop the model saw) and return PNG bytes."""
    w, h = photo.size
    big = F.interpolate(cam[None, None], size=(h, w), mode="bilinear", align_corners=False)[0, 0].cpu().numpy()
    heat = colourise(big).astype(np.float32)
    base = np.asarray(photo.convert("RGB"), dtype=np.float32)
    mixed = (base * (1 - HEAT_SHARE) + heat * HEAT_SHARE).clip(0, 255).astype(np.uint8)
    buf = io.BytesIO()
    Image.fromarray(mixed).save(buf, "PNG", optimize=True)
    return buf.getvalue()
