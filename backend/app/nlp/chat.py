"""The chat (RAG: retrieval-augmented generation).

1. Retrieval: find the 5 chunks closest to the question (retriever.py). For a follow-up such as
   "how far is it?", the current object's name is put in front of the question first.
2. Generation: the language model gets those 5 chunks, numbered, with strict rules: answer only
   from them, cite them as [1], [2], and say "I don't know from my sources." if they do not
   contain the answer. It never sees the internet, only these paragraphs.
3. The answer comes back with the numbered sources, marked as cited if the answer uses them.
"""

import os
import re
import time
from functools import lru_cache
from pathlib import Path

from app.nlp.retriever import Hit, search

ROOT = Path(__file__).resolve().parents[3]
DEFAULT_MODEL = "openai/gpt-oss-20b"
REFUSAL = "I don't know from my sources."
HISTORY_TURNS = 4  # earlier messages passed back to the model, so follow-ups make sense

SYSTEM_RULES = """You are AstroLens, a friendly astronomy guide inside a 3D space explorer.
Answer the user's question using ONLY the numbered sources in their message.
Rules:
1. After every sentence that states a fact, put the number of the source it came from in square brackets, like [1] or [2][4].
2. If the sources do not contain the answer, reply exactly: I don't know from my sources.
   Do not use outside knowledge, even if you know the answer.
3. Keep it short: 2 to 4 sentences in plain English for a curious beginner. Give numbers with their units.
4. {focus}"""


class ChatUnavailable(RuntimeError):
    """The language model cannot be reached or is not configured."""


@lru_cache
def get_client():
    from dotenv import load_dotenv
    from groq import Groq

    load_dotenv(ROOT / ".env")
    key = os.getenv("GROQ_API_KEY", "").strip()
    if not key:
        raise ChatUnavailable("The chat is not set up on the server (no language model key).")
    return Groq(api_key=key, timeout=30, max_retries=1)


def model_name() -> str:
    return os.getenv("GROQ_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL


def call_llm(messages: list[dict]) -> str:
    """Send the messages to the language model on Groq and return its reply text."""
    try:
        reply = get_client().chat.completions.create(
            model=model_name(),
            messages=messages,
            temperature=0.2,  # low: stick to the sources, little variety
            max_tokens=800,  # gpt-oss thinks before it answers, so leave room
            extra_body={"reasoning_effort": "low"},
        )
    except ChatUnavailable:
        raise
    except Exception as err:  # network error, rate limit, model unavailable
        raise ChatUnavailable("The language model did not answer. Please try again in a moment.") from err
    return (reply.choices[0].message.content or "").strip()


def build_messages(question: str, hits: list[Hit], object_name: str | None, history: list[dict]) -> list[dict]:
    focus = (f'The user is looking at {object_name}. Words like "it" or "this" mean {object_name}.'
             if object_name else "The user has not picked an object.")
    sources = "\n\n".join(
        f"[{n}] {h.chunk['title']} - {h.chunk['section']}\n{h.chunk['text']}" for n, h in enumerate(hits, start=1)
    )
    messages = [{"role": "system", "content": SYSTEM_RULES.format(focus=focus)}]
    for turn in history[-HISTORY_TURNS:]:
        messages.append({"role": turn["role"], "content": turn["content"]})
    messages.append({"role": "user", "content": f"Sources:\n\n{sources}\n\nQuestion: {question}"})
    return messages


def cited_numbers(answer: str) -> set[int]:
    return {int(n) for n in re.findall(r"\[(\d+)\]", answer)}


def answer_question(question: str, object_id: str | None, object_name: str | None, history: list[dict]) -> dict:
    """Retrieve, ask the language model, and return the answer with its numbered sources and timings."""
    t0 = time.perf_counter()
    query = f"{object_name}: {question}" if object_name else question
    hits = search(query, object_id)
    t1 = time.perf_counter()
    answer = call_llm(build_messages(question, hits, object_name, history))
    t2 = time.perf_counter()
    refused = REFUSAL.lower().rstrip(".") in answer.lower()
    used = set() if refused else cited_numbers(answer)
    citations = [
        {"n": n, "title": h.chunk["title"], "url": h.chunk["url"], "section": h.chunk["section"],
         "object_id": h.chunk["object_id"], "snippet": h.chunk["text"][:240], "score": round(h.score, 3),
         "cited": n in used}
        for n, h in enumerate(hits, start=1)
    ]
    return {"answer": answer or REFUSAL, "refused": refused, "citations": citations,
            "retrieval_ms": round((t1 - t0) * 1000, 1), "llm_ms": round((t2 - t1) * 1000, 1)}
