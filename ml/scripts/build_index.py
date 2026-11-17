"""Build the search index for the chat (Phase 4).

1. Read every document in backend/app/data/corpus/<object_id>/*.md (header block + text).
2. Cut each into chunks of CHUNK_WORDS words that overlap by OVERLAP_WORDS, so a fact that sits
   on a boundary is whole in at least one chunk. Each chunk remembers its object, document title,
   link and section heading.
3. Turn each chunk into a MiniLM embedding. The text embedded is "<object name> - <section>:
   <chunk>", so a chunk about "its rings" still carries which object it is about.
4. Save backend/app/data/index/chunks.json (text and metadata), embeddings.npy (one row per chunk)
   and model.json (which MiniLM built it: "original" or "fine-tuned"; the server loads the same one).

Search is a plain matrix product over all chunks with NumPy (backend/app/nlp/retriever.py), which
is exactly what FAISS's basic "flat" index does; at about 1,500 chunks it takes about a millisecond.

Usage (from the project root):
    python ml/scripts/build_index.py                      # the original MiniLM
    python ml/scripts/build_index.py --model fine-tuned   # the fine-tuned one (backend/weights/minilm-astro/)
"""

import argparse
import json
import re
import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
from app.nlp.embedder import FINETUNED_DIR, INDEX_MODEL_FILE, MODEL_NAME, MODEL_REVISION, MODELS, embed, use_model  # noqa: E402
from app.nlp.retriever import CHUNKS_FILE, CORPUS, EMBEDDINGS_FILE, INDEX_DIR  # noqa: E402

OBJECTS = ROOT / "backend" / "app" / "data" / "objects.json"
SUMMARY = ROOT / "ml" / "results" / "index_summary.json"
CHUNK_WORDS = 180  # MiniLM reads at most 256 word pieces (~190 words); longer chunks would be cut off
OVERLAP_WORDS = 40


def read_doc(path: Path) -> tuple[dict, str]:
    raw = path.read_text(encoding="utf-8")
    _, header, body = raw.split("---\n", 2)
    meta = {k: json.loads(v) for k, v in (line.split(": ", 1) for line in header.strip().splitlines())}
    return meta, body.strip()


def chunk(text: str) -> list[tuple[str, str]]:
    """(section heading, chunk text) pairs: a sliding window of CHUNK_WORDS words over the document."""
    words: list[tuple[str, str]] = []  # (word, the section it is in)
    section = "Overview"
    for line in text.splitlines():
        heading = re.match(r"^#+\s*(.+)$", line)
        if heading:
            section = heading.group(1).strip()
            continue
        words.extend((w, section) for w in line.split())
    step = CHUNK_WORDS - OVERLAP_WORDS
    out = []
    for start in range(0, max(1, len(words) - OVERLAP_WORDS), step):
        piece = words[start:start + CHUNK_WORDS]
        if len(piece) < 30 and out:  # a tiny tail is already inside the previous chunk's overlap
            break
        out.append((piece[0][1], " ".join(w for w, _ in piece)))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", choices=MODELS, default="original")
    model = ap.parse_args().model
    use_model(model)
    names = {o["id"]: o["name"] for o in json.loads(OBJECTS.read_text(encoding="utf-8"))}
    chunks: list[dict] = []
    for path in sorted(CORPUS.glob("*/*.md")):
        meta, body = read_doc(path)
        for k, (section, text) in enumerate(chunk(body)):
            chunks.append({"id": f"{meta['object_id']}/{path.stem}#{k}", "object_id": meta["object_id"],
                           "title": meta["title"], "url": meta["url"], "source": meta["source"],
                           "section": section, "text": text})
    start = time.perf_counter()
    vectors = embed([f"{names[c['object_id']]} - {c['section']}: {c['text']}" for c in chunks])
    minutes = (time.perf_counter() - start) / 60

    INDEX_DIR.mkdir(parents=True, exist_ok=True)
    CHUNKS_FILE.write_text(json.dumps(chunks, ensure_ascii=False, indent=0) + "\n", encoding="utf-8")
    np.save(EMBEDDINGS_FILE, vectors)
    INDEX_MODEL_FILE.write_text(json.dumps({"model": model}) + "\n", encoding="utf-8")
    per_object = {i: sum(c["object_id"] == i for c in chunks) for i in names}
    SUMMARY.write_text(json.dumps({
        "script": "ml/scripts/build_index.py",
        "embedding_model": MODEL_NAME,
        "model_revision": MODEL_REVISION,
        "model_version": model if model == "original" else f"fine-tuned ({FINETUNED_DIR.relative_to(ROOT).as_posix()}, from the revision above)",
        "dimensions": int(vectors.shape[1]),
        "chunk_words": CHUNK_WORDS,
        "overlap_words": OVERLAP_WORDS,
        "documents": len(list(CORPUS.glob("*/*.md"))),
        "chunks": len(chunks),
        "embedding_minutes_cpu": round(minutes, 2),
        "chunks_per_object": per_object,
    }, indent=2) + "\n", encoding="utf-8")
    print(f"{len(chunks)} chunks from {len(list(CORPUS.glob('*/*.md')))} documents, embedded in {minutes:.1f} min")


if __name__ == "__main__":
    main()
