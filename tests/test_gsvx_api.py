"""gsvx(Graphiti 판) API — 쿼리 전용(readonly) 모드 검증.

실제 GraphitiEngine 은 Neo4j+OpenAI 가 필요하므로, create_app 계약만 태우는 StubEngine 으로
readonly 게이트(쓰기 차단·조회 허용·config 노출)를 검증한다. 배포 비용/남용 방어의 회귀 가드.
"""

import hashlib

import pytest
from fastapi.testclient import TestClient

from gsvx.api import create_app

BIO_KEY = "demo-bio"
KEY_MAP = {hashlib.sha256(BIO_KEY.encode()).hexdigest(): "P-BIO"}
CORPUS = {"S1": {"session_key": "S1", "seq": 1, "title": "물질대사", "chapter": "대사", "text": "본문"}}


class StubEngine:
    """create_app 이 부르는 메서드/속성만 갖춘 최소 엔진."""
    answer_model, embed_model, extract_model = "gpt-x", "emb-x", "ext-x"

    def __init__(self):
        self.ingested, self.reset_called = [], False

    async def init(self):
        pass

    async def close(self):
        pass

    async def sessions_in(self, pid):
        return []

    async def ingest(self, pid, title, text, seq=None):
        self.ingested.append((title, seq))
        return {"session_key": title, "stats": {"concepts_new": 0, "relations_new": 0}, "pipeline": []}

    async def reset(self, pid):
        self.reset_called = True

    async def list_projects(self):
        return [{"project": "P-BIO", "sessions": 2, "concepts": 5}]

    async def graph(self, pid):
        self.last_project = pid
        return {"nodes": [], "edges": []}


def _client(readonly):
    engine = StubEngine()
    app = create_app(engine, CORPUS, KEY_MAP, ["*"], readonly=readonly)
    return TestClient(app), engine


def h(key=BIO_KEY):
    return {"X-API-Key": key}


def test_auth_required():
    client, _ = _client(readonly=True)
    assert client.get("/corpus").status_code == 401
    assert client.get("/corpus", headers=h("nope")).status_code == 401


def test_readonly_blocks_writes():
    client, engine = _client(readonly=True)
    # 키가 유효해도(인증 통과) 쓰기는 403 — 엔진의 ingest/reset 은 호출조차 안 됨.
    assert client.post("/ingest", json={"session_key": "S1"}, headers=h()).status_code == 403
    assert client.post("/ingest-text", json={"text": "x"}, headers=h()).status_code == 403
    assert client.post("/reset", headers=h()).status_code == 403
    assert engine.ingested == [] and engine.reset_called is False


def test_readonly_allows_reads_and_reports_flag():
    client, _ = _client(readonly=True)
    cfg = client.get("/config").json()
    assert cfg["readonly"] is True and cfg["engine"] == "graphiti"
    assert client.get("/corpus", headers=h()).status_code == 200


def test_writable_mode_ingests():
    client, engine = _client(readonly=False)
    assert client.get("/config").json()["readonly"] is False
    r = client.post("/ingest", json={"session_key": "S1"}, headers=h())
    assert r.status_code == 200 and r.json()["session_key"] == "S1"
    assert engine.ingested == [("물질대사", 1)]


def test_projects_auth_required():
    client, _ = _client(readonly=False)
    assert client.get("/projects").status_code == 401
    assert client.get("/projects", headers=h("nope")).status_code == 401


def test_projects_endpoint():
    client, _ = _client(readonly=False)
    r = client.get("/projects", headers=h())
    assert r.status_code == 200
    assert r.json()["projects"][0]["project"] == "P-BIO"


def test_graph_uses_project_param():
    eng = StubEngine()
    app = create_app(eng, CORPUS, KEY_MAP, ["*"], readonly=False)
    with TestClient(app) as c:
        c.get("/graph?project=P-DL", headers={"X-API-Key": "demo-bio"})
    assert eng.last_project == "P-DL"
