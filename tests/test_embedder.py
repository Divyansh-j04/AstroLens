"""The search model: which MiniLM is loaded, and the fine-tuning batches.

These tests need neither the GPU nor the fine-tuned weights."""

import json
import random
import sys
from pathlib import Path

import numpy as np
import pytest

from app.nlp import embedder
from app.nlp.retriever import EMBEDDINGS_FILE, index_ready

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ml" / "scripts"))


@pytest.fixture(autouse=True)
def reset_model_choice():
    yield
    embedder.use_model(None)


def test_vectors_have_384_numbers_and_length_1():
    embedder.use_model("original")
    v = embedder.embed(["How hot is Venus?", "Saturn's rings"])
    assert v.shape == (2, 384)
    assert np.allclose(np.linalg.norm(v, axis=1), 1.0, atol=1e-5)


def test_unknown_model_name_is_refused():
    with pytest.raises(ValueError):
        embedder.use_model("bert")


def test_server_uses_the_model_the_index_was_built_with(tmp_path, monkeypatch):
    info = tmp_path / "model.json"
    monkeypatch.setattr(embedder, "INDEX_MODEL_FILE", info)
    assert embedder.active_model() == "original"  # no record: the original model
    info.write_text(json.dumps({"model": "fine-tuned"}), encoding="utf-8")
    assert embedder.active_model() == "fine-tuned"
    embedder.use_model("original")  # an evaluation script can override it
    assert embedder.active_model() == "original"


def test_missing_fine_tuned_weights_give_a_clear_error(tmp_path, monkeypatch):
    monkeypatch.setattr(embedder, "FINETUNED_DIR", tmp_path / "missing")
    embedder.use_model("fine-tuned")
    with pytest.raises(RuntimeError, match="build_index.py --model original"):
        embedder.get_model()


@pytest.mark.skipif(not index_ready(), reason="run ml/scripts/build_index.py first")
def test_index_records_a_known_model():
    record = json.loads(embedder.INDEX_MODEL_FILE.read_text(encoding="utf-8"))
    assert record["model"] in embedder.MODELS
    assert np.load(EMBEDDINGS_FILE).shape[1] == 384


def test_training_batches_never_repeat_a_paragraph():
    from finetune_embedder import BATCH, batches

    pairs = [(f"question {i}", f"chunk {i % 50}") for i in range(400)]  # 8 questions per paragraph
    out = batches(pairs, random.Random(0))
    assert all(len({cid for _, cid in b}) == len(b) for b in out)
    assert all(len(b) <= BATCH for b in out)
    assert sum(len(b) for b in out) >= 390  # almost nothing dropped
