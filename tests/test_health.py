from fastapi.testclient import TestClient

from app.main import app, load_objects

client = TestClient(app)


def test_health_says_ok():
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["objects"] == len(load_objects())


def test_objects_endpoint_returns_every_object():
    response = client.get("/objects")
    assert response.status_code == 200
    assert len(response.json()) == len(load_objects())


def test_cors_allows_the_local_page():
    response = client.get("/health", headers={"Origin": "http://localhost:5173"})
    assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"
