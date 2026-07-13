"""FastAPI 데모 API — blueprint §8. project_id는 클라이언트 입력이 아니라 X-API-Key에서 서버가 결정.

corpus = {session_key: session_doc(project 무관)}. /ingest는 key의 project로 세션을 적재.
"""

import hashlib
import re
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from svx.store import Store
from svx.ingest import Ingestor, Rag
from svx.embedder import HashingEmbedder

STATIC = Path(__file__).parent.parent / "static"


def segment_text(text: str) -> list[dict]:
    """규칙 기반 세그먼트화(비-LLM): 빈 줄 → 단락, 없으면 줄바꿈, 없으면 문장."""
    text = (text or "").strip()
    if not text:
        return []
    parts = [p.strip() for p in re.split(r"\n\s*\n+", text) if p.strip()]
    if len(parts) <= 1:
        parts = [p.strip() for p in text.split("\n") if p.strip()]
    if len(parts) <= 1:
        parts = [p.strip() for p in re.split(r"(?<=[.!?。])\s+", text) if p.strip()]
    return [{"seg_no": i + 1, "speaker": None, "text": p} for i, p in enumerate(parts[:40])]


def keywords_to_concepts(keywords) -> list[dict]:
    out, seen = [], set()
    for k in keywords or []:
        k = (k or "").strip()
        if not k:
            continue
        cid = "USR_" + re.sub(r"\s+", "", k)
        if cid in seen:
            continue
        seen.add(cid)
        out.append({"concept_id": cid, "label": k, "aliases": [k], "relation_stoplist": False})
    return out


def create_app(db_path, corpus, seeds, key_map, cors_origins, embedder=None, llm=None):
    app = FastAPI(title="SynapVox — 세션간 개념 연결 데모")
    app.add_middleware(CORSMiddleware, allow_origins=cors_origins,
                       allow_methods=["GET", "POST"], allow_headers=["X-API-Key"])
    store = Store(db_path)
    embedder = embedder or HashingEmbedder(dim=256)
    ingestor = Ingestor(store, seeds, embedder, llm=llm)
    rag = Rag(store, embedder, llm) if llm else None

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

    @app.get("/corpus")
    def corpus_list(pid: str = Depends(project_id)):
        ingested = {r["external_id"] for r in store.project_sessions(pid)}
        items = sorted((s for s in corpus.values() if s.get("project_id") == pid),
                       key=lambda s: s["seq"])
        return {"sessions": [
            {"session_key": s["external_id"], "seq": s["seq"], "title": s.get("title", s["external_id"]),
             "chapter": s.get("chapter", ""), "ingested": s["external_id"] in ingested}
            for s in items]}

    @app.post("/ingest")
    def ingest(body: dict, pid: str = Depends(project_id)):
        key = body.get("session_key")
        if key not in corpus:
            raise HTTPException(404, "unknown session_key")
        return ingestor.ingest(corpus[key], project_id=pid)

    @app.post("/ingest-text")
    def ingest_text(body: dict, pid: str = Depends(project_id)):
        text = (body.get("text") or "").strip()
        segments = segment_text(text)
        if not segments:
            raise HTTPException(400, "text가 비어 있습니다")
        seq = store.max_seq(pid) + 1
        session_id = f"U{seq}"
        title = (body.get("title") or "").strip() or f"사용자 입력 {seq}"
        chapter = (body.get("chapter") or "").strip() or "사용자 입력"
        summary = text[:120] + ("…" if len(text) > 120 else "")
        doc = {"external_id": session_id, "project_id": pid, "seq": seq,
               "title": title, "chapter": chapter, "summary": summary, "segments": segments}
        extra = keywords_to_concepts(body.get("keywords"))
        return ingestor.ingest(doc, project_id=pid, extra_concepts=extra)

    @app.post("/reset")
    def reset(pid: str = Depends(project_id)):
        store.reset_project(pid)
        return {"ok": True}

    @app.get("/graph")
    def graph(pid: str = Depends(project_id)):
        return store.graph(pid)

    @app.get("/concept/{concept_id}")
    def concept(concept_id: str, pid: str = Depends(project_id)):
        d = store.concept_detail(pid, concept_id)
        if not d:
            raise HTTPException(404, "unknown concept")
        return d

    @app.get("/session/{session_id}")
    def session(session_id: str, pid: str = Depends(project_id)):
        d = store.session_detail(pid, session_id)
        if not d:
            raise HTTPException(404, "unknown session")
        return d

    @app.get("/search")
    def search(q: str, k: int = 8, pid: str = Depends(project_id)):
        qvec = ingestor.embedder.embed(q)
        hits = store.search(pid, qvec, k=k)
        # expansion: 히트 세그먼트가 속한 세션·개념 서브그래프
        g = store.graph(pid)
        hit_sessions = {x["session_id"] for x in hits}
        keep_nodes = {n["id"] for n in g["nodes"]
                      if n["type"] == "session" and n["id"] in hit_sessions}
        sub_edges = [e for e in g["edges"]
                     if e["rel_type"] == "SESSION_MENTIONS_CONCEPT" and e["src"] in hit_sessions]
        keep_nodes |= {e["dst"] for e in sub_edges}
        nodes = [n for n in g["nodes"] if n["id"] in keep_nodes]
        return {"query": q, "hits": hits, "expansion": {"nodes": nodes, "edges": sub_edges}}

    @app.get("/timeline")
    def timeline(pid: str = Depends(project_id)):
        return {"sessions": store.timeline(pid)}

    @app.get("/ask")
    def ask(q: str, k: int = 6, pid: str = Depends(project_id)):
        if rag is None:
            raise HTTPException(503, "LLM 미설정 — OPENAI_API_KEY가 필요합니다")
        return rag.ask(q, pid, k=k)

    @app.get("/config")
    def config():
        return {"rag_enabled": rag is not None,
                "chat_model": getattr(llm, "chat_model", None),
                "embed_model": getattr(embedder, "model_name", None)}

    return app
