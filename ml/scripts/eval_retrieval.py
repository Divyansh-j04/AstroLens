"""Compare the original and the fine-tuned MiniLM on search, and on typed commands.

Search: each test question searches all 1,961 chunks (no current-object bonus, so only the model
counts). A question is answered if one of its "gold" chunks (the chunks that hold the answer) comes
back. Two test sets, both drawn ONLY from the 12 test documents (ml/data/retrieval_split.json), so
the fine-tuned model never trained on their text:
  - hand: ml/data/eval/retrieval_hard.json, 32 hand-written paraphrased questions;
  - generated: the language-model questions for the test documents (ml/data/processed/pairs*.jsonl).
Measures:
  - recall@1 / recall@5: share of questions with a gold chunk first / in the top 5;
  - MRR@10: mean of 1/rank of the first gold chunk (0 if not in the top 10);
  - object@1: share whose first chunk is at least about the right object.

Commands: the 47 phrases of ml/data/eval/commands.json through the app's navigator with each model.

Output: ml/results/retrieval_compare.json and ml/results/retrieval_compare.csv (per question).

Usage (from the project root):  python ml/scripts/eval_retrieval.py
"""

import csv
import json
import statistics
import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
from app.nlp import navigator  # noqa: E402
from app.nlp.embedder import FINETUNED_DIR, embed, use_model  # noqa: E402
from make_pairs import read_pairs  # noqa: E402

CHUNKS = ROOT / "backend" / "app" / "data" / "index" / "chunks.json"
OBJECTS = ROOT / "backend" / "app" / "data" / "objects.json"
EVAL = ROOT / "ml" / "data" / "eval"
PAIRS = ROOT / "ml" / "data" / "processed" / "pairs.jsonl"
RESULTS = ROOT / "ml" / "results"


def test_sets() -> dict[str, list[dict]]:
    hand = json.loads((EVAL / "retrieval_hard.json").read_text(encoding="utf-8"))["questions"]
    rows = read_pairs()
    generated = [{"question": q, "object_id": r["object_id"], "gold": [r["chunk_id"]], "kind": "generated"}
                 for r in rows if r["split"] == "test" for q in r["questions"]]
    return {"hand": hand, "generated": generated}


def score_search(questions: list[dict], chunks: list[dict], vectors: np.ndarray) -> tuple[dict, list[dict]]:
    t = time.perf_counter()
    q = embed([x["question"] for x in questions])
    ms_per_question = (time.perf_counter() - t) * 1000 / len(questions)
    order = np.argsort(-(q @ vectors.T), axis=1)[:, :10]
    rows, r1, r5, rr, obj1 = [], [], [], [], []
    for x, top in zip(questions, order):
        ids = [chunks[i]["id"] for i in top]
        rank = next((k + 1 for k, cid in enumerate(ids) if cid in x["gold"]), None)
        r1.append(rank == 1)
        r5.append(rank is not None and rank <= 5)
        rr.append(1 / rank if rank else 0.0)
        obj1.append(chunks[top[0]]["object_id"] == x["object_id"])
        rows.append({"question": x["question"], "kind": x["kind"], "gold": " ".join(x["gold"]), "rank": rank or "",
                     "top1": ids[0]})
    n = len(questions)
    return {"questions": n, "recall_at_1": round(sum(r1) / n, 4), "recall_at_5": round(sum(r5) / n, 4),
            "mrr_at_10": round(sum(rr) / n, 4), "object_at_1": round(sum(obj1) / n, 4),
            "embed_ms_per_question": round(ms_per_question, 2)}, rows


def seen_split(rows: list[dict], questions: list[dict]) -> dict:
    """Hand-written questions split by whether their object had any training questions at all
    (the generation run stopped part-way, so some objects were never trained on)."""
    trained = {r["object_id"] for r in read_pairs() if r["split"] == "train" and r["questions"]}
    out = {}
    for label, want in (("objects_seen_in_training", True), ("objects_not_in_training", False)):
        ranks = [r["rank"] for r, q in zip(rows, questions) if (q["object_id"] in trained) == want]
        out[label] = {"questions": len(ranks), "at_1": sum(k == 1 for k in ranks),
                      "at_5": sum(k != "" and k <= 5 for k in ranks)}
    return out


def score_commands(objects: list[dict]) -> dict:
    phrases = json.loads((EVAL / "commands.json").read_text(encoding="utf-8"))["phrases"]
    obj_tuple = tuple((o["id"], o["name"], tuple(o.get("aliases", []))) for o in objects)
    navigator.alias_table.cache_clear()  # the alias vectors belong to the model
    wrong, ms = [], []
    for p in phrases:
        t = time.perf_counter()
        r = navigator.navigate(p["text"], obj_tuple)
        ms.append((time.perf_counter() - t) * 1000)
        if not (r["intent"] == "fly_to" and r["object_id"] == p["expect"]):
            wrong.append(f'{p["text"]} -> {r["intent"]} {r["object_id"] or ""}'.strip())
    return {"phrases": len(phrases), "correct": len(phrases) - len(wrong), "wrong": wrong,
            "median_ms": round(statistics.median(ms), 1)}


def main() -> None:
    if not FINETUNED_DIR.exists():
        raise SystemExit("No fine-tuned model in backend/weights/minilm-astro/; run ml/scripts/finetune_embedder.py first.")
    chunks = json.loads(CHUNKS.read_text(encoding="utf-8"))
    objects = json.loads(OBJECTS.read_text(encoding="utf-8"))
    names = {o["id"]: o["name"] for o in objects}
    passages = [f"{names[c['object_id']]} - {c['section']}: {c['text']}" for c in chunks]  # as build_index.py
    sets = test_sets()

    summary = {"script": "ml/scripts/eval_retrieval.py", "chunks_searched": len(chunks), "models": {}}
    per_question = []
    for model in ("original", "fine-tuned"):
        use_model(model)
        vectors = embed(passages)
        summary["models"][model] = {"search": {}, "commands": score_commands(objects)}
        for name, questions in sets.items():
            if not questions:
                continue
            scores, rows = score_search(questions, chunks, vectors)
            if name == "hand":
                scores["by_object"] = seen_split(rows, questions)
            summary["models"][model]["search"][name] = scores
            per_question += [{"model": model, **r} for r in rows]
        print(model, json.dumps(summary["models"][model]["search"]), "commands",
              summary["models"][model]["commands"]["correct"], "/", summary["models"][model]["commands"]["phrases"])
    use_model(None)

    RESULTS.joinpath("retrieval_compare.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    with RESULTS.joinpath("retrieval_compare.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(per_question[0]))
        w.writeheader()
        w.writerows(per_question)


if __name__ == "__main__":
    main()
