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
        self.last_ingest_project = self.last_reset_project = None
        self.last_project = self.last_ask = self.last_search = None
        self.last_ingest_name = None
        self.named = {}  # group_id → display name (set_project_name)
        # Configurable so cap tests can simulate a full project / many projects.
        self.sessions_count = 0
        self._projects = [{"project": "P-BIO", "sessions": 2, "concepts": 5, "name": None}]

    async def init(self):
        pass

    async def close(self):
        pass

    async def sessions_in(self, pid):
        return [{"name": f"s{i}"} for i in range(self.sessions_count)]

    async def ingest(self, pid, title, text, seq=None, name=None):
        self.last_ingest_project = pid
        self.last_ingest_name = name
        self.ingested.append((title, seq))
        return {"session_key": title, "stats": {"concepts_new": 0, "relations_new": 0}, "pipeline": []}

    async def set_project_name(self, pid, name):
        self.named[pid] = name

    async def reset(self, pid):
        self.last_reset_project = pid
        self.reset_called = True

    async def list_projects(self):
        return self._projects

    async def ask(self, pid, q, k=8):
        self.last_ask = (pid, q, k)
        return {"query": q, "answer": "stub 답변", "hits": [], "expansion": {"nodes": [], "edges": []}}

    async def search(self, pid, q, k=8):
        self.last_search = (pid, q, k)
        return ([], [])

    async def graph(self, pid):
        self.last_project = pid
        return {"nodes": [], "edges": []}


def _client(readonly, allow_reset=False):
    engine = StubEngine()
    app = create_app(engine, CORPUS, KEY_MAP, ["*"], readonly=readonly, allow_reset=allow_reset)
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


def test_ingest_text_body_project_overrides_engine():
    client, engine = _client(readonly=False)
    r = client.post("/ingest-text", json={"project": "P-DL", "text": "본문"}, headers=h())
    assert r.status_code == 200
    assert engine.last_ingest_project == "P-DL"


def test_invalid_project_id_returns_400():
    client, _ = _client(readonly=False)
    r = client.get("/graph?project=bad!id", headers=h())
    assert r.status_code == 400
    assert r.json()["detail"] == "invalid project id"


def test_default_project_from_key_map():
    # project 미지정이면 key_map 값(이 키의 기본 프로젝트)이 쓰인다 — 하드코딩 아님.
    eng = StubEngine()
    app = create_app(eng, CORPUS, {hashlib.sha256(b"demo-bio").hexdigest(): "P-DEFAULT"}, ["*"], readonly=False)
    with TestClient(app) as c:
        c.get("/graph", headers=h())
    assert eng.last_project == "P-DEFAULT"


def test_ingest_text_rejects_too_long():
    client, engine = _client(readonly=False)
    r = client.post("/ingest-text", json={"text": "가" * 50_001}, headers=h())
    assert r.status_code == 413
    assert engine.ingested == []  # 상한 초과는 엔진(비싼 LLM 추출) 호출 전에 차단


def test_ingest_text_session_cap():
    client, engine = _client(readonly=False)
    engine.sessions_count = 40  # 프로젝트가 세션 한도에 도달
    r = client.post("/ingest-text", json={"text": "본문"}, headers=h())
    assert r.status_code == 429
    assert engine.ingested == []


def test_ingest_text_project_cap_on_new_project():
    client, engine = _client(readonly=False)
    engine.sessions_count = 0  # 신규 프로젝트(그룹 생성 시점)
    engine._projects = [{"project": f"P-{i}", "sessions": 1, "concepts": 1} for i in range(60)]
    r = client.post("/ingest-text", json={"project": "P-NEW", "text": "본문"}, headers=h())
    assert r.status_code == 429
    assert engine.ingested == []


def test_ingest_text_within_caps_succeeds():
    client, engine = _client(readonly=False)
    engine.sessions_count = 3  # 기존 프로젝트에 추가(신규 아님 → 프로젝트 캡 검사 스킵)
    r = client.post("/ingest-text", json={"text": "짧은 본문"}, headers=h())
    assert r.status_code == 200
    assert engine.ingested == [("붙여넣은 강의", 4)]  # seq = n+1


def test_ingest_text_passes_display_name():
    # 한글 표시 이름을 body.name으로 넘기면 엔진 ingest에 그대로 전달된다.
    client, engine = _client(readonly=False)
    r = client.post("/ingest-text", json={"project": "graph-xyz", "text": "본문", "name": "최적화개론"}, headers=h())
    assert r.status_code == 200
    assert engine.last_ingest_name == "최적화개론"


def test_ingest_text_no_name_passes_none():
    client, engine = _client(readonly=False)
    client.post("/ingest-text", json={"text": "본문"}, headers=h())
    assert engine.last_ingest_name is None


