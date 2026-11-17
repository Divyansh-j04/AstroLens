"""Make (question, paragraph) pairs for fine-tuning MiniLM, the search model of the chat.

1. Split the 124 documents into train / validation / test (by DOCUMENT, not by chunk, so no text the
   model is trained on appears in the test set). Saved to ml/data/retrieval_split.json (committed).
2. For every chunk of the search index, ask the language model (Groq) for 2 questions that the
   chunk answers: one naming the object, one describing it without its name ("the red planet").
   4 chunks go in one request to stay inside the free tier's limits.
3. Write the pairs to ml/data/processed/pairs*.jsonl (not committed; it is generated data) and a
   summary to ml/results/pairs_summary.json.

The script can be stopped and started again: chunks that already have questions are skipped.
Each Groq model has its own limit (8,000 tokens a minute on the free tier), so the work can be split
in two shards run at the same time with two models; each shard writes its own file.

Usage (from the project root):
    python ml/scripts/make_pairs.py              # all chunks
    python ml/scripts/make_pairs.py --limit 20   # a quick trial
    python ml/scripts/make_pairs.py --shard 0/2 --model openai/gpt-oss-20b    # together with:
    python ml/scripts/make_pairs.py --shard 1/2 --model openai/gpt-oss-120b
"""

import argparse
import json
import os
import random
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
CHUNKS = ROOT / "backend" / "app" / "data" / "index" / "chunks.json"
OBJECTS = ROOT / "backend" / "app" / "data" / "objects.json"
SPLIT = ROOT / "ml" / "data" / "retrieval_split.json"
PAIRS_DIR = ROOT / "ml" / "data" / "processed"
PAIRS = PAIRS_DIR / "pairs.jsonl"
SUMMARY = ROOT / "ml" / "results" / "pairs_summary.json"
SEED = 42
PER_REQUEST = 4
SPACING_S = 15  # seconds between requests: Groq counts the prompt plus max_tokens (about 1,900) against 8,000 a minute

PROMPT = """You write search questions for an astronomy app. For each numbered passage below, write exactly 2 short questions (under 20 words) that a curious visitor might type and that the passage clearly answers.
- Question "a" names the object ({names}).
- Question "b" does NOT use the object's name; describe it instead (for example "the red planet", "Jupiter's largest moon", "the cluster in Taurus") or ask in a natural way that still fits only this object.
- Use everyday words. Do not copy unusual phrases from the passage.
Reply with JSON only: {{"items": [{{"n": 1, "a": "...", "b": "..."}}, ...]}}

{passages}"""


def read_pairs() -> list[dict]:
    """One row per chunk from every pairs*.jsonl file (one per shard); a row with questions wins over
    an earlier empty one (a chunk the model skipped is asked again on the next run)."""
    best: dict[str, dict] = {}
    for path in sorted(PAIRS_DIR.glob("pairs*.jsonl")):
        for line in path.read_text(encoding="utf-8").splitlines():
            if line:
                row = json.loads(line)
                if row["questions"] or row["chunk_id"] not in best:
                    best[row["chunk_id"]] = row
    return list(best.values())


def doc_id(chunk_id: str) -> str:
    return chunk_id.split("#")[0]


def make_split(chunks: list[dict]) -> dict:
    """80/10/10 split of the documents, fixed by a seed. Kept if it already exists."""
    if SPLIT.exists():
        return json.loads(SPLIT.read_text(encoding="utf-8"))
    docs = sorted({doc_id(c["id"]) for c in chunks})
    random.Random(SEED).shuffle(docs)
    n = len(docs)
    n_test = n_val = round(0.1 * n)
    split = {
        "seed": SEED,
        "note": "Documents (not chunks) split 80/10/10 for fine-tuning the search model.",
        "test": sorted(docs[:n_test]),
        "val": sorted(docs[n_test : n_test + n_val]),
        "train": sorted(docs[n_test + n_val :]),
    }
    SPLIT.write_text(json.dumps(split, indent=2), encoding="utf-8")
    return split


