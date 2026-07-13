import hashlib
import json
import pathlib

import pytest
from fastapi.testclient import TestClient

from app.api import create_app
from app.repo import Repository

FIXTURES = json.loads(
    (pathlib.Path(__file__).parent.parent / "fixtures" / "meetings.json").read_text()
)

DEMO_KEY = "demo-key-for-tests"


@pytest.fixture()
def client(tmp_path):
    db_path = str(tmp_path / "api.db")
    repo = Repository(db_path)
    for doc in FIXTURES:
        repo.ingest_meeting(doc)
    key_map = {hashlib.sha256(DEMO_KEY.encode()).hexdigest(): "P-DEMO"}
    app = create_app(db_path=db_path, key_map=key_map, cors_origins=["http://127.0.0.1:8000"])
    return TestClient(app)


def auth(key=DEMO_KEY):
    return {"X-API-Key": key}


def test_rejects_missing_or_wrong_key(client):
    assert client.get("/timeline").status_code == 401
    assert client.get("/timeline", headers=auth("wrong")).status_code == 401


def test_timeline_scoped_by_key_project(client):
    r = client.get("/timeline", headers=auth())
    assert r.status_code == 200
    ids = [m["meeting_id"] for m in r.json()["meetings"]]
    assert ids == ["M01", "M02", "M03", "M04", "M05"]


def test_search_endpoint_returns_hits_without_leak(client):
    r = client.get("/search", params={"q": "챗봇 답변 정확도"}, headers=auth())
    assert r.status_code == 200
    assert all(h["meeting_id"] != "MX1" for h in r.json()["hits"])


def test_graph_endpoint_shape(client):
    r = client.get("/graph/shared-topics", headers=auth())
    assert r.status_code == 200
    g = r.json()
    assert {n["meeting_id"] for n in g["nodes"]} == {"M01", "M02", "M03", "M04", "M05"}
    assert g["edges"] and all({"src", "dst", "weight", "shared_topics"} <= set(e.keys()) for e in g["edges"])


def test_ingest_forces_project_id_from_key(client):
    doc = {
        "meeting_id": "M99", "project_id": "P-EVIL", "date": "2026-07-14",
        "mode": "meeting", "source": "s", "doc_refs": [], "summary": "침투 시도",
        "segments": [{"id": 1, "speaker": "A", "ts_start": 0, "ts_end": 1, "text": "임의 프로젝트에 쓰기", "topics": ["침투"]}],
        "bookmarks": [], "decisions": [], "action_items": [],
    }
    r = client.post("/meetings", json=doc, headers=auth())
    assert r.status_code == 201
    # 클라이언트가 보낸 P-EVIL은 무시되고 key의 프로젝트로 저장된다
    tl = client.get("/timeline", headers=auth()).json()["meetings"]
    assert "M99" in [m["meeting_id"] for m in tl]


def test_annotation_payload_not_exposed_via_api(client):
    tl = client.get("/timeline", headers=auth()).json()["meetings"]
    m04 = next(m for m in tl if m["meeting_id"] == "M04")
    dumped = json.dumps(m04, ensure_ascii=False)
    assert "supersedes_hint" not in dumped
