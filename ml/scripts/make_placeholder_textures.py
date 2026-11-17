"""Plain-colour stand-in textures for moons whose real surface map has not been downloaded yet.

Each is a small 2:1 map (wrapped round the moon's sphere in the 3D scene) in the moon's rough
overall colour, with a little random mottling so the sphere does not look like plastic; Iapetus
gets its dark and bright halves. The colours are a display choice, not data.

Every file carries the JPEG comment "placeholder", so ml/scripts/fetch_scene_images.py replaces it
with the real map once Wikimedia allows the download; existing real maps are never overwritten.

Usage (from the project root):
    python ml/scripts/make_placeholder_textures.py
"""

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "frontend" / "public" / "textures"
SIZE = (512, 256)

COLOURS = {  # rough overall colour of each moon as seen by spacecraft
    "phobos": "#7d736a", "deimos": "#9a8f80", "io": "#d8c25a", "europa": "#d8cdb8", "ganymede": "#8e8577",
    "callisto": "#5e564c", "titan": "#d29a45", "enceladus": "#eef1f4", "mimas": "#bdbab3", "rhea": "#b8b4ad",
    "iapetus": "#e3ddd2", "miranda": "#a9a7a2", "ariel": "#b3afa8", "titania": "#a59b8f", "oberon": "#8c8178",
    "triton": "#cfc2b8",
}
IAPETUS_DARK = "#3b3026"  # its leading hemisphere


def is_placeholder(path: Path) -> bool:
    with Image.open(path) as img:
        return img.info.get("comment") == b"placeholder"


def make(moon_id: str, colour: str) -> Image.Image:
    rng = np.random.default_rng(abs(hash(moon_id)) % 2**32)
    w, h = SIZE
    base = np.array([int(colour[i:i + 2], 16) for i in (1, 3, 5)], dtype=np.float32)
    img = np.tile(base, (h, w, 1))
    if moon_id == "iapetus":
        dark = np.array([int(IAPETUS_DARK[i:i + 2], 16) for i in (1, 3, 5)], dtype=np.float32)
        x = np.linspace(0, 1, w)
        blend = np.clip((np.abs(x - 0.5) - 0.18) / 0.08, 0, 1)[None, :, None]  # dark middle half
        img = img * blend + dark * (1 - blend)
    # mottling: coarse blotches plus fine grain
    coarse = rng.normal(0, 1, (h // 16, w // 16))
    coarse = np.array(Image.fromarray(coarse.astype(np.float32), mode="F").resize((w, h), Image.BICUBIC))
    fine = rng.normal(0, 1, (h, w))
    img *= (1 + 0.07 * coarse + 0.03 * fine)[..., None]
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))


def main() -> None:
    made = []
    for moon_id, colour in COLOURS.items():
        path = OUT / f"{moon_id}.jpg"
        if path.exists() and not is_placeholder(path):
            continue  # a real map is already here
        make(moon_id, colour).save(path, "JPEG", quality=85, comment=b"placeholder")
        made.append(moon_id)
    print(f"placeholders written: {', '.join(made) or 'none'}")


if __name__ == "__main__":
    main()
