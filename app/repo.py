"""저장·조회 리포지토리 — 모든 쿼리가 여기를 단일 경유하며 project_id를 강제한다.

plan v1.0 규칙:
- 벡터 검색은 search() 하나로 캡슐화 (외부 raw vector SQL 금지)
- annotations payload(supersedes_hint 등)는 DB 내부 보관, 조회 응답은 whitelist 필드만
- 데모는 SQLite. Supabase(Postgres+pgvector) 전환 시 이 모듈만 교체.
"""

import json
import sqlite3

from app.embedder import HashingEmbedder, cosine

# 공유 주제 그래프에서 근거로 치지 않는 범용 태그
GENERIC_TAG_STOPLIST = {"회의", "논의", "일반", "기타", "공지"}

SCHEMA = """
CREATE TABLE IF NOT EXISTS meetings (
    meeting_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    date TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'meeting',
    source TEXT,
    doc_refs TEXT NOT NULL DEFAULT '[]',
    summary TEXT
);
CREATE TABLE IF NOT EXISTS segments (
    meeting_id TEXT NOT NULL REFERENCES meetings(meeting_id),
    seg_no INTEGER NOT NULL,
    project_id TEXT NOT NULL,
    speaker TEXT,
    ts_start REAL,
    ts_end REAL,
    text TEXT NOT NULL,
    topic_tags TEXT NOT NULL DEFAULT '[]',
    embedding TEXT NOT NULL,
    embedding_model TEXT NOT NULL,
    embedding_dim INTEGER NOT NULL,
    entity_id TEXT,
    PRIMARY KEY (meeting_id, seg_no)
);
CREATE TABLE IF NOT EXISTS annotations (
    annotation_id INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_id TEXT NOT NULL,
    segment_no INTEGER,
    project_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('bookmark', 'decision', 'action')),
    payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_segments_project ON segments(project_id);
CREATE INDEX IF NOT EXISTS idx_meetings_project_date ON meetings(project_id, date);
CREATE INDEX IF NOT EXISTS idx_annotations_meeting ON annotations(project_id, meeting_id);
"""


