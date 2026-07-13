"""SynapVox 세션간 연결 데모 서버 (로컬 + Vercel 공용).

로컬:  .venv/bin/uvicorn graph_main:app --host 127.0.0.1 --port 8010  → http://127.0.0.1:8010
Vercel: api/index.py 가 이 app 을 서빙.

OPENAI_API_KEY(env/.env)가 있으면 실제 GraphRAG:
  임베딩=text-embedding-3-large · 개념추출/관계판정/RAG답변=gpt-5.6-sol (LangGraph 오케스트레이션).
없으면 해싱 임베더 + chapter 규칙으로 폴백(그래프는 뜨지만 RAG 질의는 비활성).

배포: SVX_DB=/tmp/... 로 두면, 콜드스타트 시 deploy/seed.db(샘플 6강 + 캐시)를 복사해 즉시 데모 가능.
"""

import hashlib
import json
import os
import pathlib
import shutil

from svx.api import create_app
from svx.seeds import SeedDict
from svx.store import Store

ROOT = pathlib.Path(__file__).parent


def _load_env(path: pathlib.Path):
    if path.exists():
        for line in path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


_load_env(ROOT / ".env")

DB = os.environ.get("SVX_DB", str(ROOT / "synapvox_graph.db"))
KEY = os.environ.get("DEMO_API_KEY", "demo-bio")
CORS = os.environ.get("DEMO_CORS", "*").split(",")
SEED_DB = ROOT / "deploy" / "seed.db"

# 배포 콜드스타트: 쓰기 가능한 위치(/tmp)에 시드 DB(샘플+캐시)를 깔아 즉시 데모
if not pathlib.Path(DB).exists() and SEED_DB.exists():
    try:
        shutil.copy(SEED_DB, DB)
    except Exception:
        pass

_data = json.loads((ROOT / "corpus" / "campbell_sessions.json").read_text())
corpus = {s["external_id"]: {**s, "project_id": _data["project_id"]} for s in _data["sessions"]}
seeds = SeedDict.from_file(str(ROOT / "corpus" / "seed_concepts.json"))
key_map = {hashlib.sha256(KEY.encode()).hexdigest(): _data["project_id"]}

llm = embedder = None
if os.environ.get("OPENAI_API_KEY"):
    from svx.llm import LLM, OpenAIEmbedder
    llm = LLM(os.environ["OPENAI_API_KEY"], Store(DB))
    embedder = OpenAIEmbedder(llm)

app = create_app(db_path=DB, corpus=corpus, seeds=seeds, key_map=key_map,
                 cors_origins=CORS, embedder=embedder, llm=llm)
