"""Typed commands: turn text such as "take me to the red planet" into an object to fly to.

1. Remove the command words at the start ("take me to", "fly to", "show me", ...).
2. Compare what is left with every object's name and nicknames from objects.json using MiniLM
   similarity (meaning) and a spelling similarity (difflib, for typos such as "jupitr", which
   MiniLM does not recognise), and keep each object's best score.
3. Decide:
   - a question ("how hot is Mars?") goes to the chat, with the best-matching object if any;
   - best score at least FLY_THRESHOLD and clearly ahead of the second object: fly there;
   - between ASK_THRESHOLD and FLY_THRESHOLD, or two objects within MARGIN of each other
     (e.g. just "nebula"): ask which of the two best objects was meant;
   - below ASK_THRESHOLD: not a known object, so treat the text as a chat question.
"""

import re
from difflib import SequenceMatcher
from functools import lru_cache

import numpy as np

from app.nlp.embedder import embed

FLY_THRESHOLD = 0.60
ASK_THRESHOLD = 0.45
MARGIN = 0.05  # if the second-best object is this close, the text is ambiguous

COMMAND_WORDS = re.compile(
    r"^(please\s+|can you\s+|could you\s+|i want to\s+|let'?s\s+)*"
    r"(take me to|take me|fly me to|fly to|go to|go|show me|show|navigate to|travel to|visit|find|open|zoom (in )?(to|on)|jump to)\s+",
    re.IGNORECASE,
)
QUESTION_START = re.compile(
    r"^(what|why|how|when|who|which|whose|is|are|was|were|does|do|did|can|could|would|will|tell me|explain|describe)\b",
    re.IGNORECASE,
)


def clean(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip().rstrip(".!")
    return COMMAND_WORDS.sub("", text).strip()


def is_question(text: str) -> bool:
    text = text.strip()
    return text.endswith("?") or bool(QUESTION_START.match(text))


@lru_cache
def alias_table(objects: tuple[tuple[str, str, tuple[str, ...]], ...]) -> tuple[list[str], np.ndarray]:
    """(object id per alias, alias vectors) for every name and nickname. Built once."""
    ids, phrases = [], []
    for obj_id, name, aliases in objects:
        for phrase in (name, *aliases):
            ids.append(obj_id)
            phrases.append(phrase)
    return ids, embed(phrases)


def spelling(a: str, b: str) -> float:
    """How alike two strings are letter by letter (0-1), ignoring case and a leading "the"."""
    a, b = (re.sub(r"^the ", "", x.lower()) for x in (a, b))
    return SequenceMatcher(None, a, b).ratio()


def rank(text: str, objects: tuple, use_spelling: bool = True) -> list[tuple[str, float]]:
    """Objects ordered by their best alias score: MiniLM similarity, or spelling similarity if higher."""
    ids, vectors = alias_table(objects)
    scores = vectors @ embed([text])[0]
    phrases = [p for _, name, aliases in objects for p in (name, *aliases)]
    best: dict[str, float] = {}
    for obj_id, phrase, s in zip(ids, phrases, scores):
        score = max(float(s), spelling(text, phrase)) if use_spelling else float(s)
        best[obj_id] = max(best.get(obj_id, -1.0), score)
    return sorted(best.items(), key=lambda kv: -kv[1])


def navigate(text: str, objects: tuple, use_spelling: bool = True, margin: float = MARGIN) -> dict:
    """{intent: fly_to | clarify | chat, object_id, score, candidates}.
    use_spelling and margin can be switched off to measure what each adds (ml/scripts/eval_rag.py)."""
    target = clean(text) or text
    ranked = rank(target, objects, use_spelling)
    top_id, top = ranked[0]
    second = ranked[1][1]
    candidates = [{"id": i, "score": round(s, 3)} for i, s in ranked[:3]]
    if is_question(text):
        return {"intent": "chat", "object_id": top_id if top >= FLY_THRESHOLD else None, "score": round(top, 3),
                "candidates": candidates}
    if top >= FLY_THRESHOLD and top - second >= margin:
        return {"intent": "fly_to", "object_id": top_id, "score": round(top, 3), "candidates": candidates}
    if top >= ASK_THRESHOLD:  # weak match, or two objects almost tied
        return {"intent": "clarify", "object_id": None, "score": round(top, 3), "candidates": candidates[:2]}
    return {"intent": "chat", "object_id": None, "score": round(top, 3), "candidates": candidates}
