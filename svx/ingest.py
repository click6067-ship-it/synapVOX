"""Ingestor / Rag — LangGraph 파이프라인(svx/pipeline.py)을 감싸는 얇은 래퍼.

- Ingestor.ingest(): 텍스트/세션 → GraphRAG 수집 그래프 실행(세그먼트→임베딩→개념→멘션→관계).
- Rag.ask(): 질문 → RAG 그래프 실행(검색→그래프확장→LLM 답변).
llm이 없으면(키 미설정) 수집은 seed+규칙으로 동작하고, RAG는 비활성.
"""

from svx.pipeline import build_ingest_app, build_rag_app


class Ingestor:
    def __init__(self, store, seeds, embedder, llm=None):
        self.store = store
        self.seeds = seeds
        self.embedder = embedder
        self.llm = llm
        self._app = build_ingest_app(store, embedder, llm)

    def ingest(self, session_doc: dict, project_id: str, extra_concepts: list | None = None) -> dict:
        seeds = self.seeds.merged(extra_concepts) if extra_concepts else self.seeds
        state = self._app.invoke({"session_doc": session_doc, "project_id": project_id, "seeds": seeds})
        return state["result"]


class Rag:
    def __init__(self, store, embedder, llm):
        self.store = store
        self.llm = llm
        self._app = build_rag_app(store, embedder, llm)

    def ask(self, question: str, project_id: str, k: int = 6) -> dict:
        state = self._app.invoke({"question": question, "project_id": project_id, "k": k})
        return {"query": question, "answer": state["answer"],
                "hits": state["hits"], "expansion": state["expansion"]}
