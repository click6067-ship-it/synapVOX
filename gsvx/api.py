"""Graphiti 기반 FastAPI — 프론트(static/graph.html) 계약을 그대로 구현(async).

project_id는 X-API-Key에서 서버가 결정. Graphiti의 group_id로 매핑되어 그래프 격리.
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


def create_app(engine, corpus, key_map, cors_origins, readonly=False, allow_reset=False):
    """readonly=True 면 쓰기(ingest/reset)를 막는다 — 사전 시드된 그래프만 조회하는
    공개 배포용(익명 사용자가 비싼 LLM 추출을 못 돌리게 비용/남용 방어).

    allow_reset=False(기본)면 /reset은 readonly 여부와 무관하게 항상 403 —
    home create flow용으로 SVX_READONLY=0을 켠 공개 데모에서도 /reset(그룹 전체
    DETACH-DELETE)만은 별도로 꺼져 있어야 한다(SVX_ALLOW_RESET로만 명시적 활성화)."""

    @asynccontextmanager
    async def lifespan(app):
        await engine.init()
        yield
        await engine.close()

    app = FastAPI(title="SynapVox — Graphiti 지식 그래프", lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=cors_origins,
                       allow_methods=["GET", "POST"], allow_headers=["X-API-Key"])

    def _valid_key(x_api_key: str | None) -> bool:
        return bool(x_api_key) and hashlib.sha256(x_api_key.encode()).hexdigest() in key_map

    def project_id(project: str = "P-BIO",
                    x_api_key: str | None = Header(None, alias="X-API-Key")) -> str:
        # FastAPI dependency ⇒ 이 400은 라우트 본문의 _guard_write() 보다 먼저 실행된다 —
        # 쓰기 엔드포인트에서도 project가 유효하지 않으면 403이 아니라 400이 먼저 뜬다.
        if not _valid_key(x_api_key):
            raise HTTPException(401, "invalid API key")
        if not _PROJECT_RE.fullmatch(project):
            raise HTTPException(400, "invalid project id")
        return project

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
        title = (body.get("title") or "").strip() or "붙여넣은 강의"
        n = len(await engine.sessions_in(project))
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
