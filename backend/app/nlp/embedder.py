"""Sentence embeddings with MiniLM: text in, a list of 384 numbers out.

Texts with similar meaning get similar numbers, so "how hot is it" lands close to a paragraph
about temperature even without sharing words. Vectors are normalised to length 1, so the dot
product of two vectors is their cosine similarity (1 = same meaning, 0 = unrelated).

Two versions of the model exist:
  - "original": all-MiniLM-L6-v2 (Apache 2.0), pinned to one exact version on Hugging Face;
  - "fine-tuned": the same model trained further on astronomy questions
    (ml/scripts/finetune_embedder.py), saved in backend/weights/minilm-astro/ (not committed).
The search index records which one built it (index/model.json), and the server always loads that
one, because questions and paragraphs must be turned into numbers by the same model.

MiniLM reads at most 256 word pieces (about 190 words); anything longer is cut off, which is why
chunks are kept at 180 words.
"""

import json
from functools import lru_cache
from pathlib import Path

import numpy as np

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
MODEL_REVISION = "1110a243fdf4706b3f48f1d95db1a4f5529b4d41"
FINETUNED_DIR = Path(__file__).resolve().parents[2] / "weights" / "minilm-astro"
INDEX_MODEL_FILE = Path(__file__).resolve().parents[1] / "data" / "index" / "model.json"
MODELS = ("original", "fine-tuned")

_override: str | None = None  # set by use_model() (evaluation scripts, index building)


def use_model(name: str | None) -> None:
    """Choose the model for this process ("original" or "fine-tuned"); None = what the index says."""
    global _override
    if name is not None and name not in MODELS:
        raise ValueError(f"unknown model {name!r}")
    _override = name
    get_model.cache_clear()


def active_model() -> str:
    if _override:
        return _override
    if INDEX_MODEL_FILE.exists():
        return json.loads(INDEX_MODEL_FILE.read_text(encoding="utf-8"))["model"]
    return "original"


@lru_cache
def get_model():
    from sentence_transformers import SentenceTransformer

    if active_model() == "fine-tuned":
        if not FINETUNED_DIR.exists():
            raise RuntimeError(
                "The search index was built with the fine-tuned model, but backend/weights/minilm-astro/ is missing. "
                "Run ml/scripts/finetune_embedder.py, or rebuild the index with: python ml/scripts/build_index.py --model original"
            )
        return SentenceTransformer(str(FINETUNED_DIR), device="cpu")
    try:  # use the copy downloaded before, without asking Hugging Face again
        return SentenceTransformer(MODEL_NAME, revision=MODEL_REVISION, device="cpu", local_files_only=True)
    except OSError:  # first run on this machine: download it (about 90 MB)
        return SentenceTransformer(MODEL_NAME, revision=MODEL_REVISION, device="cpu")


def embed(texts: list[str], batch_size: int = 64) -> np.ndarray:
    """One normalised float32 vector (384 numbers) per text."""
    vectors = get_model().encode(texts, batch_size=batch_size, normalize_embeddings=True, convert_to_numpy=True,
                                 show_progress_bar=False)
    return vectors.astype(np.float32)
