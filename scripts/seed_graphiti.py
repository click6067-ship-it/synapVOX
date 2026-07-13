"""Neo4j(Aura 또는 로컬)에 캠벨 6강을 사전 시드 — 쿼리 전용 배포용.

.env(OPENAI_API_KEY, NEO4J_URI/USER/PASSWORD)를 읽어 Graphiti 로 6강을 ingest 한다.
세션마다 엔티티/관계 추출로 OpenAI 토큰을 소모하므로 배포 전 1회만 실행.
배포 앱(Render)은 SVX_READONLY=1 이라 여기서 넣은 그래프를 조회만 한다.

  .venv/bin/python scripts/seed_graphiti.py            # 6강 시드
  .venv/bin/python scripts/seed_graphiti.py --reset    # 기존 그래프 삭제 후 시드

Aura 에 넣으려면 .env 의 NEO4J_URI/PASSWORD 를 Aura 값으로 두고 실행한다.
"""

import asyncio
import json
import os
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


def _load_env(path: pathlib.Path):
    if path.exists():
        for line in path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


_load_env(ROOT / ".env")

from gsvx.engine import GraphitiEngine  # noqa: E402


async def main(reset: bool):
    data = json.loads((ROOT / "corpus" / "campbell_sessions.json").read_text())
    project = data["project_id"]
    print(f"대상 Neo4j: {os.environ.get('NEO4J_URI', 'bolt://localhost:7687')}  project={project}")
    engine = GraphitiEngine()
    await engine.init()
    try:
        if reset:
            await engine.reset(project)
            print(f"[reset] {project} 그래프 삭제됨")
        for s in sorted(data["sessions"], key=lambda x: x["seq"]):
            text = "\n\n".join(seg["text"] for seg in s["segments"])
            out = await engine.ingest(project, s["title"], text, s["seq"])
            st = out["stats"]
            print(f"[{s['seq']}] {s['title']}: 엔티티 {st['concepts_new']} · 관계 {st['relations_new']}")
        print("완료 — 이제 SVX_READONLY=1 로 배포하면 이 그래프를 조회한다.")
    finally:
        await engine.close()


if __name__ == "__main__":
    asyncio.run(main("--reset" in sys.argv))
