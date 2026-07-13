"""저장·조회 — 모든 쿼리 단일 경유, project_id 강제. backbone/공기 엣지는 mentions 위 VIEW라 멱등 자동.

blueprint §6: write 타깃은 mentions·session_relations뿐. v_session_concept·v_concept_cooccur는 VIEW.
데모=SQLite(embedding JSON text). 배포=Postgres+pgvector(리포지토리 교체).
"""

import json
import sqlite3

SCHEMA = """
CREATE TABLE IF NOT EXISTS ingest_runs (
    run_id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT, session_id TEXT,
    source_hash TEXT, status TEXT, seed_version TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY, project_id TEXT NOT NULL, external_id TEXT,
    seq INTEGER, title TEXT, chapter TEXT, summary TEXT, source_hash TEXT,
    UNIQUE(project_id, external_id)
);
CREATE TABLE IF NOT EXISTS segments (
    session_id TEXT NOT NULL, seg_no INTEGER, project_id TEXT NOT NULL,
    speaker TEXT, text TEXT, order_idx INTEGER, embedding TEXT, embedding_model TEXT,
    PRIMARY KEY(session_id, seg_no)
);
CREATE TABLE IF NOT EXISTS concepts (
    concept_id TEXT, project_id TEXT NOT NULL, canonical_label TEXT,
    source TEXT, relation_stoplist INTEGER DEFAULT 0,
    PRIMARY KEY(project_id, concept_id)
);
CREATE TABLE IF NOT EXISTS mentions (
    mention_id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT, seg_no INTEGER, concept_id TEXT, project_id TEXT NOT NULL,
    occurrence_idx INTEGER, matched_text TEXT, char_start INTEGER, char_end INTEGER,
    extractor TEXT, confidence REAL, created_by_run_id INTEGER
);
CREATE TABLE IF NOT EXISTS session_relations (
    project_id TEXT NOT NULL, src_session TEXT, dst_session TEXT,
    rel_type TEXT, concept_id TEXT, evidence TEXT, created_by_run_id INTEGER
);
CREATE TABLE IF NOT EXISTS extraction_cache (
    cache_key TEXT PRIMARY KEY, kind TEXT, value TEXT
);
CREATE INDEX IF NOT EXISTS idx_mentions_proj ON mentions(project_id, concept_id);
CREATE INDEX IF NOT EXISTS idx_mentions_sess ON mentions(session_id);
CREATE INDEX IF NOT EXISTS idx_srel_proj ON session_relations(project_id);

-- backbone·공기 엣지는 저장하지 않고 VIEW (재-ingest 멱등 자동, blueprint Round2 #1)
CREATE VIEW IF NOT EXISTS v_session_concept AS
    SELECT project_id, session_id, concept_id, COUNT(*) AS weight
    FROM mentions GROUP BY project_id, session_id, concept_id;
CREATE VIEW IF NOT EXISTS v_concept_cooccur AS
    SELECT m1.project_id AS project_id, m1.concept_id AS src, m2.concept_id AS dst,
           COUNT(*) AS weight
    FROM mentions m1 JOIN mentions m2
      ON m1.project_id = m2.project_id AND m1.session_id = m2.session_id
     AND m1.seg_no = m2.seg_no AND m1.concept_id < m2.concept_id
    GROUP BY m1.project_id, m1.concept_id, m2.concept_id;
"""


