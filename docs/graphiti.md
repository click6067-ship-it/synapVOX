# SynapVox — Graphiti 판 (재구현)

기존 커스텀 백엔드(`svx/`, SQLite에 직접 짠 그래프+규칙)를 **[Graphiti](https://github.com/getzep/graphiti)** — Zep의
**시계열 지식 그래프 프레임워크** — 위에 다시 구현한 버전입니다. (포크: `click6067-ship-it/graphiti`)

## 무엇이 달라졌나 (한눈에)

| | 커스텀 판 (`svx/`) | **Graphiti 판 (`gsvx/`)** |
|---|---|---|
| 개념 추출 | seed 사전 + LLM 보완(내가 짬) | **Graphiti가 엔티티를 LLM으로 자동 추출** |
| 세션간 관계 | chapter 규칙 / LLM 판정(내가 짬) | **Graphiti가 엔티티-엔티티 관계(fact)를 학습** + 공유 엔티티로 세션 연결 |
| 저장 | SQLite + VIEW | **Neo4j (그래프 DB)** — group_id로 프로젝트 격리 |
| 검색(RAG) | 벡터 + 그래프 홉(내가 짬) | **Graphiti 하이브리드 검색**(시맨틱+BM25+그래프) |
| 시계열 | 없음 | **있음** — episode에 reference_time, 관계에 valid_at/invalid_at |

즉 "세션→개념→관계 추출·연결"을 **직접 짜는 대신 프레임워크(Graphiti)가 해줍니다.** 프론트엔드(`static/graph.html`)는
**그대로** 재사용 — Graphiti의 그래프(Episodic/Entity 노드 + MENTIONS/RELATES_TO 엣지)를 프론트 형식으로 매핑만 합니다.

## 사용 모델
- **엔티티·관계 추출**: `gpt-5.5` (Graphiti 기본·최상위. gpt-5.4/5.6은 Graphiti가 보내는 reasoning/temperature 파라미터와 안 맞아 gpt-5.5 사용)
- **임베딩**: `text-embedding-3-large`
- **RAG 답변**: `gpt-5.6-sol` (별도 호출, temperature 미전송)

## 실행

```bash
# 1) Neo4j 띄우기 (docker)
docker run -d --name svx-neo4j -p 7687:7687 -p 7474:7474 \
  -e NEO4J_AUTH=neo4j/synapvox123 -e NEO4J_PLUGINS='["apoc"]' neo4j:5.26

# 2) 의존성
.venv/bin/pip install -r requirements-graphiti.txt -r requirements-dev.txt

# 3) .env (OPENAI_API_KEY + Neo4j 접속정보)
#   OPENAI_API_KEY=sk-...
#   NEO4J_URI=bolt://localhost:7687
#   NEO4J_USER=neo4j
#   NEO4J_PASSWORD=synapvox123

# 4) 서버
.venv/bin/uvicorn graphiti_main:app --host 127.0.0.1 --port 8020
# 브라우저: http://127.0.0.1:8020  (API key: demo-bio)
```

## 흐름
```
텍스트/샘플 세션 → Graphiti.add_episode() ─┬─ 엔티티 추출(gpt-5.5)
                                          ├─ 관계(fact) 추출
                                          ├─ 임베딩(text-embedding-3-large)
                                          └─ Neo4j에 시계열 그래프로 적재
질문 → Graphiti.search()(하이브리드) → fact 근거 → gpt-5.6-sol 답변(+출처)
시각화 → Neo4j Cypher로 Episodic/Entity + MENTIONS/RELATES_TO 조회 → 프론트 그래프
```

## 구성
- `gsvx/engine.py` — GraphitiEngine: add_episode 수집, Neo4j 조회로 그래프 시각화 매핑, search+gpt-5.6-sol RAG.
- `gsvx/api.py` — FastAPI(async), 프론트 계약 그대로.
- `graphiti_main.py` — 엔트리포인트(캠벨 코퍼스를 episode로).

## 배포
Graphiti는 그래프 DB 연결을 유지해야 해서 Vercel 서버리스와는 안 맞습니다. 배포한다면 컨테이너 호스트(Railway/Render/Fly)
+ **Neo4j Aura**(무료 클라우드) 조합이 자연스럽습니다. (현재는 로컬 우선 — 배포는 후속.)

> 커스텀 판(`svx/`, Vercel 배포본)도 레포에 보존돼 있습니다. 두 구현을 비교 참고 가능.
