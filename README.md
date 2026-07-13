# SynapVox — 세션을 가로지르는 지식 그래프 (GraphRAG)

> **한 줄 요약**: 강의·회의 **텍스트를 붙여넣으면**, 그 안의 개념을 뽑아 지식 그래프로 만들고,
> **이전 세션들과 같은 맥락인지 LLM이 판단해 자동으로 이어 붙인 뒤**, 그래프로 보여주고 그에 대해 **질문(RAG)** 할 수 있는 웹앱.

> **🔀 두 가지 구현이 있습니다:**
> - **커스텀 판** (`svx/`, 이 문서) — SQLite + LangGraph로 직접 구현. **Vercel 배포됨**: https://synapvox.vercel.app
> - **Graphiti 판** (`gsvx/`, [docs/graphiti.md](docs/graphiti.md)) — Zep의 시계열 지식 그래프 프레임워크 **Graphiti + Neo4j**로 재구현. 프론트는 공용.

## 왜 만들었나 (문제)
다글로·NotebookLM·클로바노트 같은 서비스는 **하나의 녹음/노트 안에서는** 강력하지만,
**여러 세션을 가로지르는 연결**(“세포호흡이 3강·5강·6강에서 어떻게 이어졌지?”)은 못 한다.
SynapVox는 바로 이 **세션 간 지식 연결**을 GraphRAG로 채운다.

---

## 전체 흐름 (이 그림 하나면 됩니다)

```
 ┌──────────────┐   프론트엔드(static/graph.html)에 강의 텍스트를 붙여넣기
 │ "강의 텍스트"│   또는 샘플 캠벨 생명과학 강의를 버튼으로 적재
 └──────┬───────┘
        │  POST /ingest-text  (또는 /ingest)
        ▼
 ┌───────────────────────── 백엔드 GraphRAG 수집 (LangGraph) ─────────────────────────┐
 │  ① 세그먼트화   ② 임베딩            ③ 개념 추출              ④ 근거(mentions)  ⑤ 관계 판정 │
 │  (문단 분할)   (text-embedding-   (seed 사전 + gpt-5.6-sol   (어느 문장이       (gpt-5.6-sol이 │
 │               3-large)           하이브리드)               개념을 언급했나)   "이전 세션과   │
 │                                                                              같은 맥락?"    │
 │                                                                              CONTINUES/     │
 │                                                                              EXPANDS/무관)  │
 └──────────────────────────────────────┬───────────────────────────────────────────────────┘
                                         │  전부 DB(그래프)에 저장 = 캐시
                                         ▼
 ┌──────────────────────────┐        ┌──────────────────────────────┐
 │  시각화                  │        │  질문 (RAG, LangGraph)       │
 │  개념·세션 노드 그래프   │        │  검색(벡터) → 그래프 1~2홉    │
 │  세션 간 CONTINUES/EXPANDS│        │  확장 → gpt-5.6-sol 답변      │
 │  노드 클릭 → 근거 원문   │        │  (여러 세션 관통 + 출처 인용) │
 └──────────────────────────┘        └──────────────────────────────┘
```

**핵심 아이디어 셋**
1. **텍스트 → 그래프**: 개념을 노드로, “어느 세션의 어느 문장이 그 개념을 말했나”를 근거로 저장.
2. **같은 맥락이면 잇는다**: 새 세션이 기존 세션과 개념을 공유하면, LLM이 근거를 읽고 *같은 흐름을 이어가는지(CONTINUES) / 새 맥락으로 확장하는지(EXPANDS) / 우연히 같은 단어일 뿐인지(잇지 않음)* 를 판단.
3. **그래프로 답한다 (GraphRAG)**: 질문에 대해 벡터 검색만 하는 게 아니라, 그래프를 타고 *다른 세션에서 그 개념이 어떻게 이어졌는지*까지 근거로 모아 LLM이 답한다.

---

## 사용 기술·모델

| 역할 | 무엇을 쓰나 | 어디서 |
|---|---|---|
| **LLM (개념추출·맥락판정·RAG답변)** | OpenAI **gpt-5.6-sol** | `svx/llm.py` |
| **임베딩 (의미 검색)** | OpenAI **text-embedding-3-large** (3072차원) | `svx/llm.py` |
| **파이프라인 오케스트레이션** | **LangGraph** (수집·질의를 StateGraph로) | `svx/pipeline.py` |
| **API 서버** | **FastAPI** | `svx/api.py` |
| **저장소 (그래프+벡터)** | **SQLite** (데모) → Postgres+pgvector 전환 가능 | `svx/store.py` |
| **프론트엔드** | 바닐라 JS + SVG force 그래프 (라이브러리 無, self-contained) | `static/graph.html` |

> **키가 없어도 됩니다**: `OPENAI_API_KEY`가 없으면 임베딩은 해싱 방식, 관계 판정은 규칙(같은 단원=CONTINUES)으로 **자동 폴백** — 그래프 시각화는 그대로 뜨고 RAG 질의만 비활성. 키가 있으면 위 실제 모델로 동작.

---

