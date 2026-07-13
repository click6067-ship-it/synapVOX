"""Graphiti 기반 FastAPI — 프론트(static/graph.html) 계약을 그대로 구현(async).

project_id는 X-API-Key에서 서버가 결정. Graphiti의 group_id로 매핑되어 그래프 격리.
"""

import hashlib
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

STATIC = Path(__file__).parent.parent / "static"


def create_app(engine, corpus, key_map, cors_origins):
    @asynccontextmanager
    async def lifespan(app):
        await engine.init()
        yield
        await engine.close()

    app = FastAPI(title="SynapVox — Graphiti 지식 그래프", lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=cors_origins,
                       allow_methods=["GET", "POST"], allow_headers=["X-API-Key"])

    def project_id(x_api_key: str | None = Header(None, alias="X-API-Key")) -> str:
        if not x_api_key:
            raise HTTPException(401, "API key required")
        pid = key_map.get(hashlib.sha256(x_api_key.encode()).hexdigest())
        if pid is None:
            raise HTTPException(401, "invalid API key")
        return pid

    @app.get("/")
    def index():
        return FileResponse(STATIC / "graph.html")

    @app.get("/config")
    def config():
        return {"rag_enabled": True, "chat_model": engine.answer_model,
                "embed_model": engine.embed_model, "engine": "graphiti",
                "extract_model": engine.extract_model}

    @app.get("/corpus")
    async def corpus_list(pid: str = Depends(project_id)):
        ingested = {r["name"] for r in await engine.sessions_in(pid)}
        items = sorted(corpus.values(), key=lambda s: s["seq"])
        return {"sessions": [{"session_key": s["session_key"], "seq": s["seq"], "title": s["title"],
                              "chapter": s.get("chapter", ""), "ingested": s["title"] in ingested} for s in items]}

    @app.post("/ingest")
    async def ingest(body: dict, pid: str = Depends(project_id)):
        key = body.get("session_key")
        s = corpus.get(key)
        if not s:
            raise HTTPException(404, "unknown session_key")
        out = await engine.ingest(pid, s["title"], s["text"], s["seq"])
        out["session_key"] = key
        return out

    @app.post("/ingest-text")
    async def ingest_text(body: dict, pid: str = Depends(project_id)):
        text = (body.get("text") or "").strip()
        if not text:
            raise HTTPException(400, "text가 비어 있습니다")
        title = (body.get("title") or "").strip() or "붙여넣은 강의"
        n = len(await engine.sessions_in(pid))
        return await engine.ingest(pid, title, text, seq=n + 1)

    @app.post("/reset")
    async def reset(pid: str = Depends(project_id)):
        await engine.reset(pid)
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
