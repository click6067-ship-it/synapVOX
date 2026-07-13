import hashlib

import pytest
from fastapi.testclient import TestClient

from svx.api import create_app, segment_text, keywords_to_concepts
from svx.seeds import SeedDict
from tests.conftest import MINI, SEED_PATH

BIO_KEY = "demo-bio"


@pytest.fixture()
def client(tmp_path):
    seeds = SeedDict.from_file(str(SEED_PATH))
    key_map = {hashlib.sha256(BIO_KEY.encode()).hexdigest(): "P-T"}
    app = create_app(db_path=str(tmp_path / "t.db"), corpus=MINI, seeds=seeds,
                     key_map=key_map, cors_origins=["*"])
    return TestClient(app)


def h():
    return {"X-API-Key": BIO_KEY}


def test_segment_text_splits_paragraphs():
    segs = segment_text("첫 단락 문장.\n\n둘째 단락 문장.\n\n셋째")
    assert [s["seg_no"] for s in segs] == [1, 2, 3]
    assert segs[0]["text"] == "첫 단락 문장."


def test_keywords_to_concepts_stable_ids():
    cs = keywords_to_concepts(["세포주기", "세포주기 ", ""])
    assert len(cs) == 1 and cs[0]["concept_id"] == "USR_세포주기"


def test_ingest_text_creates_session_and_matches_seed(client):
    body = {"title": "붙여넣은 강의", "text": "효소는 활성화에너지를 낮춘다.\n\nATP가 에너지를 공급한다."}
    r = client.post("/ingest-text", json=body, headers=h())
    assert r.status_code == 200
    st = r.json()["stats"]
    assert st["segments"] == 2 and st["mentions"] >= 2  # 효소·활성화에너지·ATP
    g = client.get("/graph", headers=h()).json()
    sess = [n for n in g["nodes"] if n["type"] == "session"]
    assert any(n["label"] == "붙여넣은 강의" for n in sess)
    assert any(n["id"] == "C_ENZYME" for n in g["nodes"])


def test_ingest_text_user_keyword_becomes_concept(client):
    body = {"title": "사용자 개념", "text": "오늘은 세포주기와 감수분열을 다룬다.",
            "keywords": ["세포주기", "감수분열"]}
    client.post("/ingest-text", json=body, headers=h())
    ids = {n["id"] for n in client.get("/graph", headers=h()).json()["nodes"]}
    assert "USR_세포주기" in ids and "USR_감수분열" in ids


def test_ingest_text_connects_to_existing_graph(client):
    # 먼저 샘플 세션 하나 적재(효소 포함) → 텍스트로 효소 다룬 새 세션 추가 → 공유 개념으로 연결
    client.post("/ingest", json={"session_key": "T1"}, headers=h())
    client.post("/ingest-text", json={"title": "효소 특강", "text": "효소의 활성화에너지 감소를 복습한다."}, headers=h())
    edges = client.get("/graph", headers=h()).json()["edges"]
    # 두 세션이 개념(효소/활성화에너지)을 공유 → backbone으로 둘 다 연결
    bb = [e for e in edges if e["rel_type"] == "SESSION_MENTIONS_CONCEPT"]
    enzyme_sessions = {e["src"] for e in bb if e["dst"] == "C_ENZYME"}
    assert "T1" in enzyme_sessions and any(s.startswith("U") for s in enzyme_sessions)


def test_ingest_text_empty_400(client):
    assert client.post("/ingest-text", json={"text": "   "}, headers=h()).status_code == 400