## 빠른 시작

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
echo "OPENAI_API_KEY=sk-..." > .env          # (선택) 실제 RAG를 켜려면
.venv/bin/uvicorn graph_main:app --host 127.0.0.1 --port 8010
# 브라우저: http://127.0.0.1:8010   (API key는 UI 내장: demo-bio)
```

**써보기**
1. **[전체 적재]** — 샘플 캠벨 생명과학 강의 6개가 파이프라인을 타고 그래프로 쌓인다(증분).
2. **"텍스트로 강의 추가"** — 아무 강의 텍스트나 붙여넣고 [그래프에 추가] → 새 세션이 기존 그래프에 *같은 맥락으로* 연결된다.
3. **"세션↔세션만 보기"** — 강의 흐름(시간순 + CONTINUES/EXPANDS)만 깔끔히.
4. **[AI 답변]** — “세포호흡은 어느 강의들에서 어떻게 이어지나?” 같은 질문 → 여러 세션을 관통한 답변 + 출처.

---

## 아키텍처 (조금 더 깊이)

### 수집 파이프라인 = LangGraph (`svx/pipeline.py`)
```
START → extract → persist → relate → finalize → END
        (임베딩·   (DB 쓰기)  (LLM 맥락    (결과)
         개념추출)            판정+쓰기)
```
- **무거운 네트워크 호출(임베딩·LLM)은 DB 트랜잭션 밖**에서 하고, **검증된 결과만 짧은 트랜잭션으로 저장** — 실패해도 DB가 반쯤 망가지지 않는다.
- **모든 LLM/임베딩 결과는 캐시**(`extraction_cache`, 키에 모델·프롬프트 버전 포함). 그래서 **재실행·증분 추가가 공짜**이고, 쿼리 시엔 캐시만 조회 → 빠름. (“그래프RAG는 느려서 캐시가 필요하다”의 실제 답: 무거운 건 넣을 때 1번, 볼 때는 캐시.)

### 질의 파이프라인 = LangGraph
```
START → retrieve → expand → generate → END
        (벡터검색)  (그래프    (LLM 답변,
                    1~2홉)     출처 인용)
```
`expand`가 **다른 세션에서 그 개념이 CONTINUES/EXPANDS로 어떻게 이어졌는지**를 컨텍스트에 넣는 것이 일반 벡터 RAG와 다른 **Graph**RAG의 핵심.

### 그래프 데이터 모델 (`svx/store.py`)
- 노드: **세션(강의)** · **개념**. 엣지: `SESSION_MENTIONS_CONCEPT`(근거) · `CONCEPT_CO_OCCURS_WITH`(동시출현) · `NEXT_SESSION`(시간순) · `CONTINUES`/`EXPANDS`(세션 간 맥락).
- **근거·동시출현 엣지는 저장하지 않고 `mentions` 위의 VIEW** → 재-ingest해도 가중치가 꼬이지 않는다(멱등이 스키마로 보장).
- **모든 데이터에 `project_id`** — 프로젝트 간 완전 격리(다른 프로젝트 데이터가 검색·그래프에 절대 안 섞임).

---

## 파일 구조

```
graph_main.py            서버 엔트리포인트 (키 있으면 실제 LLM, 없으면 폴백)
svx/
  pipeline.py            LangGraph 수집·질의 그래프 (파이프라인의 심장)
  llm.py                 OpenAI 클라이언트 (임베딩·개념추출·맥락판정·RAG답변, 전부 캐시)
  ingest.py              Ingestor/Rag — LangGraph 앱을 감싸는 얇은 래퍼
  store.py               SQLite 스키마 + VIEW + 조회 (project_id 강제)
  seeds.py               개념 사전 매칭 (하이브리드의 seed 층)
  api.py                 FastAPI 엔드포인트
corpus/
  campbell_sessions.json 샘플 강의 6개 (개념이 세션 간 이어지도록 설계) — 라벨 없음
  campbell_labels.json   평가용 정답셋 (eval만 읽음, leakage 방지)
  seed_concepts.json     캠벨 개념 사전
static/graph.html        프론트엔드 (시각화 + 텍스트 추가 + RAG 질의) — 단일 파일
scripts/                 seed_graph.py(적재) · eval_relations.py(품질 게이트)
tests/                   44개 테스트
docs/blueprint-graphrag-mvp.md   설계도 (Claude×Codex 킥오프 3라운드 승인)
```

## 주요 API (헤더 `X-API-Key: demo-bio`)
| 엔드포인트 | 하는 일 |
|---|---|
| `POST /ingest-text` `{title?,chapter?,text,keywords?}` | 텍스트 → GraphRAG화해서 새 세션으로 추가 |
| `POST /ingest` `{session_key}` | 샘플 코퍼스 세션 적재 |
| `GET /graph` | 전체 지식 그래프(노드·엣지) |
| `GET /concept/{id}` · `GET /session/{id}` | 개념 근거 / 세션 상세 |
| `GET /ask?q=` | **RAG 질의** — 여러 세션 관통 답변 + 출처 |
| `GET /config` | RAG 활성 여부 + 사용 모델 |

## 검증 (증거)
```bash
.venv/bin/python -m pytest tests/          # 44 tests (격리·멱등·인증·관계·텍스트인제스트)
.venv/bin/python scripts/eval_relations.py # 관계 precision/recall + seed 커버리지 게이트
```
설계 근거: `docs/blueprint-graphrag-mvp.md` (STT는 범위 밖 — 텍스트 입력 가정).
