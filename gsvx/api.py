"""Graphiti 기반 FastAPI — 프론트(static/graph.html) 계약을 그대로 구현(async).

인증·프로젝트 계약:
  - X-API-Key가 클라이언트를 인증한다(key_map 멤버십). 키의 매핑값(key_map[hash])은
    그 키의 '기본 프로젝트'로, 요청에 project가 없을 때 쓰인다.
  - project(쿼리/바디)는 Graphiti group_id 네임스페이스다. 인증된 클라이언트는
    명시적으로 다른 네임스페이스도 지정할 수 있다(홈 생성 플로우가 임의 슬러그로
    새 그래프를 만들기 때문 — 고정 allow-list로 묶으면 그 기능이 깨진다).
  - 단일 테넌트 공개 데모 전제: 키는 '데모 접근'을 게이트하지, 데모 프로젝트들 사이를
    격리하지 않는다. 남용 방어는 (a) 쓰기 상한(_MAX_*), (b) 파괴적 /reset 별도 게이트로
    한다. 다중 테넌트가 필요해지면 key_map 값을 '허용 프로젝트 집합'으로 확장하면 된다.
"""

import hashlib
import re
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

STATIC = Path(__file__).parent.parent / "static"

_PROJECT_RE = re.compile(r"[A-Za-z0-9_-]{1,64}")

# 쓰기 남용 상한 — 클라이언트에 shipped된 공개 데모 키로도 비용/저장이 무한정
# 늘지 않게 한다(leaked-key billing-DoS 방어). readonly=False(홈 생성 허용) 배포에서만 의미.
_MAX_TEXT_CHARS = 50_000  # 한 번에 넣는 본문 상한(긴 단일 강의도 충분히 커버)
_MAX_SESSIONS_PER_PROJECT = 40  # 프로젝트당 세션 수 상한
_MAX_PROJECTS = 60  # 새 그룹 무한 생성 방어(신규 프로젝트 최초 ingest에서만 검사)


