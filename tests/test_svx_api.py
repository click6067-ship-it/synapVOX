import hashlib

import pytest
from fastapi.testclient import TestClient

from svx.api import create_app
from svx.seeds import SeedDict
from tests.conftest import MINI, SEED_PATH

BIO_KEY = "demo-bio"
OTHER_KEY = "other-key"


@pytest.fixture()
def client(tmp_path):
    seeds = SeedDict.from_file(str(SEED_PATH))
    key_map = {
        hashlib.sha256(BIO_KEY.encode()).hexdigest(): "P-T",
        hashlib.sha256(OTHER_KEY.encode()).hexdigest(): "P-OTHER",
    }
    app = create_app(db_path=str(tmp_path / "api.db"), corpus=MINI, seeds=seeds,
                     key_map=key_map, cors_origins=["http://127.0.0.1:8000"])
    return TestClient(app)


def h(key=BIO_KEY):
    return {"X-API-Key": key}


def test_auth_required(client):
    assert client.get("/graph").status_code == 401
    assert client.get("/graph", headers=h("nope")).status_code == 401


def test_corpus_lists_and_ingest_flag(client):
    r = client.get("/corpus", headers=h()).json()
    keys = {s["session_key"] for s in r["sessions"]}
    assert {"T1", "T2", "T3"} <= keys and "TX" not in keys  # P-T 프로젝트만
    assert all(s["ingested"] is False for s in r["sessions"])


def test_ingest_then_graph_grows(client):
    r = client.post("/ingest", json={"session_key": "T1"}, headers=h())
    assert r.status_code == 200
    body = r.json()
    assert body["stats"]["segments"] == 1 and len(body["pipeline"]) == 5
    n1 = len(client.get("/graph", headers=h()).json()["nodes"])
    client.post("/ingest", json={"session_key": "T2"}, headers=h())
    n2 = len(client.get("/graph", headers=h()).json()["nodes"])
    assert n2 >= n1  # 증분 성장
    # corpus ingested flag 갱신
    corpus = client.get("/corpus", headers=h()).json()["sessions"]
    assert next(s for s in corpus if s["session_key"] == "T1")["ingested"] is True


def test_graph_isolation_by_key(client):
    for k in ["T1", "T2", "T3"]:
        client.post("/ingest", json={"session_key": k}, headers=h())
    client.post("/ingest", json={"session_key": "TX"}, headers=h(OTHER_KEY))
    bio_nodes = {n["id"] for n in client.get("/graph", headers=h()).json()["nodes"]}
    assert "TX" not in bio_nodes
    other_nodes = {n["id"] for n in client.get("/graph", headers=h(OTHER_KEY)).json()["nodes"]}
    assert "TX" in other_nodes and "T1" not in other_nodes


def test_concept_evidence_has_spans(client):
    client.post("/ingest", json={"session_key": "T1"}, headers=h())
    d = client.get("/concept/C_ENZYME", headers=h()).json()
    assert d["label"] == "효소"
    ev = d["evidence"][0]
    assert ev["text"][ev["char_start"]:ev["char_end"]] == ev["matched_text"] == "효소"


def test_search_no_leak(client):
    client.post("/ingest", json={"session_key": "T1"}, headers=h())
    client.post("/ingest", json={"session_key": "TX"}, headers=h(OTHER_KEY))
    hits = client.get("/search", params={"q": "효소"}, headers=h()).json()["hits"]
    assert hits and all(x["session_id"] != "TX" for x in hits)


def test_timeline_order(client):
    for k in ["T2", "T1", "T3"]:  # 순서 섞어 넣어도
        client.post("/ingest", json={"session_key": k}, headers=h())
    seqs = [s["seq"] for s in client.get("/timeline", headers=h()).json()["sessions"]]
    assert seqs == sorted(seqs)


def test_reset_clears(client):
    client.post("/ingest", json={"session_key": "T1"}, headers=h())
    client.post("/reset", headers=h())
    assert len(client.get("/graph", headers=h()).json()["nodes"]) == 0
