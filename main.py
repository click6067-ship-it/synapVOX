"""데모 서버 엔트리포인트: .venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000"""

import hashlib
import os

from app.api import create_app

DB_PATH = os.environ.get("SYNAPVOX_DB", "synapvox.db")
DEMO_API_KEY = os.environ.get("DEMO_API_KEY", "demo-synapvox")
CORS_ORIGINS = os.environ.get("DEMO_CORS_ORIGINS", "http://127.0.0.1:8000").split(",")

key_map = {hashlib.sha256(DEMO_API_KEY.encode()).hexdigest(): "P-DEMO"}
app = create_app(db_path=DB_PATH, key_map=key_map, cors_origins=CORS_ORIGINS)
