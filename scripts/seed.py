"""가상회의 fixture를 DB에 적재한다: .venv/bin/python scripts/seed.py"""

import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))

from app.repo import Repository

ROOT = pathlib.Path(__file__).parent.parent
DB_PATH = ROOT / "synapvox.db"


def main():
    docs = json.loads((ROOT / "fixtures" / "meetings.json").read_text())
    repo = Repository(str(DB_PATH))
    for doc in docs:
        repo.ingest_meeting(doc)
        print(f"  적재: {doc['meeting_id']} ({doc['project_id']}) — {doc['date']} · 세그먼트 {len(doc['segments'])}개")
    print(f"완료: 회의 {len(docs)}개 → {DB_PATH}")


if __name__ == "__main__":
    main()
