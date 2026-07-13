import json
import pathlib

import pytest

from app.repo import Repository

FIXTURES = json.loads(
    (pathlib.Path(__file__).parent.parent / "fixtures" / "meetings.json").read_text()
)


@pytest.fixture()
def repo(tmp_path):
    r = Repository(str(tmp_path / "test.db"))
    for doc in FIXTURES:
        r.ingest_meeting(doc)
    return r


def test_timeline_is_date_ordered_and_scoped(repo):
    tl = repo.timeline("P-DEMO")
    ids = [m["meeting_id"] for m in tl]
    assert ids == ["M01", "M02", "M03", "M04", "M05"]
    assert "MX1" not in ids


def test_timeline_annotations_are_whitelisted(repo):
    tl = repo.timeline("P-DEMO")
    m04 = next(m for m in tl if m["meeting_id"] == "M04")
    assert m04["annotations"], "M04에 annotation이 있어야 한다"
    for a in m04["annotations"]:
        assert set(a.keys()) <= {"kind", "label", "assignee", "due", "segment_id"}
        assert "supersedes_hint" not in a
        assert "payload" not in a


def test_search_finds_relevant_segment(repo):
    hits = repo.search("P-DEMO", "정산 배치 언제 돌리기로 했지", k=5)
    assert len(hits) <= 5
    assert any(h["meeting_id"] in ("M03", "M05") for h in hits)
    top = hits[0]
    assert {"meeting_id", "segment_id", "text", "score", "ts_start", "ts_end", "speaker", "topics"} <= set(top.keys())


def test_search_never_leaks_other_project(repo):
    hits = repo.search("P-DEMO", "챗봇 프로토타입 답변 정확도", k=5)
    assert all(h["meeting_id"] != "MX1" for h in hits)
    hits_other = repo.search("P-OTHER", "챗봇 프로토타입 답변 정확도", k=5)
    assert hits_other and all(h["meeting_id"] == "MX1" for h in hits_other)


def test_shared_topics_graph_edges(repo):
    g = repo.shared_topics("P-DEMO")
    node_ids = {n["meeting_id"] for n in g["nodes"]}
    assert node_ids == {"M01", "M02", "M03", "M04", "M05"}
    edges = {frozenset((e["src"], e["dst"])): e for e in g["edges"]}
    # fixture 설계상 공유 태그 ≥2인 쌍
    assert frozenset(("M01", "M02")) in edges  # PG사 선정 + 결제 모듈
    assert frozenset(("M04", "M05")) in edges  # 일정 + 오픈 준비
    e = edges[frozenset(("M01", "M02"))]
    assert e["weight"] >= 2
    assert set(e["shared_topics"]) >= {"PG사 선정", "결제 모듈"}
    assert g["threshold_used"] == 2 and g["fallback"] is False


def test_shared_topics_never_leaks_other_project(repo):
    g = repo.shared_topics("P-DEMO")
    assert all("MX1" not in (e["src"], e["dst"]) for e in g["edges"])
    assert all(n["meeting_id"] != "MX1" for n in g["nodes"])


def test_shared_topics_empty_graph_falls_back_to_threshold_1(tmp_path):
    r = Repository(str(tmp_path / "sparse.db"))
    for mid, tags in [("A1", ["예산", "회의"]), ("A2", ["예산", "회의"]), ("A3", ["채용"])]:
        r.ingest_meeting({
            "meeting_id": mid, "project_id": "P-SPARSE", "date": "2026-07-01",
            "mode": "meeting", "source": "s", "doc_refs": [], "summary": "s",
            "segments": [{"id": 1, "speaker": "A", "ts_start": 0, "ts_end": 1, "text": "t", "topics": tags}],
            "bookmarks": [], "decisions": [], "action_items": [],
        })
    g = r.shared_topics("P-SPARSE")
    # 공유 2개 쌍(A1-A2)이 있지만 '회의'는 stoplist → 임계값 2에서 빈 그래프 → fallback 1
    assert g["fallback"] is True and g["threshold_used"] == 1
    edges = {frozenset((e["src"], e["dst"])): e for e in g["edges"]}
    assert frozenset(("A1", "A2")) in edges
    assert edges[frozenset(("A1", "A2"))]["shared_topics"] == ["예산"]  # stoplist 태그는 근거에서 제외
