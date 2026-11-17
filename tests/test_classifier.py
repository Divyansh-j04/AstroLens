"""The classifier's config must match objects.json, and predictions must be well formed."""

import json
from pathlib import Path

import pytest
import torch
from PIL import Image

from app.cv.classifier import CONFIG_FILE, IMAGE_SIZE, WEIGHTS_DIR, Classifier, build_model, eval_transform
from app.main import load_objects


def test_model_has_one_output_per_class():
    model = build_model(14).eval()  # the classifier knows 14 objects (classes left out had too few photos)
    x = eval_transform()(Image.new("RGB", (640, 480)))
    assert x.shape == (3, IMAGE_SIZE, IMAGE_SIZE)
    with torch.no_grad():
        assert model(x.unsqueeze(0)).shape == (1, 14)


@pytest.mark.skipif(not CONFIG_FILE.exists(), reason="classifier.json is written by ml/scripts/evaluate.py")
def test_classifier_config_matches_objects():
    config = json.loads(Path(CONFIG_FILE).read_text(encoding="utf-8"))
    ids = [o.id for o in load_objects()]
    assert set(config["classes"]) <= set(ids)  # classes with too few images may be left out
    assert config["classes"] == [i for i in ids if i in config["classes"]]  # objects.json order
    assert 0 < config["threshold"] < 1


@pytest.mark.skipif(
    not CONFIG_FILE.exists() or not (WEIGHTS_DIR / json.loads(CONFIG_FILE.read_text())["weights_file"]).exists(),
    reason="trained weights are not in git; run ml/scripts/train.py",
)
def test_prediction_is_top3_sorted_probabilities():
    clf = Classifier()
    top = clf.predict(Image.new("RGB", (500, 500), "black"))
    assert len(top) == 3
    probs = [p for _, p in top]
    assert probs == sorted(probs, reverse=True)
    assert all(0 <= p <= 1 for p in probs) and sum(probs) <= 1.0001
    assert {c for c, _ in top} <= set(clf.classes)
