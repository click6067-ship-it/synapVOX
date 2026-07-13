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

## 배포 — Render + Neo4j Aura Free (쿼리 전용)

Graphiti는 그래프 DB 연결을 상주시켜야 해서 Vercel 서버리스와는 안 맞습니다. 그래서
**Render(웹서비스) + Neo4j Aura Free(관리형 그래프 DB)** 조합으로 배포합니다. 커스텀 판
(`svx/`)은 `synapvox.vercel.app` 그대로 두고, Graphiti 판은 별도 URL이 됩니다.

**비용/남용 방어**: 공개 앱은 `SVX_READONLY=1`로 **조회·검색·RAG만** 노출합니다.
세션당 LLM 엔티티/관계 추출이 드는 `ingest`는 막고, 그래프는 배포 전에 **한 번만 사전 시드**합니다.

```
[Neo4j Aura Free] ◀─ scripts/seed_graphiti.py 로 6강 사전 시드(로컬 1회, OpenAI 토큰)
      ▲ neo4j+s://
[Render Web Service] ── graphiti_main:app (SVX_READONLY=1) ── 조회만
```

### 절차
1. **Neo4j Aura Free 인스턴스 생성** — https://neo4j.com/product/auradb (Free 티어).
   생성 시 나오는 **접속 URI**(`neo4j+s://xxxx.databases.neo4j.io`)와 **비밀번호**를 저장.
2. **로컬 `.env`에 Aura 값 넣고 사전 시드** (OpenAI 토큰 소모, 1회):
   ```bash
   #   NEO4J_URI=neo4j+s://xxxx.databases.neo4j.io
   #   NEO4J_USER=neo4j
   #   NEO4J_PASSWORD=<aura-password>
   #   OPENAI_API_KEY=sk-...
   .venv/bin/pip install -r requirements-graphiti-deploy.txt
   .venv/bin/python scripts/seed_graphiti.py --reset
   ```
3. **Render 배포** — 대시보드 → New → **Blueprint** → 이 repo 선택 → `render.yaml`이 서비스를
   구성. `sync:false`로 비워둔 시크릿 3개(`OPENAI_API_KEY`, `NEO4J_URI`, `NEO4J_PASSWORD`)를
   Aura 값으로 입력 → Deploy.
4. **확인** — `https://<서비스>.onrender.com/config`가 `{"engine":"graphiti","readonly":true}`,
   루트(`/`)에서 그래프가 뜨고 질문(RAG)이 답하면 성공. (Free 티어는 유휴 후 첫 요청 콜드스타트 ~50s.)

> 참고: 로컬 개발/전체 기능(ingest 포함)은 위 "## 실행"의 로컬 Neo4j 도커로. 커스텀 판(`svx/`, Vercel 배포본)도 레포에 보존돼 있어 두 구현을 비교 참고할 수 있습니다.
