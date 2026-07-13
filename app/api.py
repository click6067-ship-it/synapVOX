"""FastAPI 데모 API — plan v1.0의 조회 3개 + 저장 1개.

보안 규칙 (plan §4):
- X-API-Key는 SHA-256 해시로만 비교 (key_map: hash → project_id)
- project_id는 클라이언트 입력이 아니라 key에서 서버가 결정 (저장 포함)
- CORS는 지정 origin만
"""

import hashlib
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.repo import Repository

STATIC_DIR = Path(__file__).parent.parent / "static"


def create_app(db_path: str, key_map: dict[str, str], cors_origins: list[str]) -> FastAPI:
    app = FastAPI(title="synapVOX demo API")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["X-API-Key"],
    )
    repo = Repository(db_path)

    def project_id(x_api_key: str | None = Header(None, alias="X-API-Key")) -> str:
        if not x_api_key:
            raise HTTPException(status_code=401, detail="API key required")
        pid = key_map.get(hashlib.sha256(x_api_key.encode()).hexdigest())
        if pid is None:
            raise HTTPException(status_code=401, detail="invalid API key")
        return pid

    @app.get("/")
    def index():
        return FileResponse(STATIC_DIR / "index.html")

    @app.get("/timeline")
    def timeline(pid: str = Depends(project_id)):
        return {"project_id": pid, "meetings": repo.timeline(pid)}

    @app.get("/search")
    def search(q: str, k: int = 5, pid: str = Depends(project_id)):
        return {"project_id": pid, "query": q, "hits": repo.search(pid, q, k=k)}

    @app.get("/graph/shared-topics")
    def shared_topics(pid: str = Depends(project_id)):
        return repo.shared_topics(pid)

    @app.post("/meetings", status_code=201)
    def ingest(doc: dict, pid: str = Depends(project_id)):
        doc = {**doc, "project_id": pid}  # 클라이언트가 보낸 project_id는 무시
        repo.ingest_meeting(doc)
        return {"meeting_id": doc["meeting_id"], "project_id": pid}

    return app
