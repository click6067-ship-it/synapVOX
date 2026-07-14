"""GraphitiEngine — SynapVox 백엔드를 Graphiti(시계열 지식 그래프) 위에 재구현.

- 세션(강의)을 Graphiti의 episode로 넣으면 엔티티·관계를 LLM이 자동 추출(gpt-5.4).
- 세션 간 연결 = 여러 episode가 공유하는 엔티티 + Graphiti가 학습한 엔티티-엔티티 관계(fact).
- 질의(RAG) = graphiti.search(하이브리드) → fact 근거 → gpt-5.6-sol 답변.
- group_id = project_id (그래프 격리).

Neo4j 읽기(그래프 시각화·상세)는 별도 neo4j async driver로, 쓰기·검색은 Graphiti로.
"""

import os
from datetime import datetime, timedelta, timezone

from neo4j import AsyncGraphDatabase
from openai import OpenAI

from pydantic import BaseModel

from graphiti_core import Graphiti
from graphiti_core.nodes import EpisodeType
from graphiti_core.llm_client.openai_client import OpenAIClient
from graphiti_core.llm_client.config import LLMConfig
from graphiti_core.embedder.openai import OpenAIEmbedder, OpenAIEmbedderConfig


class Concept(BaseModel):
    """강의에서 다루는 학술 개념·기법·이론·용어. 고유명사가 아니어도, 추상적이어도
    반드시 추출한다(개념 지도에 올릴 만한 것이면 모두). 이 프로젝트의 그래프는 세션을
    가로지르는 '개념 연결'이 핵심이므로, 개념은 애매해도 건너뛰지 말고 추출한다.
    GOOD 예시: 손실 함수, 경사 하강법, 역전파, 가중치, 활성화 함수, 순전파, 과적합,
    정규화, 배치 정규화, 어텐션, 셀프 어텐션, 특징 맵, 임베딩, 합성곱, 풀링,
    ATP, NADH, 해당과정, 광합성, 전자전달계, 시트르산 회로, 발효, 효소.
    BAD 예시(추출 금지): 오늘, 다음 시간, 우리, 것, 문제(맥락 없는 일반어)."""


# 기본 Entity(named 편향, "애매하면 추출 안 함")에 더해 개념형을 추가 → 추상 개념도 추출.
CONCEPT_ENTITY_TYPES = {"Concept": Concept}

EXTRACT_MODEL = os.environ.get("GRAPHITI_MODEL", "gpt-5.5")        # Graphiti 기본·최상위(엔티티/관계 추출)
ANSWER_MODEL = os.environ.get("ANSWER_MODEL", "gpt-5.6-sol")       # 최상위(RAG 답변, temperature 미전송)
EMBED_MODEL = os.environ.get("EMBED_MODEL", "text-embedding-3-large")
BASE_DATE = datetime(2026, 3, 1, tzinfo=timezone.utc)


