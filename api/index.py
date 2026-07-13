"""Vercel Python(ASGI) 엔트리포인트 — 루트의 FastAPI app 을 서빙한다.

vercel.json 의 rewrite 가 모든 경로를 /api/index 로 보낸다.
"""

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

from graph_main import app  # noqa: E402

# Vercel Python 런타임이 ASGI 'app' 을 감지해 서빙
