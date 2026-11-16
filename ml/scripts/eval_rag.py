"""Evaluate the chat and the typed commands (Phase 4).

1. Retrieval (no language model): for each of the 30 answerable questions in
   ml/data/eval/rag_questions.json, two checks on the top 1 / 3 / 5 chunks:
     - tagged document: is a chunk from the document tagged as holding the answer there?
     - answer found: does any chunk there contain the expected answer (the same fact is often in
       several documents, e.g. Wikipedia and NASA, so this is the fairer test)?
   Two settings:
     - question only: the bare question, no object context;
     - app (card open): what the app does, i.e. the current object's name in front of the
       question plus the current-object bonus.
2. Answers (app setting, real language model): for the 30 answerable questions, does the answer
   contain the expected fact (`expect`), cite at least one source, cite the right document, and
   avoid refusing? For the 10 unanswerable ones: does it reply "I don't know from my sources."?
   Also the time for search and for the language model.
3. Commands: the 40 phrases in ml/data/eval/commands.json, three settings: MiniLM only (the plan),
   + spelling similarity, + spelling and the ambiguity margin (what the app uses).

Writes:
    ml/results/rag_eval.csv            one row per question (retrieval ranks, answer, checks, times)
    ml/results/navigate_eval.csv       one row per phrase and setting
    ml/results/rag_eval_summary.json   the numbers for REPORT.md Tables C and D
    ml/results/rag_manual_check.csv    10 answers with their sources, for the author's manual check

Usage (from the project root; needs GROQ_API_KEY in .env for part 2):
    python ml/scripts/eval_rag.py              # everything
    python ml/scripts/eval_rag.py --no-llm     # retrieval and commands only (no language model calls)
    python ml/scripts/eval_rag.py --rescore    # re-check the saved answers in rag_eval.csv against the
                                               # current answer key, without asking the model again
"""

import argparse
import csv
import json
import re
import statistics
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
from app.nlp.chat import REFUSAL, ChatUnavailable, answer_question, model_name  # noqa: E402
from app.nlp.navigator import ASK_THRESHOLD, FLY_THRESHOLD, MARGIN, navigate  # noqa: E402
from app.nlp.retriever import search  # noqa: E402

EVAL = ROOT / "ml" / "data" / "eval"
RESULTS = ROOT / "ml" / "results"
OBJECTS = ROOT / "backend" / "app" / "data" / "objects.json"
PAUSE_S = 15.0  # between language model calls: back-to-back calls are slowed down by the free tier (median 9.5 s at 2 s spacing, ml/results/rag_eval_summary_2s_spacing.json), which would measure the free tier, not one user's wait
MANUAL_EVERY = 3  # manual-check sheet: every 3rd answerable question (1, 4, 7, ..., 28) -> 10 answers


def doc_of(chunk: dict) -> str:
    return chunk["id"].split("#")[0]  # "<object_id>/<doc>"


def first_rank(hits, gold: str) -> int | None:
    for r, h in enumerate(hits, start=1):
        if doc_of(h.chunk) == gold:
            return r
    return None


def norm(text: str) -> str:
    """Lower case, with no-break and thin spaces (the model writes "15 million") as plain spaces."""
    return re.sub(r"[    ]", " ", text).lower()


def contains(text: str, expect: list[str]) -> bool:
    return any(norm(e) in norm(text) for e in expect)


def answer_rank(hits, expect: list[str]) -> int | None:
    for r, h in enumerate(hits, start=1):
        if contains(h.chunk["text"], expect):
            return r
    return None


