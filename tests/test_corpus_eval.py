"""통합 회귀 게이트 — 실제 캠벨 코퍼스가 blueprint 성공기준을 만족하는지 + leakage 방지."""

import json
import pathlib

from scripts.eval_relations import evaluate

ROOT = pathlib.Path(__file__).parent.parent


def test_coverage_and_relation_gate(tmp_path):
    r = evaluate(db_path=str(tmp_path / "eval.db"))
    assert r["seed_recall"] >= 0.8
    assert all(r["min2_ok"].values()), r["min2_ok"]
    assert r["precision"] >= 0.8
    assert r["required_recall"] >= 0.8, r["missing_required"]


def test_no_label_leakage_in_visible_corpus():
    # visible 코퍼스에 hidden 라벨 필드가 절대 없어야 함 (LLM/매칭 입력 오염 방지)
    raw = (ROOT / "corpus" / "campbell_sessions.json").read_text()
    for banned in ["expected_session_relations", "required_demo_edges", "session_concepts",
                   "CONTINUES", "EXPANDS", "rel"]:
        assert banned not in raw, f"visible 코퍼스에 라벨 누출: {banned}"


def test_labels_file_is_separate_and_hidden():
    labels = json.loads((ROOT / "corpus" / "campbell_labels.json").read_text())
    assert "expected_session_relations" in labels  # 정답은 별도 파일에만
