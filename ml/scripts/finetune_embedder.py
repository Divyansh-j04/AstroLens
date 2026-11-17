"""Fine-tune MiniLM (the chat's search model) on astronomy (question, paragraph) pairs.

Contrastive learning with "in-batch negatives" (the loss sentence-transformers calls
MultipleNegativesRankingLoss), written out in plain PyTorch:
  - a batch holds B questions and the B paragraphs that answer them;
  - every question is compared with every paragraph in the batch (a B x B table of cosine
    similarities, times a scale of 20);
  - cross-entropy pushes each question towards its own paragraph (the diagonal) and away from the
    other B - 1 paragraphs, which act as wrong answers for free.
No two questions in a batch share a paragraph, or the "wrong" answer would be right.

After each epoch, the validation questions (from documents never trained on) search all 1,961
chunks; the epoch with the best recall@5 is kept.

Input:  ml/data/processed/pairs*.jsonl (make_pairs.py)
Output: backend/weights/minilm-astro/ (not committed) and ml/results/finetune_embedder.json

Usage (from the project root):  python ml/scripts/finetune_embedder.py
"""

import json
import random
import sys
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
from app.nlp.embedder import MODEL_NAME, MODEL_REVISION  # noqa: E402  (the same pinned starting model)
from make_pairs import read_pairs  # noqa: E402

OBJECTS = ROOT / "backend" / "app" / "data" / "objects.json"
PAIRS = ROOT / "ml" / "data" / "processed" / "pairs.jsonl"
CHUNKS = ROOT / "backend" / "app" / "data" / "index" / "chunks.json"
OUT_DIR = ROOT / "backend" / "weights" / "minilm-astro"
LOG = ROOT / "ml" / "results" / "finetune_embedder.json"

SEED = 42
EPOCHS = 3
BATCH = 64
LR = 2e-5
WARMUP = 0.1  # share of steps with a rising learning rate
SCALE = 20.0  # sharpens the similarities before the softmax (the library's default)


def passages(chunks: list[dict]) -> dict[str, str]:
    """Chunk id -> the exact text build_index.py embeds ("Name - Section: text")."""
    names = {o["id"]: o["name"] for o in json.loads(OBJECTS.read_text(encoding="utf-8"))}
    return {c["id"]: f"{names[c['object_id']]} - {c['section']}: {c['text']}" for c in chunks}


def load_pairs(split: str) -> list[tuple[str, str]]:
    rows = read_pairs()
    return [(q, r["chunk_id"]) for r in rows if r["split"] == split for q in r["questions"]]


def batches(pairs: list[tuple[str, str]], rng: random.Random) -> list[list[tuple[str, str]]]:
    """Shuffle, then fill batches so that no paragraph appears twice in one batch."""
    pairs = pairs[:]
    rng.shuffle(pairs)
    out: list[list[tuple[str, str]]] = []
    open_batches: list[tuple[list, set]] = []
    for pair in pairs:
        for items, ids in open_batches:
            if pair[1] not in ids and len(items) < BATCH:
                items.append(pair)
                ids.add(pair[1])
                break
        else:
            open_batches.append(([pair], {pair[1]}))
        full = [b for b in open_batches if len(b[0]) == BATCH]
        out += [b[0] for b in full]
        open_batches = [b for b in open_batches if len(b[0]) < BATCH]
    out += [b[0] for b in open_batches if len(b[0]) > 1]
    return out


def encode(model, texts: list[str], device: str) -> torch.Tensor:
    features = model.preprocess(texts)  # word pieces as tensors (plus a "modality" label, kept as is)
    features = {k: v.to(device) if torch.is_tensor(v) else v for k, v in features.items()}
    return F.normalize(model(features)["sentence_embedding"], dim=-1)


@torch.no_grad()
def recall_at_5(model, val: list[tuple[str, str]], chunks: list[dict]) -> float:
    """Share of validation questions whose own paragraph is among the 5 closest of all chunks."""
    model.eval()
    text = passages(chunks)
    vectors = model.encode([text[c["id"]] for c in chunks], batch_size=128, normalize_embeddings=True, convert_to_numpy=True)
    questions = model.encode([q for q, _ in val], batch_size=128, normalize_embeddings=True, convert_to_numpy=True)
    position = {c["id"]: i for i, c in enumerate(chunks)}
    top5 = np.argsort(-(questions @ vectors.T), axis=1)[:, :5]
    model.train()
    return float(np.mean([position[cid] in row for (_, cid), row in zip(val, top5)]))


def main() -> None:
    from sentence_transformers import SentenceTransformer

    random.seed(SEED)
    torch.manual_seed(SEED)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    chunks = json.loads(CHUNKS.read_text(encoding="utf-8"))
    text = passages(chunks)
    train, val = load_pairs("train"), load_pairs("val")
    print(f"{len(train)} training pairs, {len(val)} validation questions, device {device}")

    model = SentenceTransformer(MODEL_NAME, revision=MODEL_REVISION, device=device)
    rng = random.Random(SEED)
    steps_per_epoch = len(batches(train, random.Random(SEED)))
    total = EPOCHS * steps_per_epoch
    optimizer = torch.optim.AdamW(model.parameters(), lr=LR, weight_decay=0.01)
    warm = max(1, int(WARMUP * total))
    scheduler = torch.optim.lr_scheduler.LambdaLR(optimizer, lambda s: min((s + 1) / warm, max(0.0, (total - s) / (total - warm))))

    log = {"script": "ml/scripts/finetune_embedder.py", "start_model": MODEL_NAME, "start_revision": MODEL_REVISION,
           "train_pairs": len(train), "val_questions": len(val), "epochs": EPOCHS, "batch": BATCH, "lr": LR,
           "scale": SCALE, "device": torch.cuda.get_device_name(0) if device == "cuda" else "cpu", "history": []}
    base = recall_at_5(model, val, chunks)
    log["val_recall_at_5_before"] = round(base, 4)
    print(f"before training: val recall@5 = {base:.3f}")
    best, t0 = base, time.time()
    model.train()
    for epoch in range(1, EPOCHS + 1):
        losses = []
        for batch in batches(train, rng):
            q = encode(model, [p[0] for p in batch], device)
            d = encode(model, [text[p[1]] for p in batch], device)
            scores = SCALE * q @ d.T  # B x B; the right answers are on the diagonal
            loss = F.cross_entropy(scores, torch.arange(len(batch), device=device))
            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            scheduler.step()
            losses.append(loss.item())
        r5 = recall_at_5(model, val, chunks)
        mean_loss = sum(losses) / len(losses)
        log["history"].append({"epoch": epoch, "train_loss": round(mean_loss, 4), "val_recall_at_5": round(r5, 4)})
        print(f"epoch {epoch}: loss {mean_loss:.4f}, val recall@5 {r5:.3f}")
        if r5 > best:
            best = r5
            model.save(str(OUT_DIR))
            log["best_epoch"] = epoch
    log["val_recall_at_5_best"] = round(best, 4)
    log["saved"] = best > base
    log["minutes"] = round((time.time() - t0) / 60, 2)
    if not log["saved"]:
        print("No epoch beat the original model on validation; nothing saved.")
    LOG.write_text(json.dumps(log, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in log.items() if k != "history"}, indent=2))


if __name__ == "__main__":
    main()
