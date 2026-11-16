"""POST /classify: a good image gets a well-formed answer; bad uploads get a clear error."""

import base64
import csv
import io
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.main import MAX_UPLOAD_BYTES, app, get_classifier

ROOT = Path(__file__).resolve().parents[1]
SPLIT = ROOT / "ml" / "data" / "split.csv"
IMAGES = ROOT / "ml" / "data" / "raw" / "images"

client = TestClient(app)


def png_bytes(size: tuple[int, int] = (300, 300), colour: str = "black") -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, colour).save(buf, "PNG")
    return buf.getvalue()


def test_health_reports_the_model():
    body = client.get("/health").json()
    clf = get_classifier()
    assert body["model"] == (clf.name if clf else None)


def test_text_file_is_rejected():
    r = client.post("/classify", files={"file": ("notes.txt", b"hello, not a picture", "text/plain")})
    assert r.status_code == 415
    assert "not an image" in r.json()["detail"]


def test_text_file_pretending_to_be_an_image_is_rejected():
    r = client.post("/classify", files={"file": ("photo.jpg", b"hello, not a picture", "image/jpeg")})
    assert r.status_code == 415


def test_damaged_image_is_rejected():
    broken = png_bytes()[:200]  # a real PNG header, then the file stops
    r = client.post("/classify", files={"file": ("broken.png", broken, "image/png")})
    assert r.status_code == 400
    assert "damaged" in r.json()["detail"]


def test_file_over_8_mb_is_rejected():
    big = b"\xff\xd8\xff" + b"0" * MAX_UPLOAD_BYTES  # just over 8 MB
    r = client.post("/classify", files={"file": ("huge.jpg", big, "image/jpeg")})
    assert r.status_code == 413
    assert "8 MB" in r.json()["detail"]


def test_empty_file_is_rejected():
    r = client.post("/classify", files={"file": ("empty.png", b"", "image/png")})
    assert r.status_code == 400


needs_model = pytest.mark.skipif(get_classifier() is None, reason="trained weights are not installed")


@needs_model
def test_classify_returns_top3_heatmap_and_threshold():
    r = client.post("/classify", files={"file": ("black.png", png_bytes(), "image/png")})
    assert r.status_code == 200
    body = r.json()
    clf = get_classifier()
    assert len(body["top3"]) == 3
    probs = [g["prob"] for g in body["top3"]]
    assert probs == sorted(probs, reverse=True)
    assert {g["id"] for g in body["top3"]} <= set(clf.classes)
    assert body["threshold"] == clf.threshold
    assert body["is_unknown"] == (probs[0] < clf.threshold)
    assert body["known_classes"] == len(clf.classes)
    heat = Image.open(io.BytesIO(base64.b64decode(body["gradcam_png_base64"])))
    assert heat.size == (224, 224)


def a_test_photo(cls: str) -> Path | None:
    """One test-split photo of a class, if the (uncommitted) dataset is on this machine."""
    if not SPLIT.exists():
        return None
    with SPLIT.open(encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            if row["class"] == cls and row["split"] == "test" and row["view"] == "whole":
                path = IMAGES / cls / row["file"]
                if path.exists():
                    return path
    return None


@needs_model
@pytest.mark.skipif(a_test_photo("saturn") is None, reason="dataset images are not on this machine")
def test_known_saturn_photo_is_classified_as_saturn():
    path = a_test_photo("saturn")
    r = client.post("/classify", files={"file": (path.name, path.read_bytes(), "image/jpeg")})
    assert r.status_code == 200
    body = r.json()
    assert body["top3"][0]["id"] == "saturn"
    assert body["top3"][0]["name"] == "Saturn"  # name comes from objects.json
    assert not body["is_unknown"]
