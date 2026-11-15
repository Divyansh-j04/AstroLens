"""The 3D page loads one image per object from frontend/public/textures/<id>.jpg."""

from pathlib import Path

from PIL import Image

from app.main import load_objects

TEXTURES = Path(__file__).resolve().parents[1] / "frontend" / "public" / "textures"


def test_every_object_has_a_real_jpeg():
    for obj in load_objects():
        path = TEXTURES / f"{obj.id}.jpg"
        assert path.exists(), f"missing scene image for {obj.id}: run ml/scripts/fetch_scene_images.py"
        with Image.open(path) as img:
            assert img.format == "JPEG", f"{path.name} is {img.format}, not JPEG"


def test_saturn_ring_texture_exists():
    assert (TEXTURES / "saturn_ring.png").exists()


def test_every_object_has_a_wikipedia_source():
    # the image script takes nebula and cluster pictures from this link
    for obj in load_objects():
        assert any("wikipedia.org/wiki/" in str(s) for s in obj.sources), obj.id
