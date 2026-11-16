"""Find the paragraphs (chunks) most related to a question.

The question becomes a MiniLM vector; its cosine similarity with every chunk's vector is one
matrix product (NumPy; the same computation as FAISS's "flat" index). Chunks about the object
the user is looking at get a small bonus, so "how big is it?" on the Mars card prefers Mars
texts, while a question that clearly names another object can still find that object's texts.
"""

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import numpy as np

from app.nlp.embedder import embed

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
CORPUS = DATA_DIR / "corpus"
INDEX_DIR = DATA_DIR / "index"
CHUNKS_FILE = INDEX_DIR / "chunks.json"
EMBEDDINGS_FILE = INDEX_DIR / "embeddings.npy"

CURRENT_OBJECT_BONUS = 0.10  # added to the similarity of chunks about the current object
TOP_K = 5


@dataclass
class Hit:
    chunk: dict
    score: float  # cosine similarity, plus the bonus if it is about the current object


@lru_cache
def load_index() -> tuple[list[dict], np.ndarray]:
    chunks = json.loads(CHUNKS_FILE.read_text(encoding="utf-8"))
    vectors = np.load(EMBEDDINGS_FILE)
    if len(chunks) != len(vectors):
        raise ValueError("chunks.json and embeddings.npy do not match; run ml/scripts/build_index.py")
    return chunks, vectors


def index_ready() -> bool:
    return CHUNKS_FILE.exists() and EMBEDDINGS_FILE.exists()


def search(query: str, object_id: str | None = None, k: int = TOP_K, bonus: float = CURRENT_OBJECT_BONUS) -> list[Hit]:
    """The k chunks closest in meaning to `query`, best first."""
    chunks, vectors = load_index()
    scores = vectors @ embed([query])[0]
    if object_id:
        scores = scores + bonus * np.array([c["object_id"] == object_id for c in chunks], dtype=np.float32)
    best = np.argsort(-scores)[:k]
    return [Hit(chunks[i], float(scores[i])) for i in best]