def ask(client, model: str, batch: list[dict], names: dict) -> dict:
    passages = "\n\n".join(f"[{i + 1}] ({names[c['object_id']]}) {c['text']}" for i, c in enumerate(batch))
    object_names = ", ".join(sorted({names[c["object_id"]] for c in batch}))
    reply = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": PROMPT.format(names=object_names, passages=passages)}],
        temperature=0.7,
        max_tokens=600,
        response_format={"type": "json_object"},
        extra_body={"reasoning_effort": "low"},
    )
    items = json.loads(reply.choices[0].message.content)["items"]
    out = {}
    for item in items:
        n = int(item.get("n", 0))
        if 1 <= n <= len(batch):
            qs = [q.strip() for q in (item.get("a"), item.get("b")) if isinstance(q, str) and 8 <= len(q.strip()) <= 200]
            out[batch[n - 1]["id"]] = qs
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="only this many chunks (trial)")
    ap.add_argument("--model", default="openai/gpt-oss-20b")
    ap.add_argument("--shard", default="0/1", help="i/n: only every n-th group of chunks, starting at group i")
    args = ap.parse_args()
    shard, shards = (int(x) for x in args.shard.split("/"))

    load_dotenv(ROOT / ".env")
    from groq import Groq

    client = Groq(api_key=os.environ["GROQ_API_KEY"], timeout=60, max_retries=2)  # retries wait on rate limits
    chunks = json.loads(CHUNKS.read_text(encoding="utf-8"))
    objects = json.loads(OBJECTS.read_text(encoding="utf-8"))
    objects = objects["objects"] if isinstance(objects, dict) else objects
    names = {o["id"]: o["name"] for o in objects}
    split = make_split(chunks)
    part = {d: s for s in ("train", "val", "test") for d in split[s]}

    PAIRS_DIR.mkdir(parents=True, exist_ok=True)
    out_file = PAIRS if shards == 1 else PAIRS_DIR / f"pairs_shard{shard}.jsonl"
    done = {r["chunk_id"] for r in read_pairs() if r["questions"]}
    todo = [c for k, c in enumerate(chunks) if c["id"] not in done and (k // PER_REQUEST) % shards == shard]
    if args.limit:
        todo = todo[: args.limit]
    print(f"{len(done)} chunks done, {len(todo)} to go", flush=True)

    failures = 0
    for start in range(0, len(todo), PER_REQUEST):
        batch = todo[start : start + PER_REQUEST]
        t0 = time.time()
        try:
            try:
                got = ask(client, args.model, batch, names)
            except Exception as err:  # the model's reply was not valid JSON: try once more, else skip
                if "json_validate_failed" not in str(err) and not isinstance(err, (json.JSONDecodeError, KeyError)):
                    raise
                try:
                    got = ask(client, args.model, batch, names)
                except Exception as err2:
                    if "json_validate_failed" not in str(err2) and not isinstance(err2, (json.JSONDecodeError, KeyError)):
                        raise
                    print(f"skipped {len(batch)} chunks: no valid JSON twice", flush=True)
                    got = {}
            failures = 0
        except Exception as err:  # rate limit after retries, network
            failures += 1
            print(f"request failed ({failures} in a row): {str(err)[:200]}", flush=True)
            if failures >= 2:
                print("Stopping after 2 failures in a row; run again later to continue.", flush=True)
                break
            time.sleep(60)
            continue
        with out_file.open("a", encoding="utf-8") as f:
            for c in batch:  # a chunk with no usable question is still marked done (0 questions)
                qs = got.get(c["id"], [])
                f.write(json.dumps({"chunk_id": c["id"], "object_id": c["object_id"], "split": part[doc_id(c["id"])],
                                    "questions": qs}, ensure_ascii=False) + "\n")
        if (start // PER_REQUEST) % 10 == 0:
            print(f"{len(done) + start + len(batch)} / {len(chunks)} chunks", flush=True)
        time.sleep(max(0.0, SPACING_S - (time.time() - t0)))

    rows = read_pairs()
    summary = {
        "script": "ml/scripts/make_pairs.py",
        "models": "openai/gpt-oss-20b and openai/gpt-oss-120b (two shards), on Groq",
        "documents": {s: len(split[s]) for s in ("train", "val", "test")},
        "chunks_with_questions": {s: sum(1 for r in rows if r["split"] == s and r["questions"]) for s in ("train", "val", "test")},
        "chunks_without_questions": sum(1 for r in rows if not r["questions"]),
        "questions": {s: sum(len(r["questions"]) for r in rows if r["split"] == s) for s in ("train", "val", "test")},
        "chunks_total": len(chunks),
        "chunks_processed": len(rows),
    }
    SUMMARY.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    sys.exit(main())
