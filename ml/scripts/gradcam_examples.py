"""Six Grad-CAM examples for REPORT.md: what the app's model looks at on test photos.

Picks, in a fixed way, from the TEST split with the model the app uses (backend/app/data/classifier.json):
  - five correct answers: the first test photo (by file name) of Jupiter, Saturn (a close-up),
    the Moon, the Orion Nebula and the Crab Nebula that the model gets right;
  - one mistake: the first wrong test answer, to show what misled the model.
Each example is the photo as the model saw it (centre crop) next to the heatmap overlay.

Writes ml/results/gradcam/gradcam_examples.png (grid of 6) and ml/results/gradcam/examples.json.
Usage (from the project root):
    python ml/scripts/gradcam_examples.py
"""

import base64
import csv
import io
import json
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from PIL import Image  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
from app.cv.classifier import Classifier, crop  # noqa: E402

IMAGES = ROOT / "ml" / "data" / "raw" / "images"
SPLIT = ROOT / "ml" / "data" / "split.csv"
OBJECTS = ROOT / "backend" / "app" / "data" / "objects.json"
OUT = ROOT / "ml" / "results" / "gradcam"
WANTED = [("jupiter", "whole"), ("saturn", "closeup"), ("moon", "whole"), ("orion_nebula", "whole"), ("crab_nebula", "whole")]


def main() -> None:
    clf = Classifier()
    names = {o["id"]: o["name"] for o in json.loads(OBJECTS.read_text(encoding="utf-8"))}
    with SPLIT.open(encoding="utf-8") as fh:
        test = sorted((r for r in csv.DictReader(fh) if r["split"] == "test"), key=lambda r: r["file"])

    picked: list[dict] = []
    for cls, view in WANTED:
        for r in test:
            if r["class"] == cls and r["view"] == view:
                top, png = clf.classify(Image.open(IMAGES / cls / r["file"]))
                if top[0][0] == cls:
                    picked.append({**r, "top3": top, "png": png, "correct": True})
                    break
    for r in test:
        top, png = clf.classify(Image.open(IMAGES / r["class"] / r["file"]))
        if top[0][0] != r["class"]:
            picked.append({**r, "top3": top, "png": png, "correct": False})
            break

    OUT.mkdir(parents=True, exist_ok=True)
    fig, axes = plt.subplots(len(picked), 2, figsize=(6.4, 3.2 * len(picked)))
    for row, ex in zip(axes, picked):
        photo = crop(Image.open(IMAGES / ex["class"] / ex["file"]))
        heat = Image.open(io.BytesIO(base64.b64decode(ex["png"])))
        guess, prob = ex["top3"][0]
        row[0].imshow(photo)
        row[0].set_title(f"{names[ex['class']]} ({'close-up' if ex['view'] == 'closeup' else 'whole'})", fontsize=9)
        row[1].imshow(heat)
        verdict = "correct" if ex["correct"] else "WRONG"
        row[1].set_title(f"guess: {names[guess]} {prob:.0%} ({verdict})", fontsize=9)
        for a in row:
            a.axis("off")
    fig.suptitle(f"Grad-CAM on test photos, model {clf.name}\nbright = mattered most for the top guess", fontsize=10)
    fig.tight_layout(rect=(0, 0, 1, 0.97))  # leave room for the title
    fig.savefig(OUT / "gradcam_examples.png", dpi=110)

    summary = {
        "script": "ml/scripts/gradcam_examples.py",
        "model": clf.name,
        "examples": [{"file": e["file"], "class": e["class"], "view": e["view"], "correct": e["correct"],
                      "top3": [{"id": c, "prob": round(p, 3)} for c, p in e["top3"]]} for e in picked],
    }
    (OUT / "examples.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    for e in summary["examples"]:
        print(e["class"], e["view"], "->", e["top3"][0], "correct" if e["correct"] else "WRONG")


if __name__ == "__main__":
    main()