class Store:
    def __init__(self, db_path: str):
        self.db_path = db_path
        with self._conn() as c:
            c.executescript(SCHEMA)

    def _conn(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    # ── write ──────────────────────────────────────────
    def new_run(self, conn, project_id, session_id, source_hash, seed_version):
        cur = conn.execute(
            "INSERT INTO ingest_runs(project_id,session_id,source_hash,status,seed_version,created_at)"
            " VALUES(?,?,?,?,?,'')", (project_id, session_id, source_hash, "pending", seed_version))
        return cur.lastrowid

    def upsert_session(self, conn, s):
        conn.execute(
            "INSERT INTO sessions(session_id,project_id,external_id,seq,title,chapter,summary,source_hash)"
            " VALUES(?,?,?,?,?,?,?,?)"
            " ON CONFLICT(session_id) DO UPDATE SET seq=excluded.seq,title=excluded.title,"
            " chapter=excluded.chapter,summary=excluded.summary,source_hash=excluded.source_hash",
            (s["session_id"], s["project_id"], s["external_id"], s["seq"], s["title"],
             s["chapter"], s.get("summary", ""), s["source_hash"]))

    def clear_session_derived(self, conn, project_id, session_id):
        # 한 세션의 ingest는 '이 세션으로 들어오는' 관계(prior→this)만 만든다.
        # 나가는 관계(this→later)는 later 세션의 ingest 소유 → dst만 지워야 중간 재-ingest가 뒤 엣지를 안 지운다.
        conn.execute("DELETE FROM segments WHERE session_id=?", (session_id,))
        conn.execute("DELETE FROM mentions WHERE session_id=?", (session_id,))
        conn.execute("DELETE FROM session_relations WHERE project_id=? AND dst_session=?",
                     (project_id, session_id))

    def insert_segment(self, conn, project_id, session_id, seg_no, speaker, text, order_idx, vec, model):
        conn.execute(
            "INSERT INTO segments VALUES(?,?,?,?,?,?,?,?)",
            (session_id, seg_no, project_id, speaker, text, order_idx, json.dumps(vec), model))

    def upsert_concept(self, conn, project_id, concept_id, label, source, stoplist):
        conn.execute(
            "INSERT INTO concepts(concept_id,project_id,canonical_label,source,relation_stoplist)"
            " VALUES(?,?,?,?,?) ON CONFLICT(project_id,concept_id) DO NOTHING",
            (concept_id, project_id, label, source, 1 if stoplist else 0))

    def insert_mention(self, conn, project_id, session_id, seg_no, concept_id, occ, m, run_id):
        conn.execute(
            "INSERT INTO mentions(session_id,seg_no,concept_id,project_id,occurrence_idx,"
            "matched_text,char_start,char_end,extractor,confidence,created_by_run_id)"
            " VALUES(?,?,?,?,?,?,?,?,?,?,?)",
            (session_id, seg_no, concept_id, project_id, occ, m["matched_text"],
             m["char_start"], m["char_end"], m.get("extractor", "seed"), m.get("confidence", 1.0), run_id))

    def insert_relation(self, conn, project_id, src, dst, rel_type, concept_id, evidence, run_id):
        conn.execute(
            "INSERT INTO session_relations VALUES(?,?,?,?,?,?,?)",
            (project_id, src, dst, rel_type, concept_id, json.dumps(evidence, ensure_ascii=False), run_id))

    def finish_run(self, conn, run_id, status):
        conn.execute("UPDATE ingest_runs SET status=? WHERE run_id=?", (status, run_id))

    def session_by_external(self, conn, project_id, external_id):
        return conn.execute("SELECT * FROM sessions WHERE project_id=? AND external_id=?",
                            (project_id, external_id)).fetchone()

    def prior_session_for_concept(self, conn, project_id, concept_id, seq):
        """seq보다 앞서면서 concept_id를 언급한 세션 중 seq 최대 (candidate_policy: 직전 1개)."""
        return conn.execute(
            "SELECT s.session_id, s.seq, s.chapter FROM sessions s"
            " WHERE s.project_id=? AND s.seq<? AND EXISTS("
            "   SELECT 1 FROM mentions m WHERE m.session_id=s.session_id AND m.concept_id=?)"
            " ORDER BY s.seq DESC LIMIT 1", (project_id, seq, concept_id)).fetchone()

    # ── read (project_id 강제) ─────────────────────────
    def graph(self, project_id: str) -> dict:
        with self._conn() as c:
            sess = c.execute("SELECT * FROM sessions WHERE project_id=? ORDER BY seq", (project_id,)).fetchall()
            cons = c.execute("SELECT * FROM concepts WHERE project_id=?", (project_id,)).fetchall()
            nodes = [{"id": s["session_id"], "type": "session", "label": s["title"] or s["session_id"],
                      "meta": {"seq": s["seq"], "chapter": s["chapter"]}} for s in sess]
            nodes += [{"id": cc["concept_id"], "type": "concept", "label": cc["canonical_label"],
                       "meta": {"stoplist": bool(cc["relation_stoplist"])}} for cc in cons]
            edges = []
            for r in c.execute("SELECT * FROM v_session_concept WHERE project_id=?", (project_id,)):
                edges.append({"src": r["session_id"], "dst": r["concept_id"],
                              "rel_type": "SESSION_MENTIONS_CONCEPT", "concept_id": r["concept_id"],
                              "concept_label": None, "weight": r["weight"]})
            labels = {cc["concept_id"]: cc["canonical_label"] for cc in cons}
            for r in c.execute("SELECT * FROM v_concept_cooccur WHERE project_id=?", (project_id,)):
                edges.append({"src": r["src"], "dst": r["dst"], "rel_type": "CONCEPT_CO_OCCURS_WITH",
                              "concept_id": None, "concept_label": None, "weight": r["weight"]})
            # NEXT_SESSION (seq 인접)
            ordered = [s["session_id"] for s in sess]
            for a, b in zip(ordered, ordered[1:]):
                edges.append({"src": a, "dst": b, "rel_type": "NEXT_SESSION",
                              "concept_id": None, "concept_label": None, "weight": 1})
            # CONTINUES/EXPANDS — (src,dst,rel) 집계, via 개념 라벨 모음
            agg = {}
            for r in c.execute("SELECT * FROM session_relations WHERE project_id=?", (project_id,)):
                key = (r["src_session"], r["dst_session"], r["rel_type"])
                agg.setdefault(key, []).append(labels.get(r["concept_id"], r["concept_id"]))
            for (src, dst, rel), vias in agg.items():
                edges.append({"src": src, "dst": dst, "rel_type": rel, "concept_id": None,
                              "concept_label": ", ".join(dict.fromkeys(vias)), "weight": len(vias)})
            return {"nodes": nodes, "edges": edges}

    def concept_detail(self, project_id, concept_id):
        with self._conn() as c:
            row = c.execute("SELECT * FROM concepts WHERE project_id=? AND concept_id=?",
                            (project_id, concept_id)).fetchone()
            if not row:
                return None
            sess = c.execute(
                "SELECT DISTINCT s.session_id, s.title FROM v_session_concept v"
                " JOIN sessions s ON s.session_id=v.session_id"
                " WHERE v.project_id=? AND v.concept_id=? ORDER BY s.seq", (project_id, concept_id)).fetchall()
            ev = c.execute(
                "SELECT m.session_id, m.seg_no, m.matched_text, m.char_start, m.char_end, g.text"
                " FROM mentions m JOIN segments g ON g.session_id=m.session_id AND g.seg_no=m.seg_no"
                " WHERE m.project_id=? AND m.concept_id=? ORDER BY m.session_id, m.seg_no",
                (project_id, concept_id)).fetchall()
            return {"concept_id": concept_id, "label": row["canonical_label"],
                    "sessions": [dict(s) for s in sess],
                    "evidence": [dict(e) for e in ev]}

    def session_detail(self, project_id, session_id):
        with self._conn() as c:
            s = c.execute("SELECT * FROM sessions WHERE project_id=? AND session_id=?",
                          (project_id, session_id)).fetchone()
            if not s:
                return None
            segs = c.execute("SELECT seg_no,speaker,text FROM segments WHERE session_id=? ORDER BY order_idx",
                             (session_id,)).fetchall()
            cons = c.execute(
                "SELECT DISTINCT c.concept_id, c.canonical_label FROM v_session_concept v"
                " JOIN concepts c ON c.project_id=v.project_id AND c.concept_id=v.concept_id"
                " WHERE v.project_id=? AND v.session_id=?", (project_id, session_id)).fetchall()
            return {"session_id": session_id, "title": s["title"], "chapter": s["chapter"],
                    "seq": s["seq"], "summary": s["summary"],
                    "concepts": [{"concept_id": r["concept_id"], "label": r["canonical_label"]} for r in cons],
                    "segments": [dict(x) for x in segs]}

    def timeline(self, project_id):
        with self._conn() as c:
            sess = c.execute("SELECT * FROM sessions WHERE project_id=? ORDER BY seq", (project_id,)).fetchall()
            out = []
            for s in sess:
                cons = c.execute(
                    "SELECT c.canonical_label FROM v_session_concept v JOIN concepts c"
                    " ON c.project_id=v.project_id AND c.concept_id=v.concept_id"
                    " WHERE v.project_id=? AND v.session_id=?", (project_id, s["session_id"])).fetchall()
                out.append({"session_id": s["session_id"], "seq": s["seq"], "title": s["title"],
                            "chapter": s["chapter"], "summary": s["summary"],
                            "concepts": [r["canonical_label"] for r in cons]})
            return out

    def search(self, project_id, qvec, k=8):
        from svx.embedder import cosine
        with self._conn() as c:
            rows = c.execute(
                "SELECT session_id,seg_no,text,embedding FROM segments WHERE project_id=?",
                (project_id,)).fetchall()
            mrows = c.execute("SELECT session_id,seg_no,concept_id FROM mentions WHERE project_id=?",
                              (project_id,)).fetchall()
            labels = {r["concept_id"]: r["canonical_label"]
                      for r in c.execute("SELECT concept_id,canonical_label FROM concepts WHERE project_id=?",
                                         (project_id,))}
        seg_concepts = {}
        for m in mrows:
            seg_concepts.setdefault((m["session_id"], m["seg_no"]), []).append(labels.get(m["concept_id"]))
        scored = []
        for r in rows:
            scored.append({
                "session_id": r["session_id"], "seg_no": r["seg_no"], "text": r["text"],
                "score": round(cosine(qvec, json.loads(r["embedding"])), 4),
                "concepts": list(dict.fromkeys(seg_concepts.get((r["session_id"], r["seg_no"]), []))),
            })
        scored.sort(key=lambda x: x["score"], reverse=True)
        return scored[:k]

    # ── LLM/임베딩 캐시 (blueprint §4: 무거운 작업 ingest 시 1회 → 캐시) ──
    def cache_get(self, key):
        with self._conn() as c:
            r = c.execute("SELECT value FROM extraction_cache WHERE cache_key=?", (key,)).fetchone()
            return json.loads(r["value"]) if r else None

    def cache_put(self, key, kind, value):
        with self._conn() as c:
            c.execute("INSERT OR REPLACE INTO extraction_cache(cache_key,kind,value) VALUES(?,?,?)",
                      (key, kind, json.dumps(value)))

    def concept_evidence_text(self, project_id, session_id, concept_id):
        """세션에서 개념을 언급한 세그먼트 원문들 — 관계 판정·RAG 컨텍스트용."""
        with self._conn() as c:
            rows = c.execute(
                "SELECT DISTINCT g.text FROM mentions m JOIN segments g"
                " ON g.session_id=m.session_id AND g.seg_no=m.seg_no"
                " WHERE m.project_id=? AND m.session_id=? AND m.concept_id=? ORDER BY g.order_idx",
                (project_id, session_id, concept_id)).fetchall()
            return " ".join(r["text"] for r in rows)

    def session_title(self, project_id, session_id):
        with self._conn() as c:
            r = c.execute("SELECT title FROM sessions WHERE project_id=? AND session_id=?",
                          (project_id, session_id)).fetchone()
            return r["title"] if r else session_id

    def max_seq(self, project_id):
        with self._conn() as c:
            r = c.execute("SELECT MAX(seq) m FROM sessions WHERE project_id=?", (project_id,)).fetchone()
            return (r["m"] or 0)

    def counts(self):
        with self._conn() as c:
            return {t: c.execute(f"SELECT COUNT(*) n FROM {t}").fetchone()["n"]
                    for t in ("sessions", "segments", "extraction_cache")}

    def project_sessions(self, project_id):
        with self._conn() as c:
            return [dict(r) for r in c.execute(
                "SELECT session_id, external_id FROM sessions WHERE project_id=?", (project_id,))]

    def reset_project(self, project_id):
        with self._conn() as c:
            ids = [r["session_id"] for r in c.execute(
                "SELECT session_id FROM sessions WHERE project_id=?", (project_id,))]
            for t in ("segments", "mentions"):
                c.execute(f"DELETE FROM {t} WHERE project_id=?", (project_id,))
            c.execute("DELETE FROM session_relations WHERE project_id=?", (project_id,))
            c.execute("DELETE FROM concepts WHERE project_id=?", (project_id,))
            c.execute("DELETE FROM sessions WHERE project_id=?", (project_id,))
            c.execute("DELETE FROM ingest_runs WHERE project_id=?", (project_id,))
