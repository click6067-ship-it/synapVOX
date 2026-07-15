# SynapVox — 세션을 가로지르는 지식 그래프 (GraphRAG)

> **한 줄 요약**: 강의·회의 **텍스트를 붙여넣으면** 개념을 뽑아 지식 그래프로 만들고, 구조화된 대시보드로 탐색하고, 그에 대해 **질문(GraphRAG)** 할 수 있는 웹앱. **여러 강의·여러 과목을 가로지르는 개념 연결**이 핵심.

🔗 **라이브 데모: https://web-delta-one-96.vercel.app**

## 왜 만들었나 (문제)
다글로·NotebookLM·클로바노트는 **하나의 녹음/노트 안에서는** 강력하지만, **여러 세션·과목을 가로지르는 연결**("경사하강법이 딥러닝·최적화개론에서 어떻게 이어지지?")은 못 한다. SynapVox는 바로 그 **세션 간 지식 연결**을 GraphRAG로 채운다. 한 개념을 여러 강의가 언급하면 그 개념 노드가 강의들을 자연히 잇고, 서로 다른 과목이 같은 개념을 공유하면 **교차연결**로 드러난다.

---

## 지금 어떻게 생겼나 (기능)

- **대시보드 우선 IA** — 첫 화면은 그래프가 아니라 구조화된 대시보드. **과목 → 단원(세션) → 개념** 아웃라인으로 뭘 할지 바로 보인다.
- **그래프 시각화 = 모드** — 사이드바 버튼으로 진입. 프로젝트별 / **전체(은하)** / **교차연결**(과목 체크박스로 여러 개 골라 함께 보면 공유 개념이 파란 점선으로).
- **질문하기 (맨오른쪽 사이드바)** — RAG 질의. 그래프 모드에선 답변의 근거 개념이 하이라이트된다.
- **강의 추가** — 텍스트 붙여넣기 → 처리 모달(삼점 스피너·취소). LLM이 개념·관계를 자동 추출.
- **Obsidian식 탄성 그래프** — 4계층 색(과목 허브·강의·핵심개념·일반개념), 드래그하면 이웃이 스프링처럼 따라오고 조용히 정착.
- **한글 과목 이름** — group_id는 ASCII 슬러그라도, 표시 이름을 서버에 저장해 모든 기기·팀원에게 한글로 보인다.

---

## 아키텍처 (라이브 스택)

```
 브라우저 — React · react-force-graph-2d          화면·그래프·질문 입력
    │   (Vercel 정적 호스팅)
    ▼
 FastAPI 백엔드 (Render)                            인증·사용량 한도·라우팅
    │
    ▼
 Graphiti  ★ 지식그래프 프레임워크                  쓰기=개념·관계 추출 / 읽기=하이브리드 검색
    ├──▶ OpenAI  (gpt-5.6 + 임베딩)                개념추출·답변 생성·의미 벡터화 (두뇌)
    └──▶ Neo4j Aura                                그래프 실제 저장: 노드·엣지 (창고)
```

> **핵심**: Graphiti는 DB도 AI 모델도 아니다. **Neo4j(창고) 위에서 OpenAI(두뇌)를 써서 "글을 개념그래프로 저장하고 하이브리드로 검색"하는 조수 레이어**다.
>
> 📖 **원리를 그림·실습으로 깊게** → [`docs/graphiti-architecture-guide.html`](docs/graphiti-architecture-guide.html) — 더블클릭하면 오프라인으로 열리는 **인터랙티브 학습 가이드**(만져보는 그래프 실습 · 넣기/질문 시연 포함).

---

## 두 워크플로우 (이것만 알면 90%)

**① 넣기 (강의 추가 · `POST /ingest-text`)**
텍스트 → Graphiti `add_episode` → gpt-5.6가 **개념·관계 추출** → 각 개념 **임베딩** → 중복 개념 합치기 → Neo4j에 저장.
저장 형태: `:Episodic`(강의) · `:Entity`(개념) 노드, `MENTIONS`(강의→개념) · `RELATES_TO`(개념↔개념) 엣지.

**② 꺼내기 (질문 = RAG · `GET /ask`)**
질문 → Graphiti `search`로 **하이브리드 검색**(의미 임베딩 + 키워드 BM25 + 그래프 순회) → 근거 확보(**R**) → gpt-5.6가 그 근거로 **답 생성**(**G**) → 답변 + 근거 세션 + 그래프 하이라이트.

> 곁가지: **"그래프 시각화"는 RAG가 아니다.** `GET /graph`는 검색·LLM 없이 Neo4j를 Cypher로 직접 읽어 그리는 것뿐 — 즉각적이고 AI 비용 0.

---

## 사용 기술·모델