def create_app(engine, corpus, key_map, cors_origins, readonly=False, allow_reset=False):
    """readonly=True 면 쓰기(ingest/reset)를 막는다 — 사전 시드된 그래프만 조회하는
    공개 배포용(익명 사용자가 비싼 LLM 추출을 못 돌리게 비용/남용 방어).

    readonly=False(홈 생성 플로우용)여도 쓰기는 _MAX_* 상한으로 제한되고, /reset은
    allow_reset로만 열린다. allow_reset=False(기본)면 /reset은 readonly 여부와 무관하게
    항상 403 — 공개 데모 키로 그룹 전체(DETACH-DELETE)를 지우는 것을 막는 별도 게이트."""

    @asynccontextmanager
    async def lifespan(app):
        await engine.init()
        yield
        await engine.close()

    app = FastAPI(title="SynapVox — Graphiti 지식 그래프", lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=cors_origins,
                       allow_methods=["GET", "POST"], allow_headers=["X-API-Key"])

    def _key_hash(x_api_key: str | None) -> str | None:
        return hashlib.sha256(x_api_key.encode()).hexdigest() if x_api_key else None

    def _valid_key(x_api_key: str | None) -> bool:
        return _key_hash(x_api_key) in key_map

    def project_id(project: str | None = None,
                    x_api_key: str | None = Header(None, alias="X-API-Key")) -> str:
        # FastAPI dependency ⇒ 이 400은 라우트 본문의 _guard_write() 보다 먼저 실행된다 —
        # 쓰기 엔드포인트에서도 project가 유효하지 않으면 403이 아니라 400이 먼저 뜬다.
        if not _valid_key(x_api_key):
            raise HTTPException(401, "invalid API key")
        # project 미지정 → 이 키의 기본 프로젝트(key_map 값). 지정 시 그 네임스페이스로.
        resolved = project if project is not None else key_map[_key_hash(x_api_key)]
        if not _PROJECT_RE.fullmatch(resolved):
            raise HTTPException(400, "invalid project id")
        return resolved

    def _guard_write():
        if readonly:
            raise HTTPException(403, "읽기 전용 배포입니다 — 사전 시드된 그래프만 조회할 수 있습니다.")

    def _guard_reset():
        if readonly or not allow_reset:
            raise HTTPException(403, "reset은 이 배포에서 비활성화되어 있습니다.")

    def _resolve_project(raw: str | None, default: str) -> str:
        """ingest-text/reset — body의 project(있으면)를 쿼리/기본값보다 우선."""
        raw = (raw or "").strip()
        if not raw:
            return default
        if not _PROJECT_RE.fullmatch(raw):
            raise HTTPException(400, "invalid project id")
        return raw

    @app.get("/")
    def index():
        return FileResponse(STATIC / "graph.html")

    @app.get("/config")
    def config():
        return {"rag_enabled": True, "chat_model": engine.answer_model,
                "embed_model": engine.embed_model, "engine": "graphiti",
                "extract_model": engine.extract_model, "readonly": readonly}

    @app.get("/projects")
    async def projects(x_api_key: str | None = Header(None, alias="X-API-Key")):
        if not _valid_key(x_api_key):
            raise HTTPException(401, "invalid API key")
        return {"projects": await engine.list_projects()}

    @app.get("/corpus")
    async def corpus_list(pid: str = Depends(project_id)):
        ingested = {r["name"] for r in await engine.sessions_in(pid)}
        items = sorted(corpus.values(), key=lambda s: s["seq"])
        return {"sessions": [{"session_key": s["session_key"], "seq": s["seq"], "title": s["title"],
                              "chapter": s.get("chapter", ""), "ingested": s["title"] in ingested} for s in items]}

    @app.post("/ingest")
    async def ingest(body: dict, pid: str = Depends(project_id)):
        _guard_write()
        key = body.get("session_key")
        s = corpus.get(key)
        if not s:
            raise HTTPException(404, "unknown session_key")
        out = await engine.ingest(pid, s["title"], s["text"], s["seq"])
        out["session_key"] = key
        return out

    @app.post("/ingest-text")
    async def ingest_text(body: dict, pid: str = Depends(project_id)):
        _guard_write()
        project = _resolve_project(body.get("project"), pid)
        text = (body.get("text") or "").strip()
        if not text:
            raise HTTPException(400, "text가 비어 있습니다")
        if len(text) > _MAX_TEXT_CHARS:
            raise HTTPException(413, f"텍스트가 너무 깁니다 (최대 {_MAX_TEXT_CHARS:,}자). 나눠서 넣어 주세요.")
        title = (body.get("title") or "").strip() or "붙여넣은 강의"
        n = len(await engine.sessions_in(project))
        if n >= _MAX_SESSIONS_PER_PROJECT:
            raise HTTPException(429, f"이 프로젝트의 세션 한도({_MAX_SESSIONS_PER_PROJECT})에 도달했습니다.")
        if n == 0:  # 새 프로젝트(그룹) 생성 시점에만 총 프로젝트 수 상한 검사
            if len(await engine.list_projects()) >= _MAX_PROJECTS:
                raise HTTPException(429, f"프로젝트 한도({_MAX_PROJECTS})에 도달했습니다.")
        return await engine.ingest(project, title, text, seq=n + 1)

    @app.post("/reset")
    async def reset(body: dict | None = None, pid: str = Depends(project_id)):
        _guard_reset()
        project = _resolve_project((body or {}).get("project"), pid)
        await engine.reset(project)
        return {"ok": True}

    @app.get("/graph")
    async def graph(pid: str = Depends(project_id)):
        return await engine.graph(pid)

    @app.get("/concept/{cid}")
    async def concept(cid: str, pid: str = Depends(project_id)):
        d = await engine.concept_detail(pid, cid)
        if not d:
            raise HTTPException(404, "unknown concept")
        return d

    @app.get("/session/{sid}")
    async def session(sid: str, pid: str = Depends(project_id)):
        d = await engine.session_detail(pid, sid)
        if not d:
            raise HTTPException(404, "unknown session")
        return d

    @app.get("/search")
    async def search(q: str, k: int = 8, pid: str = Depends(project_id)):
        hits, _ = await engine.search(pid, q, k)
        return {"query": q, "hits": hits, "expansion": {"nodes": [], "edges": []}}

    @app.get("/ask")
    async def ask(q: str, k: int = 8, pid: str = Depends(project_id)):
        return await engine.ask(pid, q, k)

    @app.get("/timeline")
    async def timeline(pid: str = Depends(project_id)):
        return {"sessions": await engine.timeline(pid)}

    return app
