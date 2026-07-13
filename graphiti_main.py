"""SynapVox — Graphiti 판 서버.

전제: Neo4j 실행 중(docker) + .env에 OPENAI_API_KEY, NEO4J_URI/USER/PASSWORD.
  docker run -d --name svx-neo4j -p 7687:7687 -p 7474:7474 -e NEO4J_AUTH=neo4j/synapvox123 neo4j:5.26
실행: .venv/bin/uvicorn graphiti_main:app --host 127.0.0.1 --port 8020
브라우저: http://127.0.0.1:8020  (API key: demo-bio)
"""

import hashlib
import json
import os
import pathlib

ROOT = pathlib.Path(__file__).parent


def _load_env(path):
    if path.exists():
        for line in path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


_load_env(ROOT / ".env")

from gsvx.engine import GraphitiEngine
from gsvx.api import create_app

_data = json.loads((ROOT / "corpus" / "campbell_sessions.json").read_text())
PROJECT = _data["project_id"]
corpus = {
    s["external_id"]: {
        "session_key": s["external_id"], "title": s["title"], "chapter": s.get("chapter", ""),
        "seq": s["seq"], "text": "\n\n".join(seg["text"] for seg in s["segments"]),
    }
    for s in _data["sessions"]
}
KEY = os.environ.get("DEMO_API_KEY", "demo-bio")
key_map = {hashlib.sha256(KEY.encode()).hexdigest(): PROJECT}

engine = GraphitiEngine()
app = create_app(engine, corpus, key_map, os.environ.get("DEMO_CORS", "*").split(","))
