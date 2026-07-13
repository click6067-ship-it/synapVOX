"""LangGraph 파이프라인 — GraphRAG 수집(ingest)과 질의(RAG)를 StateGraph로 오케스트레이션.

blueprint §11의 "LangGraph 수집 파이프라인"을 구현. 각 노드가 파이프라인 한 단계.
- ingest 그래프: extract(세그먼트·임베딩·개념) → persist(DB 쓰기) → relate(관계 판정) → finalize
- rag 그래프:   retrieve(벡터 검색) → expand(그래프 1~2홉) → generate(LLM 답변)
네트워크 호출(임베딩·LLM)은 extract/relate/generate 노드에서, DB 쓰기는 persist/relate에서만.
"""

import re
from typing import Any, Optional, TypedDict

from langgraph.graph import START, END, StateGraph

MAX_CANDIDATE_PAIRS = 20


# ───────────────────────── Ingest 그래프 ─────────────────────────
class IngestState(TypedDict, total=False):
    session_doc: dict
    project_id: str
    seeds: Any
    seg_records: list
    mention_records: list
    concept_meta: dict
    concept_texts: dict
    n_relations: int
    result: dict


def build_ingest_app(store, embedder, llm=None):
    def n_extract(state: IngestState) -> dict:
        s, seeds = state["session_doc"], state["seeds"]
        segments = s.get("segments", [])
        seg_records, mention_records = [], []
        concept_meta, concept_texts, occ = {}, {}, {}
        for order_idx, seg in enumerate(segments):
            text, seg_no = seg["text"], seg["seg_no"]
            vec = embedder.embed(text)
            seg_records.append((seg_no, seg.get("speaker"), text, order_idx, vec))
            for m in seeds.match(text):
                cid = m["concept_id"]; c = seeds.concept(cid)
                concept_meta[cid] = (c["label"], "user" if cid.startswith("USR_") else "seed", c["relation_stoplist"])
                k = occ.get((seg_no, cid), 0); occ[(seg_no, cid)] = k + 1
                mention_records.append((seg_no, cid, k, m))
                concept_texts.setdefault(cid, []).append(text)
        # LLM 하이브리드 개념 추출 (seed 미포착 보완)
        if llm and segments:
            try:
                existing = {v[0] for v in concept_meta.values()} | {c["label"] for c in seeds.all_concepts()}
                for lbl in llm.extract_concepts("\n".join(sg["text"] for sg in segments), existing):
                    if lbl in existing:
                        continue
                    cid = "LLM_" + re.sub(r"\s+", "", lbl)
                    if cid in concept_meta:
                        continue
                    seg_no, idx = segments[0]["seg_no"], -1
                    for sg in segments:
                        j = sg["text"].find(lbl)
                        if j >= 0:
                            seg_no, idx = sg["seg_no"], j; break
                    m = {"matched_text": lbl, "char_start": max(idx, 0), "char_end": (idx + len(lbl)) if idx >= 0 else 0,
                         "extractor": "llm"}
                    concept_meta[cid] = (lbl, "llm", False)
                    k = occ.get((seg_no, cid), 0); occ[(seg_no, cid)] = k + 1
                    mention_records.append((seg_no, cid, k, m))
                    concept_texts.setdefault(cid, []).append(next(sg["text"] for sg in segments if sg["seg_no"] == seg_no))
            except Exception:
                pass
        return {"seg_records": seg_records, "mention_records": mention_records,
                "concept_meta": concept_meta, "concept_texts": concept_texts}

    def n_persist(state: IngestState) -> dict:
        s, pid, seeds = state["session_doc"], state["project_id"], state["seeds"]
        session_id = s["external_id"]
        import hashlib
        source_hash = hashlib.sha256((session_id + str(s.get("segments"))).encode()).hexdigest()
        with store._conn() as conn:
            run_id = store.new_run(conn, pid, session_id, source_hash, seeds.seed_version)
            store.clear_session_derived(conn, pid, session_id)
            store.upsert_session(conn, {
                "session_id": session_id, "project_id": pid, "external_id": session_id, "seq": s["seq"],
                "title": s.get("title", session_id), "chapter": s.get("chapter", ""),
                "summary": s.get("summary", ""), "source_hash": source_hash})
            for seg_no, speaker, text, order_idx, vec in state["seg_records"]:
                store.insert_segment(conn, pid, session_id, seg_no, speaker, text, order_idx, vec, embedder.model_name)
            for cid, (label, src, stop) in state["concept_meta"].items():
                store.upsert_concept(conn, pid, cid, label, src, stop)
            for seg_no, cid, k, m in state["mention_records"]:
                store.insert_mention(conn, pid, session_id, seg_no, cid, k, m, run_id)
            store.finish_run(conn, run_id, "committed")
        return {}

    def n_relate(state: IngestState) -> dict:
        s, pid = state["session_doc"], state["project_id"]
        session_id, seq, chapter, title = s["external_id"], s["seq"], s.get("chapter", ""), s.get("title", s["external_id"])
        concept_texts = state["concept_texts"]
        rels = []
        for cid, (label, src, stop) in state["concept_meta"].items():
            if len(rels) >= MAX_CANDIDATE_PAIRS:
                break
            if stop:
                continue
            with store._conn() as conn:
                prior = store.prior_session_for_concept(conn, pid, cid, seq)
            if not prior:
                continue
            reason = ""
            if llm:
                try:
                    prior_text = store.concept_evidence_text(pid, prior["session_id"], cid)
                    prior_title = store.session_title(pid, prior["session_id"])
                    j = llm.judge_relation(label, prior_title, prior_text, title, " ".join(concept_texts.get(cid, [])))
                    rel, reason = j["rel"], j.get("reason", "")
                    if rel == "UNRELATED":
                        continue
                except Exception:
                    rel = "CONTINUES" if (prior["chapter"] or "") == (chapter or "") else "EXPANDS"; reason = "(규칙 폴백)"
            else:
                rel = "CONTINUES" if (prior["chapter"] or "") == (chapter or "") else "EXPANDS"
            rels.append((prior["session_id"], session_id, rel, cid, reason))
        if rels:
            with store._conn() as conn:
                for src, dst, rel, cid, reason in rels:
                    store.insert_relation(conn, pid, src, dst, rel, cid, {"concept": cid, "reason": reason}, None)
        return {"n_relations": len(rels)}

    def n_finalize(state: IngestState) -> dict:
        pid = state["project_id"]
        cm, mr, sr = state["concept_meta"], state["mention_records"], state["seg_records"]
        concepts_total = sum(1 for n in store.graph(pid)["nodes"] if n["type"] == "concept")
        method = "seed+LLM" if llm else "seed"
        return {"result": {
            "session_key": state["session_doc"]["external_id"],
            "stats": {"segments": len(sr), "mentions": len(mr), "concepts_total": concepts_total,
                      "concepts_new": len(cm), "relations_new": state.get("n_relations", 0)},
            "pipeline": [
                {"step": "세그먼트화", "count": len(sr)},
                {"step": "임베딩", "count": len(sr)},
                {"step": f"개념 추출 ({method})", "count": len(cm)},
                {"step": "근거(mentions)", "count": len(mr)},
                {"step": "관계 판정(맥락)", "count": state.get("n_relations", 0)},
            ]}}

    g = StateGraph(IngestState)
    g.add_node("extract", n_extract); g.add_node("persist", n_persist)
    g.add_node("relate", n_relate); g.add_node("finalize", n_finalize)
    g.add_edge(START, "extract"); g.add_edge("extract", "persist")
    g.add_edge("persist", "relate"); g.add_edge("relate", "finalize"); g.add_edge("finalize", END)
    return g.compile()


