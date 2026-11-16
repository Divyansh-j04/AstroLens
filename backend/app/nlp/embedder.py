"""Sentence embeddings with MiniLM: text in, a list of 384 numbers out.

Texts with similar meaning get similar numbers, so "how hot is it" lands close to a paragraph
about temperature even without sharing words. Vectors are normalised to length 1, so the dot
product of two vectors is their cosine similarity (1 = same meaning, 0 = unrelated).

The model is all-MiniLM-L6-v2 (Apache 2.0), pinned to one exact version on Hugging Face so the
index and the server always use the same model. It reads at most 256 word pieces (about 190
words); anything longer is cut off, which is why chunks are kept at 180 words.
"""

from functools import lru_cache

import numpy as np

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
MODEL_REVISION = "1110a243fdf4706b3f48f1d95db1a4f5529b4d41"


@lru_cache
def get_model():
    from sentence_transformers import SentenceTransformer

    try:  # use the copy downloaded before, without asking Hugging Face again
        return SentenceTransformer(MODEL_NAME, revision=MODEL_REVISION, device="cpu", local_files_only=True)
    except OSError:  # first run on this machine: download it (about 90 MB)
        return SentenceTransformer(MODEL_NAME, revision=MODEL_REVISION, device="cpu")


def embed(texts: list[str], batch_size: int = 64) -> np.ndarray:
    """One normalised float32 vector (384 numbers) per text."""
    vectors = get_model().encode(texts, batch_size=batch_size, normalize_embeddings=True, convert_to_numpy=True,
                                 show_progress_bar=False)
    return vectors.astype(np.float32)