class GraphitiEngine:
    def __init__(self):
        key = os.environ["OPENAI_API_KEY"]
        uri = os.environ.get("NEO4J_URI", "bolt://localhost:7687")
        user = os.environ.get("NEO4J_USER", "neo4j")
        pw = os.environ.get("NEO4J_PASSWORD", "synapvox123")
        llm = OpenAIClient(config=LLMConfig(api_key=key, model=EXTRACT_MODEL))
        embedder = OpenAIEmbedder(config=OpenAIEmbedderConfig(api_key=key, embedding_model=EMBED_MODEL, embedding_dim=3072))
        self.g = Graphiti(uri, user, pw, llm_client=llm, embedder=embedder)
        self.driver = AsyncGraphDatabase.driver(uri, auth=(user, pw))
        self.oai = OpenAI(api_key=key)
        self.extract_model, self.answer_model, self.embed_model = EXTRACT_MODEL, ANSWER_MODEL, EMBED_MODEL

    async def init(self):
        await self.g.build_indices_and_constraints()

    async def close(self):
        await self.g.close()
        await self.driver.close()

    async def _read(self, cypher, **params):
        async with self.driver.session() as s:
            res = await s.run(cypher, **params)
            return [r.data() async for r in res]

    # ── 수집 ────────────────────────────────────────────
    async def ingest(self, project: str, title: str, text: str, seq: int | None = None) -> dict:
        ref = BASE_DATE + timedelta(days=seq or 0)
        r = await self.g.add_episode(
            name=title, episode_body=text, source=EpisodeType.text,
            source_description="SynapVox 강의", reference_time=ref, group_id=project,
            entity_types=CONCEPT_ENTITY_TYPES)   # 추상 개념도 추출되도록 개념형 추가
        n_ent = len(getattr(r, "nodes", []) or [])
        n_edge = len(getattr(r, "edges", []) or [])
        return {
            "session_key": title,
            "stats": {"segments": 1, "mentions": n_ent, "concepts_total": await self._entity_count(project),
                      "concepts_new": n_ent, "relations_new": n_edge},
            "pipeline": [
                {"step": "에피소드 생성", "count": 1},
                {"step": "임베딩", "count": 1},
                {"step": f"엔티티 추출 (Graphiti·{EXTRACT_MODEL})", "count": n_ent},
                {"step": "관계 추출 (fact)", "count": n_edge},
                {"step": "그래프 반영 (Neo4j)", "count": n_ent + n_edge},
            ],
        }

    async def _entity_count(self, project):
        r = await self._read("MATCH (n:Entity {group_id:$g}) RETURN count(n) AS c", g=project)
        return r[0]["c"] if r else 0

    # ── 그래프 시각화 (프론트 계약 형식으로 매핑) ─────────
    async def graph(self, project: str) -> dict:
        eps = await self._read(
            "MATCH (e:Episodic {group_id:$g}) RETURN e.uuid AS id, e.name AS name, e.valid_at AS t ORDER BY e.valid_at", g=project)
        ents = await self._read(
            "MATCH (n:Entity {group_id:$g}) RETURN n.uuid AS id, n.name AS name, n.summary AS summary", g=project)
        mentions = await self._read(
            "MATCH (e:Episodic {group_id:$g})-[:MENTIONS]->(n:Entity {group_id:$g}) RETURN e.uuid AS s, n.uuid AS d", g=project)
        relates = await self._read(
            "MATCH (a:Entity {group_id:$g})-[r:RELATES_TO]->(b:Entity {group_id:$g}) "
            "RETURN a.uuid AS s, b.uuid AS d, r.name AS name, r.fact AS fact", g=project)

        nodes = [{"id": e["id"], "type": "session", "label": e["name"], "meta": {"seq": i + 1}}
                 for i, e in enumerate(eps)]
        nodes += [{"id": n["id"], "type": "concept", "label": n["name"], "meta": {"stoplist": False, "summary": n.get("summary")}}
                  for n in ents]
        edges = [{"src": m["s"], "dst": m["d"], "rel_type": "SESSION_MENTIONS_CONCEPT",
                  "concept_id": m["d"], "concept_label": None, "weight": 1} for m in mentions]
        for r in relates:
            edges.append({"src": r["s"], "dst": r["d"], "rel_type": "CONCEPT_CO_OCCURS_WITH",
                          "concept_id": None, "concept_label": r.get("fact") or r.get("name"), "weight": 1})

        # 세션 간 연결: 시간순 NEXT + 공유 엔티티 기반 CONTINUES(엔티티 라벨 포함)
        ep_ids = [e["id"] for e in eps]
        for a, b in zip(ep_ids, ep_ids[1:]):
            edges.append({"src": a, "dst": b, "rel_type": "NEXT_SESSION", "concept_id": None, "concept_label": None, "weight": 1})
        ent_name = {n["id"]: n["name"] for n in ents}
        ep_ents: dict[str, set] = {}
        for m in mentions:
            ep_ents.setdefault(m["s"], set()).add(m["d"])
        for i, a in enumerate(ep_ids):
            for b in ep_ids[i + 1:]:
                shared = ep_ents.get(a, set()) & ep_ents.get(b, set())
                if len(shared) >= 2:
                    labels = ", ".join(sorted(ent_name[x] for x in shared)[:4])
                    edges.append({"src": a, "dst": b, "rel_type": "CONTINUES", "concept_id": None,
                                  "concept_label": labels, "weight": len(shared)})
        return {"nodes": nodes, "edges": edges}

    async def concept_detail(self, project, concept_id):
        n = await self._read("MATCH (n:Entity {group_id:$g, uuid:$u}) RETURN n.name AS name, n.summary AS summary", g=project, u=concept_id)
        if not n:
            return None
        ev = await self._read(
            "MATCH (e:Episodic {group_id:$g})-[:MENTIONS]->(:Entity {uuid:$u}) "
            "RETURN e.uuid AS sid, e.name AS title, e.content AS text", g=project, u=concept_id)
        return {"concept_id": concept_id, "label": n[0]["name"],
                "summary": n[0].get("summary"),
                "sessions": [{"session_id": e["sid"], "title": e["title"]} for e in ev],
                "evidence": [{"session_id": e["sid"], "seg_no": 0, "matched_text": n[0]["name"],
                              "char_start": 0, "char_end": 0, "text": (e["text"] or "")} for e in ev]}

    async def session_detail(self, project, session_id):
        s = await self._read("MATCH (e:Episodic {group_id:$g}) WHERE e.uuid=$u OR e.name=$u "
                             "RETURN e.uuid AS uuid, e.name AS title, e.content AS text, e.valid_at AS t", g=project, u=session_id)
        if not s:
            return None
        uid = s[0]["uuid"]
        ents = await self._read("MATCH (:Episodic {uuid:$u})-[:MENTIONS]->(n:Entity) RETURN n.uuid AS id, n.name AS name", u=uid)
        return {"session_id": session_id, "title": s[0]["title"], "chapter": "", "seq": 0,
                "summary": (s[0]["text"] or "")[:200],
                "concepts": [{"concept_id": e["id"], "label": e["name"]} for e in ents],
                "segments": [{"seg_no": 1, "speaker": None, "text": s[0]["text"] or ""}]}

    async def timeline(self, project):
        eps = await self._read("MATCH (e:Episodic {group_id:$g}) RETURN e.uuid AS id, e.name AS name, e.content AS text ORDER BY e.valid_at", g=project)
        out = []
        for i, e in enumerate(eps):
            ents = await self._read("MATCH (:Episodic {uuid:$u})-[:MENTIONS]->(n:Entity) RETURN n.name AS name LIMIT 12", u=e["id"])
            out.append({"session_id": e["id"], "seq": i + 1, "title": e["name"], "chapter": "",
                        "summary": (e["text"] or "")[:160], "concepts": [x["name"] for x in ents]})
        return out

    # ── 검색 · RAG ──────────────────────────────────────
    async def _ep_titles(self, project):
        return {e["id"]: e["name"] for e in await self._read(
            "MATCH (e:Episodic {group_id:$g}) RETURN e.uuid AS id, e.name AS name", g=project)}

    async def search(self, project, q, k=8):
        results = await self.g.search(q, group_ids=[project], num_results=k)
        titles = await self._ep_titles(project)
        hits = []
        for r in results:
            eps = getattr(r, "episodes", None) or []
            title = next((titles[x] for x in eps if x in titles), "")
            hits.append({"session_id": title or (eps[0] if eps else ""), "seg_no": 0,
                         "text": r.fact, "score": 1.0, "concepts": []})
        return hits, results

    async def ask(self, project, q, k=8) -> dict:
        hits, results = await self.search(project, q, k)
        # 근거: fact + 어느 세션(episode)에서 나왔는지
        ep_titles = {e["id"]: e["name"] for e in await self._read(
            "MATCH (e:Episodic {group_id:$g}) RETURN e.uuid AS id, e.name AS name", g=project)}
        blocks = []
        for r in results:
            eps = getattr(r, "episodes", None) or []
            src = ", ".join(dict.fromkeys(ep_titles.get(x, "") for x in eps if ep_titles.get(x)))
            blocks.append(f"- {r.fact}" + (f"  (근거 세션: {src})" if src else ""))
        ctx = "▶ Graphiti가 그래프에서 검색한 사실(fact):\n" + "\n".join(blocks)
        sys = ("너는 강의 지식 그래프(Graphiti) 기반 어시스턴트다. 아래 검색된 사실만 사용해 한국어로 답하고, "
               "근거가 된 세션 제목을 [제목]으로 인용하라. 사실에 없으면 모른다고 하라.")
        r = self.oai.chat.completions.create(
            model=self.answer_model,
            messages=[{"role": "system", "content": sys}, {"role": "user", "content": f"질문: {q}\n\n{ctx}"}],
            max_completion_tokens=2500)
        answer = r.choices[0].message.content
        # 확장 서브그래프: 근거 episode(uuid) 노드 강조
        hit_uuids = {x for r in results for x in (getattr(r, "episodes", None) or [])}
        g = await self.graph(project)
        keep = set(hit_uuids) | {e["dst"] for e in g["edges"]
                                 if e["rel_type"] == "SESSION_MENTIONS_CONCEPT" and e["src"] in hit_uuids}
        exp_nodes = [n for n in g["nodes"] if n["id"] in keep]
        exp_edges = [e for e in g["edges"] if e["rel_type"] == "SESSION_MENTIONS_CONCEPT" and e["src"] in hit_uuids]
        return {"query": q, "answer": answer, "hits": hits, "expansion": {"nodes": exp_nodes, "edges": exp_edges}}

    async def reset(self, project):
        await self._read("MATCH (n {group_id:$g}) DETACH DELETE n", g=project)

    async def sessions_in(self, project):
        return await self._read("MATCH (e:Episodic {group_id:$g}) RETURN e.name AS name", g=project)
