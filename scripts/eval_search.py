"""검색 품질 dry-run (plan v1.0 D5 게이트): 대표 쿼리 10개 top-k 적중률.

.venv/bin/python scripts/eval_search.py
적중 = top-k 결과 중 정답 회의의 세그먼트가 1개 이상. 통과선 미달이면 exit 1.
"""

import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))

from app.repo import Repository

ROOT = pathlib.Path(__file__).parent.parent


def main():
    spec = json.loads((ROOT / "fixtures" / "eval.json").read_text())
    repo = Repository(str(ROOT / "synapvox.db"))
    hits = 0
    for q in spec["queries"]:
        results = repo.search(spec["project_id"], q["query"], k=spec["k"])
        got = [r["meeting_id"] for r in results]
        ok = any(m in q["expected_meetings"] for m in got)
        hits += ok
        mark = "O" if ok else "X"
        print(f"  [{mark}] {q['query']!r} → top{spec['k']} {got} (정답: {q['expected_meetings']})")
    total = len(spec["queries"])
    print(f"\n적중 {hits}/{total} (통과선 {spec['pass_threshold']})")
    if hits < spec["pass_threshold"]:
        print("결과: FAIL — 임베딩 모델 교체 또는 topic 필터 병용 검토 (plan §5 D5)")
        sys.exit(1)
    print("결과: PASS")


if __name__ == "__main__":
    main()