class Repository:
    def __init__(self, db_path: str, embedder: HashingEmbedder | None = None):
        self.db_path = db_path
        self.embedder = embedder or HashingEmbedder(dim=256)
        with self._conn() as conn:
            conn.executescript(SCHEMA)

    def _conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    # ── 저장 ──────────────────────────────────────────────

    def ingest_meeting(self, doc: dict) -> None:
        project_id = doc["project_id"]
        meeting_id = doc["meeting_id"]
        with self._conn() as conn:
            conn.execute("DELETE FROM segments WHERE meeting_id = ?", (meeting_id,))
            conn.execute("DELETE FROM annotations WHERE meeting_id = ?", (meeting_id,))
            conn.execute(
                "INSERT OR REPLACE INTO meetings VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    meeting_id,
                    project_id,
                    doc["date"],
                    doc.get("mode", "meeting"),
                    doc.get("source"),
                    json.dumps(doc.get("doc_refs", []), ensure_ascii=False),
                    doc.get("summary"),
                ),
            )
            for seg in doc.get("segments", []):
                vec = self.embedder.embed(seg["text"])
                conn.execute(
                    "INSERT INTO segments VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)",
                    (
                        meeting_id,
                        seg["id"],
                        project_id,
                        seg.get("speaker"),
                        seg.get("ts_start"),
                        seg.get("ts_end"),
                        seg["text"],
                        json.dumps(seg.get("topics", []), ensure_ascii=False),
                        json.dumps(vec),
                        self.embedder.model_name,
                        self.embedder.dim,
                    ),
                )
            for b in doc.get("bookmarks", []):
                self._add_annotation(conn, project_id, meeting_id, b.get("segment_id"), "bookmark", b)
            for d in doc.get("decisions", []):
                self._add_annotation(conn, project_id, meeting_id, d.get("segment_id"), "decision", d)
            for a in doc.get("action_items", []):
                self._add_annotation(conn, project_id, meeting_id, a.get("segment_id"), "action", a)

    @staticmethod
    def _add_annotation(conn, project_id, meeting_id, segment_no, kind, payload):
        conn.execute(
            "INSERT INTO annotations (meeting_id, segment_no, project_id, kind, payload) VALUES (?, ?, ?, ?, ?)",
            (meeting_id, segment_no, project_id, kind, json.dumps(payload, ensure_ascii=False)),
        )

    # ── 조회 (전부 project_id 강제) ──────────────────────

    def timeline(self, project_id: str) -> list[dict]:
        with self._conn() as conn:
            meetings = conn.execute(
                "SELECT * FROM meetings WHERE project_id = ? ORDER BY date, meeting_id",
                (project_id,),
            ).fetchall()
            out = []
            for m in meetings:
                tags = conn.execute(
                    "SELECT topic_tags FROM segments WHERE project_id = ? AND meeting_id = ?",
                    (project_id, m["meeting_id"]),
                ).fetchall()
                topics = sorted({t for row in tags for t in json.loads(row["topic_tags"])})
                anns = conn.execute(
                    "SELECT segment_no, kind, payload FROM annotations "
                    "WHERE project_id = ? AND meeting_id = ? ORDER BY annotation_id",
                    (project_id, m["meeting_id"]),
                ).fetchall()
                out.append(
                    {
                        "meeting_id": m["meeting_id"],
                        "date": m["date"],
                        "summary": m["summary"],
                        "topics": topics,
                        "annotations": [self._whitelist(a) for a in anns],
                    }
                )
            return out

    @staticmethod
    def _whitelist(row) -> dict:
        """payload 원본(supersedes_hint 등 2차 의미론)은 노출하지 않는다."""
        p = json.loads(row["payload"])
        out = {"kind": row["kind"], "segment_id": row["segment_no"]}
        label = p.get("label") or p.get("statement") or p.get("task")
        if label:
            out["label"] = label
        if row["kind"] == "action":
            if p.get("assignee"):
                out["assignee"] = p["assignee"]
            if p.get("due"):
                out["due"] = p["due"]
        return out

    def search(self, project_id: str, query: str, k: int = 5) -> list[dict]:
        qvec = self.embedder.embed(query)
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT meeting_id, seg_no, speaker, ts_start, ts_end, text, topic_tags, embedding "
                "FROM segments WHERE project_id = ?",
                (project_id,),
            ).fetchall()
        scored = [
            {
                "meeting_id": r["meeting_id"],
                "segment_id": r["seg_no"],
                "speaker": r["speaker"],
                "ts_start": r["ts_start"],
                "ts_end": r["ts_end"],
                "text": r["text"],
                "topics": json.loads(r["topic_tags"]),
                "score": round(cosine(qvec, json.loads(r["embedding"])), 4),
            }
            for r in rows
        ]
        scored.sort(key=lambda h: h["score"], reverse=True)
        return scored[:k]

    def shared_topics(self, project_id: str, threshold: int = 2) -> dict:
        """공유 주제 뷰 — 관계 판정이 아니라 topic co-occurrence (plan v1.0 명명 제한)."""
        with self._conn() as conn:
            meetings = conn.execute(
                "SELECT meeting_id, date, summary FROM meetings WHERE project_id = ? ORDER BY date",
                (project_id,),
            ).fetchall()
            tag_map: dict[str, set[str]] = {}
            for m in meetings:
                rows = conn.execute(
                    "SELECT topic_tags FROM segments WHERE project_id = ? AND meeting_id = ?",
                    (project_id, m["meeting_id"]),
                ).fetchall()
                tags = {t for r in rows for t in json.loads(r["topic_tags"])}
                tag_map[m["meeting_id"]] = tags - GENERIC_TAG_STOPLIST

        def edges_at(th: int) -> list[dict]:
            ids = list(tag_map)
            result = []
            for i, a in enumerate(ids):
                for b in ids[i + 1 :]:
                    shared = sorted(tag_map[a] & tag_map[b])
                    if len(shared) >= th:
                        result.append({"src": a, "dst": b, "weight": len(shared), "shared_topics": shared})
            return result

        edges = edges_at(threshold)
        fallback = False
        threshold_used = threshold
        if not edges and threshold > 1:
            edges = edges_at(1)
            fallback = True
            threshold_used = 1
        nodes = [
            {
                "meeting_id": m["meeting_id"],
                "date": m["date"],
                "summary": m["summary"],
                "topics": sorted(tag_map[m["meeting_id"]]),
            }
            for m in meetings
        ]
        return {"nodes": nodes, "edges": edges, "threshold_used": threshold_used, "fallback": fallback}