# ───────────────────────── RAG 그래프 ─────────────────────────
class RAGState(TypedDict, total=False):
    question: str
    project_id: str
    k: int
    hits: list
    expansion: dict
    context: str
    answer: str


def build_rag_app(store, embedder, llm):
    def n_retrieve(state: RAGState) -> dict:
        qvec = embedder.embed(state["question"])
        return {"hits": store.search(state["project_id"], qvec, k=state.get("k", 6))}

    def n_expand(state: RAGState) -> dict:
        pid = state["project_id"]
        g = store.graph(pid)
        hit_sessions = {h["session_id"] for h in state["hits"]}
        sub_edges = [e for e in g["edges"]
                     if (e["rel_type"] in ("SESSION_MENTIONS_CONCEPT", "CONTINUES", "EXPANDS", "NEXT_SESSION"))
                     and (e["src"] in hit_sessions or e["dst"] in hit_sessions)]
        keep = set(hit_sessions)
        for e in sub_edges:
            keep.add(e["src"]); keep.add(e["dst"])
        nodes = [n for n in g["nodes"] if n["id"] in keep]
        return {"expansion": {"nodes": nodes, "edges": sub_edges}}

    def n_generate(state: RAGState) -> dict:
        pid = state["project_id"]
        blocks = []
        for h in state["hits"]:
            t = store.session_title(pid, h["session_id"])
            blocks.append(f"[{t}] {h['text']}")
        # 세션 간 개념 연결(GraphRAG의 핵심)을 컨텍스트에 포함
        rel_lines = []
        for e in state["expansion"]["edges"]:
            if e["rel_type"] in ("CONTINUES", "EXPANDS"):
                a = store.session_title(pid, e["src"]); b = store.session_title(pid, e["dst"])
                rel_lines.append(f"- '{a}' →{e['rel_type']}→ '{b}' (개념: {e.get('concept_label') or ''})")
        ctx = "▶ 관련 발췌:\n" + "\n".join(blocks)
        if rel_lines:
            ctx += "\n\n▶ 세션 간 개념 연결:\n" + "\n".join(dict.fromkeys(rel_lines))
        return {"context": ctx, "answer": llm.answer(state["question"], ctx)}

    g = StateGraph(RAGState)
    g.add_node("retrieve", n_retrieve); g.add_node("expand", n_expand); g.add_node("generate", n_generate)
    g.add_edge(START, "retrieve"); g.add_edge("retrieve", "expand")
    g.add_edge("expand", "generate"); g.add_edge("generate", END)
    return g.compile()
