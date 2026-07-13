import pathlib

import pytest

from svx.seeds import SeedDict
from svx.store import Store
from svx.ingest import Ingestor
from svx.embedder import HashingEmbedder

ROOT = pathlib.Path(__file__).parent.parent
SEED_PATH = ROOT / "corpus" / "seed_concepts.json"


# 인라인 미니 코퍼스 — 생성된 campbell_sessions.json과 독립(TDD 자족).
# 실제 seed_concepts.json의 alias를 텍스트에 담아 seed 매칭을 실제로 태운다.
MINI = {
    "T1": {
        "external_id": "T1", "project_id": "P-T", "seq": 1,
        "title": "대사와 효소", "chapter": "대사", "summary": "대사 개요",
        "segments": [
            {"seg_no": 1, "speaker": "강사", "text": "효소는 활성화에너지를 낮춘다. 이 과정에서 ATP가 쓰인다."},
        ],
    },
    "T2": {
        "external_id": "T2", "project_id": "P-T", "seq": 2,
        "title": "효소 심화", "chapter": "대사", "summary": "효소 반응",
        "segments": [
            {"seg_no": 1, "speaker": "강사", "text": "효소의 활성화에너지 감소 효과를 더 자세히 본다."},
        ],
    },
    "T3": {
        "external_id": "T3", "project_id": "P-T", "seq": 3,
        "title": "광합성 속 효소", "chapter": "광합성", "summary": "광합성에서의 효소",
        "segments": [
            {"seg_no": 1, "speaker": "강사", "text": "광합성 경로에서도 효소가 핵심 역할을 한다."},
        ],
    },
    "TX": {
        "external_id": "TX", "project_id": "P-OTHER", "seq": 1,
        "title": "타 프로젝트", "chapter": "무관", "summary": "격리 테스트",
        "segments": [
            {"seg_no": 1, "speaker": "강사", "text": "여기서도 효소를 다루지만 다른 프로젝트다."},
        ],
    },
}


@pytest.fixture()
def seeds():
    return SeedDict.from_file(str(SEED_PATH))


@pytest.fixture()
def mini():
    return MINI


@pytest.fixture()
def store(tmp_path):
    return Store(str(tmp_path / "t.db"))


@pytest.fixture()
def ingestor(store, seeds):
    return Ingestor(store, seeds, HashingEmbedder(dim=128))


@pytest.fixture()
def ingested(ingestor, mini):
    for key in ["T1", "T2", "T3", "TX"]:
        d = mini[key]
        ingestor.ingest(d, project_id=d["project_id"])
    return ingestor.store