def ask(question: str, object_id: str, name: str) -> dict:
    for attempt in range(3):
        try:
            return answer_question(question, object_id, name, [])
        except ChatUnavailable:
            if attempt == 2:
                raise
            time.sleep(20)  # rate limited or a network hiccup: wait and try again
    raise RuntimeError("unreachable")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-llm", action="store_true", help="skip the language model part")
    ap.add_argument("--rescore", action="store_true", help="re-check saved answers against the current answer key")
    args = ap.parse_args()
    if args.rescore:
        rescore()
        return

    objects = json.loads(OBJECTS.read_text(encoding="utf-8"))
    names = {o["id"]: o["name"] for o in objects}
    obj_tuple = tuple((o["id"], o["name"], tuple(o["aliases"])) for o in objects)
    qs = json.loads((EVAL / "rag_questions.json").read_text(encoding="utf-8"))
    rows: list[dict] = []

    # ---- 1. Retrieval ----
    retrieval = run_retrieval(qs["answerable"], names, rows)
    print("retrieval:", json.dumps(retrieval))

    # ---- 2. Answers ----
    generation = None
    if not args.no_llm:
        times = []
        for i, q in enumerate(qs["answerable"]):
            r = ask(q["q"], q["object_id"], names[q["object_id"]])
            gold_cited = any(c["cited"] and c["url"].rstrip("/") == gold_url(q) for c in r["citations"])
            rows[i].update({
                "answer": r["answer"], "refused": r["refused"],
                "contains_expected": contains(r["answer"], q["expect"]),
                "cites_a_source": any(c["cited"] for c in r["citations"]),
                "cites_right_document": gold_cited,
                "sources": " | ".join(f"[{c['n']}] {c['title']} - {c['section']}{' (cited)' if c['cited'] else ''}" for c in r["citations"]),
                "search_ms": r["retrieval_ms"], "model_ms": r["llm_ms"],
            })
            times.append((r["retrieval_ms"], r["llm_ms"]))
            time.sleep(PAUSE_S)
        for q in qs["unanswerable"]:
            r = ask(q["q"], q["object_id"], names[q["object_id"]])
            rows.append({"kind": "unanswerable", "question": q["q"], "object_id": q["object_id"], "answer": r["answer"],
                         "refused": r["refused"], "search_ms": r["retrieval_ms"], "model_ms": r["llm_ms"]})
            times.append((r["retrieval_ms"], r["llm_ms"]))
            time.sleep(PAUSE_S)
        ans = [r for r in rows if r["kind"] == "answerable"]
        una = [r for r in rows if r["kind"] == "unanswerable"]
        generation = {
            "language_model": model_name(),
            "answerable": len(ans),
            "contains_expected_fact": sum(r["contains_expected"] for r in ans),
            "cites_at_least_one_source": sum(r["cites_a_source"] for r in ans),
            "cites_the_right_document": sum(r["cites_right_document"] for r in ans),
            "wrongly_refused": sum(r["refused"] for r in ans),
            "unanswerable": len(una),
            "correctly_refused": sum(r["refused"] for r in una),
            "median_search_ms": round(statistics.median(t[0] for t in times), 1),
            "median_model_ms": round(statistics.median(t[1] for t in times), 1),
            "median_total_s": round(statistics.median((t[0] + t[1]) / 1000 for t in times), 2),
        }
        print("answers:", json.dumps(generation))

        with (RESULTS / "rag_manual_check.csv").open("w", newline="", encoding="utf-8") as fh:
            w = csv.writer(fh)
            w.writerow(["question", "answer", "sources given to the model", "fully supported by the cited sources? (yes/no)", "note"])
            for r in ans[::MANUAL_EVERY]:
                w.writerow([r["question"], r["answer"], r["sources"], "", ""])

    if not args.no_llm:  # a retrieval-only run must not overwrite the answers of the last full run
        fields = list(dict.fromkeys(k for r in rows for k in r))
        with (RESULTS / "rag_eval.csv").open("w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=fields)
            w.writeheader()
            w.writerows(rows)

    # ---- 3. Commands ----
    phrases = json.loads((EVAL / "commands.json").read_text(encoding="utf-8"))["phrases"]
    variants = {"MiniLM only": dict(use_spelling=False, margin=0.0),
                "MiniLM + spelling": dict(use_spelling=True, margin=0.0),
                "MiniLM + spelling + margin (app)": dict(use_spelling=True, margin=MARGIN)}
    nav_rows, commands = [], {}
    for label, kw in variants.items():
        per_type: dict[str, list[bool]] = {}
        asked, ms = 0, []
        for p in phrases:
            t = time.perf_counter()
            r = navigate(p["text"], obj_tuple, **kw)
            ms.append((time.perf_counter() - t) * 1000)
            ok = r["intent"] == "fly_to" and r["object_id"] == p["expect"]
            asked += r["intent"] == "clarify"
            per_type.setdefault(p["type"], []).append(ok)
            nav_rows.append({"setting": label, "text": p["text"], "type": p["type"], "expect": p["expect"],
                             "in_aliases": p.get("in_aliases", ""), "intent": r["intent"], "object_id": r["object_id"] or "",
                             "score": r["score"], "candidates": " ".join(c["id"] for c in r["candidates"]), "correct": ok})
        commands[label] = {
            **{f"{t}_correct": sum(v) for t, v in per_type.items()},
            **{f"{t}_phrases": len(v) for t, v in per_type.items()},
            "all_correct": sum(sum(v) for v in per_type.values()),
            "phrases": len(phrases),
            "clarification_asked": asked,
            "median_ms": round(statistics.median(ms), 1),
        }
    print("commands:", json.dumps(commands))
    with (RESULTS / "navigate_eval.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(nav_rows[0]))
        w.writeheader()
        w.writerows(nav_rows)

    summary = {
        "script": "ml/scripts/eval_rag.py",
        "retrieval": retrieval,
        "answers": generation,
        "commands": commands,
        "command_thresholds": {"fly": FLY_THRESHOLD, "ask": ASK_THRESHOLD, "margin": MARGIN},
        "refusal_text": REFUSAL,
        "note": "language model temperature 0.2, so answers can differ slightly between runs",
    }
    old = RESULTS / "rag_eval_summary.json"
    if args.no_llm and old.exists():  # keep the last language-model results
        summary["answers"] = json.loads(old.read_text(encoding="utf-8")).get("answers")
    old.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")


def run_retrieval(questions: list[dict], names: dict, rows: list[dict]) -> dict:
    """Search for each question in both settings; fill the rank columns of `rows` (one per question)
    and return the hit counts. Search is deterministic, so this can be re-run at any time."""
    settings = {"question only": lambda q: search(q["q"], None, bonus=0.0),
                "app (card open)": lambda q: search(f"{names[q['object_id']]}: {q['q']}", q["object_id"])}
    retrieval = {}
    for label, run in settings.items():
        ranks, answer_ranks = [], []
        for i, q in enumerate(questions):
            gold = f"{q['object_id']}/{q['doc']}"
            hits = run(q)
            ranks.append(first_rank(hits, gold))
            answer_ranks.append(answer_rank(hits, q["expect"]))
            if i >= len(rows):
                rows.append({"kind": "answerable", "question": q["q"], "object_id": q["object_id"], "gold_doc": gold})
            rows[i][f"tagged doc rank ({label})"] = ranks[-1] or ""
            rows[i][f"answer chunk rank ({label})"] = answer_ranks[-1] or ""
            rows[i][f"right object in top 5 ({label})"] = any(h.chunk["object_id"] == q["object_id"] for h in hits)
        retrieval[label] = {f"tagged_doc_at_{k}": sum(1 for r in ranks if r and r <= k) for k in (1, 3, 5)}
        retrieval[label].update({f"answer_found_at_{k}": sum(1 for r in answer_ranks if r and r <= k) for k in (1, 3, 5)})
        retrieval[label]["questions"] = len(ranks)
    return retrieval


def rescore() -> None:
    """Recompute 'contains_expected' for the answers saved in rag_eval.csv (no language model calls)."""
    qs = {q["q"]: q for q in json.loads((EVAL / "rag_questions.json").read_text(encoding="utf-8"))["answerable"]}
    path = RESULTS / "rag_eval.csv"
    with path.open(encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    names = {o["id"]: o["name"] for o in json.loads(OBJECTS.read_text(encoding="utf-8"))}
    answerable = [r for r in rows if r["kind"] == "answerable"]
    retrieval = run_retrieval([qs[r["question"]] for r in answerable], names, answerable)
    for r in answerable:
        r["contains_expected"] = contains(r["answer"], qs[r["question"]]["expect"])
    with path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    summary_path = RESULTS / "rag_eval_summary.json"
    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    summary["retrieval"] = retrieval
    summary["answers"]["contains_expected_fact"] = sum(r["contains_expected"] is True for r in rows)
    summary["answers"]["rescored"] = ("answer key and space handling updated after the first run; answers unchanged, "
                                      "retrieval re-run against the updated key")
    print("retrieval:", json.dumps(retrieval))
    summary_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print("contains expected fact:", summary["answers"]["contains_expected_fact"], "of", summary["answers"]["answerable"])


def gold_url(q: dict) -> str:
    """The link of the gold document, read from its header block."""
    path = ROOT / "backend" / "app" / "data" / "corpus" / q["object_id"] / f"{q['doc']}.md"
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("url: "):
            return json.loads(line[5:]).rstrip("/")
    return ""


if __name__ == "__main__":
    main()
