"""관계 품질 + 커버리지 게이트 (blueprint 성공기준 0·5).

hidden 라벨(campbell_labels.json)은 eval만 읽는다 — ingest/seed 매칭 경로엔 안 들어감.
.venv/bin/python scripts/eval_relations.py   (미달 시 exit 1)
"""

import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))

from scripts.seed_graph import build

ROOT = pathlib.Path(__file__).parent.parent


def evaluate(db_path=None):
    labels = json.loads((ROOT / "corpus" / "campbell_labels.json").read_text())
    store, pid = build(db_path=db_path)
    g = store.graph(pid)

    # 1) seed 커버리지: ingested 개념 멤버십 vs hidden
    ingested_mem = {}
    for e in g["edges"]:
        if e["rel_type"] == "SESSION_MENTIONS_CONCEPT":
            ingested_mem.setdefault(e["src"], set()).add(e["dst"])
    tot = hit = 0
    for sess, gold in labels["session_concepts"].items():
        for c in gold:
            tot += 1
            if c in ingested_mem.get(sess, set()):
                hit += 1
    seed_recall = hit / tot

    # 각 필수 개념이 ≥2 세션
    concept_sessions = {}
    for sess, cs in ingested_mem.items():
        for c in cs:
            concept_sessions.setdefault(c, set()).add(sess)
    min2_ok = {c: len(concept_sessions.get(c, set())) >= 2 for c in labels["required_concepts_min2_sessions"]}

    # 2) 관계 precision + 필수엣지 recall
    predicted = {(e["src"], e["dst"], e["rel_type"]) for e in g["edges"]
                 if e["rel_type"] in ("CONTINUES", "EXPANDS")}
    expected = {(r["src"], r["dst"], r["rel"]) for r in labels["expected_session_relations"]}
    required = {(r["src"], r["dst"], r["rel"]) for r in labels["required_demo_edges"]}
    precision = len(predicted & expected) / len(predicted) if predicted else 0.0
    req_recall = len(required & predicted) / len(required)

    return {
        "seed_recall": seed_recall, "min2_ok": min2_ok,
        "precision": precision, "required_recall": req_recall,
        "predicted": sorted(predicted), "missing_required": sorted(required - predicted),
    }


def main():
    r = evaluate()
    print(f"seed 커버리지 recall = {r['seed_recall']:.2f} (게이트 ≥0.80)")
    print(f"필수 개념 ≥2세션: {r['min2_ok']}")
    print(f"관계 precision = {r['precision']:.2f} (≥0.80) · 필수엣지 recall = {r['required_recall']:.2f} (≥0.80)")
    if r["missing_required"]:
        print(f"누락 필수엣지: {r['missing_required']}")
    ok = (r["seed_recall"] >= 0.8 and all(r["min2_ok"].values())
          and r["precision"] >= 0.8 and r["required_recall"] >= 0.8)
    print("결과:", "PASS" if ok else "FAIL")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
