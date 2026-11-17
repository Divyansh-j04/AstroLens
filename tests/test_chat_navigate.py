"""POST /chat and POST /navigate. The language model is replaced by a fake, so these tests are
free, fast and give the same result every time; the real model is measured by ml/scripts/eval_rag.py."""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.nlp import chat as chat_module
from app.nlp.retriever import index_ready

client = TestClient(app)
needs_index = pytest.mark.skipif(not index_ready(), reason="run ml/scripts/build_index.py first")


@pytest.fixture
def fake_llm(monkeypatch):
    """Replace the language model; records the messages it was sent."""
    calls: list[list[dict]] = []

    def install(reply: str = "Venus is the hottest planet [1]. Its clouds trap heat [3].", error: bool = False):
        def fake(messages):
            calls.append(messages)
            if error:
                raise chat_module.ChatUnavailable("The language model did not answer. Please try again in a moment.")
            return reply

        monkeypatch.setattr(chat_module, "call_llm", fake)
        return calls

    return install


@needs_index
def test_chat_answer_has_numbered_sources_and_marks_cited_ones(fake_llm):
    calls = fake_llm()
    r = client.post("/chat", json={"message": "How hot is it?", "object_id": "venus"})
    assert r.status_code == 200
    body = r.json()
    assert len(body["citations"]) == 5
    assert [c["n"] for c in body["citations"]] == [1, 2, 3, 4, 5]
    assert [c["cited"] for c in body["citations"]] == [True, False, True, False, False]
    assert not body["refused"]
    assert all(c["url"].startswith("https://") for c in body["citations"])
    # The prompt holds the rules, the numbered sources and the question; "it" is tied to Venus.
    system, user = calls[0][0]["content"], calls[0][-1]["content"]
    assert "ONLY the numbered sources" in system and "I don't know from my sources" in system
    assert "Venus" in system
    assert user.startswith("Sources:") and "[5]" in user and user.endswith("Question: How hot is it?")


@needs_index
def test_current_object_texts_come_first(fake_llm):
    fake_llm()
    body = client.post("/chat", json={"message": "How big is it?", "object_id": "mars"}).json()
    assert body["citations"][0]["object_id"] == "mars"


@needs_index
def test_refusal_is_flagged_and_cites_nothing(fake_llm):
    fake_llm(chat_module.REFUSAL)
    body = client.post("/chat", json={"message": "Who won the World Cup?", "object_id": "earth"}).json()
    assert body["refused"] is True
    assert not any(c["cited"] for c in body["citations"])


@needs_index
def test_history_is_passed_to_the_model(fake_llm):
    calls = fake_llm()
    history = [{"role": "user", "content": "How hot is it?"}, {"role": "assistant", "content": "Very hot [1]."}]
    client.post("/chat", json={"message": "And how far from the Sun?", "object_id": "venus", "history": history})
    roles = [m["role"] for m in calls[0]]
    assert roles == ["system", "user", "assistant", "user"]


@needs_index
def test_model_failure_gives_503_with_a_plain_message(fake_llm):
    fake_llm(error=True)
    r = client.post("/chat", json={"message": "How hot is it?", "object_id": "venus"})
    assert r.status_code == 503
    assert "try again" in r.json()["detail"]


def test_chat_rejects_unknown_object_and_empty_message():
    assert client.post("/chat", json={"message": "hi", "object_id": "pluto"}).status_code == 400
    assert client.post("/chat", json={"message": ""}).status_code == 422


@pytest.mark.parametrize(
    "text, intent, object_id",
    [
        ("take me to the red planet", "fly_to", "mars"),
        ("Saturn", "fly_to", "saturn"),
        ("seven sisters", "fly_to", "pleiades"),
        ("jupitr", "fly_to", "jupiter"),  # typo, caught by the spelling similarity
        ("M42", "fly_to", "orion_nebula"),
        ("how hot is Mars?", "chat", "mars"),  # a question goes to the chat, about Mars
        ("what is the meaning of life", "chat", None),
        ("take me to Titan", "fly_to", "titan"),  # moons added Nov 17
        ("the volcanic moon", "fly_to", "io"),
    ],
)
def test_navigate(text, intent, object_id):
    body = client.post("/navigate", json={"text": text}).json()
    assert body["intent"] == intent
    assert body["object_id"] == object_id
    assert body["needs_clarification"] is False


def test_ambiguous_text_asks_which_object():
    body = client.post("/navigate", json={"text": "nebula"}).json()
    assert body["intent"] == "clarify" and body["needs_clarification"] is True
    assert len(body["candidates"]) == 2
    assert all(c["name"].endswith("Nebula") for c in body["candidates"])


@needs_index
def test_moon_questions_find_the_moons_texts(fake_llm):
    fake_llm()
    body = client.post("/chat", json={"message": "What are its lakes made of?", "object_id": "titan"}).json()
    assert body["citations"][0]["object_id"] == "titan"