def test_project_name_sets_display_name():
    client, engine = _client(readonly=False)
    r = client.post("/project-name", json={"project": "graph-xyz", "name": "고급신경망"}, headers=h())
    assert r.status_code == 200
    assert r.json() == {"ok": True, "project": "graph-xyz", "name": "고급신경망"}
    assert engine.named["graph-xyz"] == "고급신경망"


def test_project_name_requires_name():
    client, _ = _client(readonly=False)
    r = client.post("/project-name", json={"project": "graph-xyz", "name": "  "}, headers=h())
    assert r.status_code == 400


def test_project_name_blocked_in_readonly():
    client, engine = _client(readonly=True)
    r = client.post("/project-name", json={"project": "graph-xyz", "name": "x"}, headers=h())
    assert r.status_code == 403
    assert engine.named == {}


def test_projects_endpoint_includes_name():
    client, engine = _client(readonly=False)
    engine._projects = [{"project": "graph-xyz", "sessions": 1, "concepts": 9, "name": "최적화개론"}]
    r = client.get("/projects", headers=h())
    assert r.json()["projects"][0]["name"] == "최적화개론"


def test_write_rate_limit_per_ip():
    # 창당 IP별 30회까지 허용, 31회째 429 — 반복 ingest 비용폭주 방어.
    client, engine = _client(readonly=False)
    engine.sessions_count = 1  # 기존 프로젝트 append (프로젝트 캡 검사 스킵)
    for i in range(30):
        r = client.post("/ingest-text", json={"text": "x"}, headers=h())
        assert r.status_code == 200, f"call {i} → {r.status_code}"
    r = client.post("/ingest-text", json={"text": "x"}, headers=h())
    assert r.status_code == 429


def test_rate_limit_not_bypassable_via_forged_xff():
    # 왼쪽(클라이언트 위조 가능) 홉을 매 요청 바꿔도 신뢰 프록시가 붙인 오른쪽 홉이 같으면
    # 같은 버킷 → X-Forwarded-For 위조로 rate limit을 우회할 수 없다.
    client, engine = _client(readonly=False)
    engine.sessions_count = 1
    for i in range(30):
        hdr = {**h(), "X-Forwarded-For": f"9.9.9.{i}, 203.0.113.7"}  # 왼쪽 위조·오른쪽 실제
        assert client.post("/ingest-text", json={"text": "x"}, headers=hdr).status_code == 200, i
    hdr = {**h(), "X-Forwarded-For": "1.1.1.1, 203.0.113.7"}
    assert client.post("/ingest-text", json={"text": "x"}, headers=hdr).status_code == 429


def test_ask_rate_limited():
    # 공개 /ask(LLM 호출)도 per-IP 속도 제한 — 60회까지, 61회째 429.
    client, _ = _client(readonly=False)
    for i in range(60):
        assert client.get("/ask?q=hi", headers=h()).status_code == 200, i
    assert client.get("/ask?q=hi", headers=h()).status_code == 429


def test_ask_query_length_capped():
    client, _ = _client(readonly=False)
    r = client.get("/ask", params={"q": "가" * 1001}, headers=h())
    assert r.status_code == 413


def test_ask_k_is_clamped():
    client, engine = _client(readonly=False)
    r = client.get("/ask?q=hi&k=999", headers=h())
    assert r.status_code == 200
    assert engine.last_ask[2] == 20  # _MAX_K 로 클램프(비용/지연 폭증 방지)


def test_ask_and_search_have_separate_buckets():
    # /ask 버킷을 소진해도 /search는 별개 버킷 → 서로 굶기지 않음.
    client, _ = _client(readonly=False)
    for _ in range(60):
        client.get("/ask?q=hi", headers=h())
    assert client.get("/ask?q=hi", headers=h()).status_code == 429
    assert client.get("/search?q=hi", headers=h()).status_code == 200


def test_rate_limit_is_app_scoped():
    # 앱마다 별도 로그 — 한 배포의 스로틀이 다른 배포로 새지 않음(테스트 격리도 보장).
    c1, e1 = _client(readonly=False); e1.sessions_count = 1
    c2, e2 = _client(readonly=False); e2.sessions_count = 1
    for _ in range(30):
        c1.post("/ingest-text", json={"text": "x"}, headers=h())
    assert c1.post("/ingest-text", json={"text": "x"}, headers=h()).status_code == 429
    assert c2.post("/ingest-text", json={"text": "x"}, headers=h()).status_code == 200


def test_reset_blocked_by_default_even_when_writable():
    # readonly=False(쓰기 가능한 배포)여도 allow_reset이 기본값(False)이면 /reset은 403 —
    # 공개 데모 키로 그룹 전체를 지우는 것을 막는 별도 게이트.
    client, engine = _client(readonly=False, allow_reset=False)
    r = client.post("/reset", headers=h())
    assert r.status_code == 403
    assert engine.reset_called is False


def test_reset_allowed_when_flag_set():
    client, engine = _client(readonly=False, allow_reset=True)
    r = client.post("/reset", headers=h())
    assert r.status_code == 200
    assert engine.reset_called is True