| 역할 | 무엇 | 어디 |
|---|---|---|
| 지식그래프 (추출·검색) | **Graphiti** (Zep · 시계열 KG 프레임워크) | `gsvx/engine.py` |
| 그래프 데이터베이스 | **Neo4j Aura** | 클라우드 |
| LLM (개념추출·RAG 답변) | OpenAI **gpt-5.6** (Graphiti reasoning=`low`) | `gsvx/engine.py` |
| 임베딩 (의미 검색) | OpenAI 임베딩 · 3072차원 | `gsvx/engine.py` |
| API 서버 | **FastAPI** (uvicorn) | `gsvx/api.py` |
| 프론트엔드 | **React 19 + Vite + react-force-graph-2d** | `web/` |
| 배포 | **Vercel**(프론트) · **Render**(백엔드) · **Neo4j Aura**(DB) | `render.yaml` |

---

## 두 구현이 repo에 공존합니다

- **Graphiti 판** (`gsvx/` + `web/`) — **현재 라이브**. Graphiti + Neo4j + React. 이 문서가 설명하는 것.
- **커스텀 판** (`svx/` + `static/graph.html`) — 초기 구현. SQLite + LangGraph로 GraphRAG를 직접 만든 버전(세션 간 CONTINUES/EXPANDS 관계 판정 포함). 교육·비교용으로 보존. 상세: [`docs/graphiti.md`](docs/graphiti.md).

---

## 빠른 시작 (로컬)

**백엔드 (Graphiti 판)** — Neo4j 인스턴스 + OpenAI 키 필요:
```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements-graphiti.txt
# 환경변수(.env): OPENAI_API_KEY, NEO4J_URI(neo4j+s://…), NEO4J_PASSWORD
.venv/bin/uvicorn graphiti_main:app --host 127.0.0.1 --port 8000
```

**프론트엔드**:
```bash
cd web && npm install
# 프론트는 기본적으로 배포된 Render 백엔드를 바라봅니다.
# 로컬 백엔드로 붙이려면:
echo "VITE_API_BASE=http://127.0.0.1:8000" > .env.local
npm run dev          # http://localhost:5173
```

---

## 파일 구조

```
graphiti_main.py      Graphiti판 백엔드 엔트리 (uvicorn graphiti_main:app)
gsvx/
  engine.py           Graphiti 엔진 — add_episode(쓰기)·search/ask(읽기·RAG)·graph(조회)·표시이름
  api.py              FastAPI 엔드포인트 (인증·사용량 한도·라우팅)
web/                  React 프론트엔드 (Vite · TypeScript)
  src/dashboard/      대시보드 (과목 → 단원(세션) → 개념 아웃라인 · 온보딩)
  src/graph/          GraphView (force graph · 탄성 · 4계층 색 · 교차연결)
  src/ask/            질문하기 우측 rail + RAG 훅(useAsk)
  src/layout/         AppLayout (좌 사이드바 + 라우팅 + 우 rail + 업로드)
  src/pages/          GraphModePage (그래프 모드: /graph?scope|projects)
  src/upload/         강의 추가 드로어 + 처리 모달
render.yaml           Render 배포 블루프린트 (Graphiti판)
svx/ · static/graph.html   초기 커스텀판 (SQLite + LangGraph, 단일 HTML 프론트)
docs/
  graphiti-architecture-guide.html   ★ 인터랙티브 아키텍처 학습 가이드(오프라인 실행)
  graphiti.md · blueprint-graphrag-mvp.md   설계·구현 문서
```

---

## 주요 API (헤더 `X-API-Key: demo-bio`)

| 엔드포인트 | 하는 일 |
|---|---|
| `GET /projects` | 과목(프로젝트) 목록 + 세션·개념 수 + 표시 이름 |
| `POST /ingest-text` `{project,title,text,name?}` | 텍스트 → 그래프화, 새 세션(강의) 추가 |
| `GET /graph?project=` | 지식그래프(노드·엣지) — 시각화용 |
| `GET /ask?project=&q=` | **RAG 질의** — 근거 세션 + 답변 |
| `GET /concept/{id}` · `GET /session/{id}` | 개념 근거 / 세션 상세 |
| `POST /project-name` `{project,name}` | 과목 표시 이름 설정/변경 |
| `GET /config` | RAG 활성 여부 + 사용 모델 |

---

## 검증 (증거)

```bash
# 백엔드 — Graphiti API 계약 (Neo4j 없이 StubEngine으로 인증·한도·라우팅 회귀 가드)
.venv/bin/python -m pytest tests/test_gsvx_api.py -q      # 29 tests

# 프론트엔드 — 순수 로직(그래프 데이터 변환·교차연결·물리 등)
cd web && npm test                                        # 76 tests (vitest)
```

설계 근거: `docs/blueprint-graphrag-mvp.md` · Graphiti 원리: `docs/graphiti-architecture-guide.html`. (STT는 범위 밖 — 텍스트 입력 가정.)
