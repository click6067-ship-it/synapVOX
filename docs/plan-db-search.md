# plan — synapVOX 용하 파트: 백엔드/DB & 검색 (MVP)

v1.0 최종 — Round 3 Codex VERDICT: APPROVED (hard-gate 7/7) · 2026-07-13

## 0. 확정된 입력 (사용자 답변)
- 데드라인: **1~2주 내 데모** · 배포: **클라우드 배포까지** · 그래프: **경량 그래프 뷰 필요(Neo4j 아님)**
- 2차 상세 설계서 v1.1: **deferred** — 접근 확보 전까지 2차 타입명(CONTINUES/SUPERSEDES 등) 스키마·API 사용 금지

## 1. 문제·니즈 (해법과 분리)
LLM 파이프라인 산출물(구조화 JSON)을 project_id로 격리 저장하고, 시간별·주제별 정리 + 임베딩 검색 + **회의 간 공유 주제 뷰**를 웹 UI(도원)·정리문 생성(도윤)에 제공한다. 경쟁사 공백(세션 간 연결)의 데모 가능한 최소 증명.

## 2. 성공 기준 (측정 가능)
1. **검색 품질 (D5 게이트)**: D1 평가 fixture(회의 5개 + 대표 쿼리 10개 + 정답 `meeting_id+segment_id` 매핑, C/B 공동 소유)로 D5 dry-run — top-5 적중 ≥ 8/10. **fixture가 D1에 미완성이면 plan은 blocked — 팀/사용자 승인 없이는 기준을 낮추거나 폐기할 수 없다 (자동 격하 금지).**
2. **격리**: cross-project 누출 0 — 리포지토리 단일 경유 + 자동 누출 테스트. project_id는 클라이언트 입력이 아니라 **서버가 API key에서 결정**.
3. **공유 주제 뷰**: `/graph/shared-topics`가 회의 노드 + 공유 주제 엣지(근거: 공유 태그·연결 segment 수)를 반환, 데모에서 회의 3개+ 연결 화면 시연. **"관계성/Graph RAG" 주장 금지 — "shared topic view"로 명명.** D1 fixture에 "회의 3개·공유 태그 ≥2가 성립하는 그래프 최소 데이터"를 포함해 D6 전에 빈 그래프 여부를 검출.
4. **E2E**: fixture JSON 투입 → 저장 → 3개 API 응답 무인 통과. 조회 p95 < 1s는 warm 인스턴스 기준(데모 전 warm-up 절차 문서화).
5. **일정**: D+10 내 데모 가능.

## 3. 제약·비범위
- 기간 1~2주, 백엔드 1인.
- **비범위 (의도적 삭제/연기)**: Neo4j · 온톨로지(관계 enum 포함 — rejected for MVP) · Entity Store/ID 정책 · LangGraph · 하이브리드 검색 View · ANN 인덱스 튜닝 · 사용자별 인증/멀티테넌시 · **rate limiting**(데모 규모에서 과잉 — key rotation으로 갈음, 공개 배포 전환 시 재검) · 청킹 · topics 정규화 테이블 · edges 물질화 테이블 · 임베딩 모델 스위칭 로직 · 문서 파일 서빙(참조 메타만 저장).

## 4. 전략 (가장 단순한 경로)
### 스택 — D0–1 확정 게이트 4개: ①벤더 ②키 관리 ③평가 fixture ④임베딩 모델+차원. 하나라도 실패 시 scope 변경 승인 필요.
- **Supabase Postgres + pgvector** (free tier에 요청별 cold start 없음 — Neon free의 scale-to-zero와 p95 충돌로 배제. 7일 비활성 pause → 데모 주간 활성 유지).
- **DB 접근 A안 고정**: 프론트에 Supabase JS/REST client **절대 금지**. FastAPI만 DB connection string(서버 env)으로 접근. 테이블은 **비공개 스키마(`app`)에 생성**(exposed `public` 스키마 회피 — RLS 정책 없이도 PostgREST 노출 경로 차단), 방어층으로 RLS enable(정책 0개 = deny-by-default)도 켠다. Supabase secret key류는 서버 env 외 어디에도 노출 금지.
- **FastAPI**: 저장 1개 + 조회 3개(`/search`, `/timeline`, `/graph/shared-topics`) + 단일 데모 API key.
  - key 취급 최소 조건: 서버는 env의 **SHA-256 해시와 비교**(원문 미저장) · request 로그에서 헤더 redaction · CORS 허용 origin = 도원 배포 origin만 · 유출 시 env 교체로 rotation.
- **클라우드 fallback 사다리**: ① Supabase → ② Railway/Render Postgres(같은 스키마·API) → ③ VM docker Postgres. 로컬 시연 격하는 사용자 승인 필요.

### 테이블 (`app` 스키마, 3개)
1. `meetings` — meeting_id PK, project_id NOT NULL, date, mode, source, **doc_refs JSON**(`{name, source_type, storage_key|null}`만 — **로컬 절대경로 저장 금지**), summary.
2. `segments` — 검색의 유일한 1차 단위. segment_id, meeting_id FK, project_id, text, ts_start/ts_end, speaker, topic_tags(TEXT[]), **embedding vector(dim) — 모델·차원 D1 고정, embedding_model + embedding_dim 기록**. D5 교체 후보는 동일 차원 모델 우선, 차원 변경은 컬럼 재생성 마이그레이션(premortem 7). entity_id(nullable placeholder — API·검색·그래프 미노출).
3. `annotations` — annotation_id, segment_id FK, project_id, kind('bookmark'|'decision'|'action'), payload(JSON — LLM 출력 원본 보존, supersedes_hint 포함). 임베딩 없음. **API 응답은 whitelist 필드만**(label/text/assignee/due/ts) — payload 원본은 DB 내부 보관, 2차 의미론(supersedes 등)이 UI로 새지 않게.

### 핵심 규칙
- **공유 주제 뷰 = 쿼리**(테이블 아님): segments.topic_tags on-the-fly 도출, weight = 공유 태그 수, 임계값 ≥2. **빈 그래프 fallback**: 임계값 1로 하향 + generic tag stoplist(예: "회의", "일정" 류) 적용 — fallback 발동은 데모 노트에 기록.
- **벡터 검색 캡슐화**: `search_segments(project_id, query_embedding, k)` 단일 리포지토리 함수 + 고정 테스트. 외부 raw vector SQL 금지.

## 5. 구현 순서
- **D0–1**: 확정 게이트 4개(벤더 프로비저닝·키 관리·평가 fixture(그래프 최소 데이터 포함)·임베딩 모델+차원) + 3개 스키마 계약 팀 확정 + 도윤 출력 fixture JSON 확보 + **프론트 번들에 Supabase URL/key 부재 확인**. **게이트 미충족 항목은 scope 변경 승인으로만 통과.**
- **D2–4**: ingest + `/timeline` + `/search`(pgvector) + API key 인증(해시·redaction·CORS) + 누출 테스트
- **D5**: 검색 품질 dry-run 게이트 (미달 시 동일 차원 모델 교체 / topic 필터 병용 판단)
- **D6–7**: `/graph/shared-topics` + 도원 렌더 포맷 합의 + FastAPI 클라우드 배포
- **D8–10**: E2E 통합 지원 · 실회의 1건 통과 · warm-up 절차 · 데모 · **데모 직후 API key rotation**

## 6. Premortem
1. managed DB 늪 → 클라우드 사다리(Supabase→Railway/Render→VM docker), 로컬 격하는 사용자 승인.
2. 스키마 계약 지연 → fixture JSON 선행 + 스키마 버전 필드.
3. 공유 주제 뷰 털뭉치/빈 그래프 → D1 그래프 fixture로 조기 검출 + 임계값·stoplist fallback + 상위 weight N개 렌더.
4. 한국어 임베딩 품질 미달(D5 발견) → 동일 차원 모델 교체 + topic 필터 병용.
5. project_id 누출 → 서버 결정 + 리포지토리 단일 경유 + 자동 테스트 + 비공개 스키마/RLS 이중 방어.
6. cold start/pause 데모 타격 → 데모 주간 활성 유지 + warm-up + p95 warm 기준.
7. **임베딩 차원 변경 필요 발생** → vector 컬럼 재생성 마이그레이션 절차(신규 컬럼 생성→재임베딩→스왑) 문서화, D5 전엔 동일 차원 우선으로 회피.
8. API key 유출(데모 링크 공유·devtools) → 해시 비교·로그 redaction·CORS 제한·즉시 rotation. rate limit은 비범위(공개 전환 시 재검).

## 7. 라운드별 blocking 지적 처리 (accepted / rejected / deferred)
| 지적 | 처리 |
|---|---|
| R1: 클라우드 배포 ↔ 인증 비범위 모순 | accepted — 데모 API key + 서버측 project_id 결정 |
| R2: 자동 격하가 hard-gate ② 우회 | **accepted** — fixture 미완성 = blocked, 격하는 팀/사용자 승인 필요 |
| R2: Supabase 스키마/키 관리 미명시 | **accepted (A안)** — 프론트 client 금지, 비공개 `app` 스키마 + RLS enable(정책 0), secret 서버 env만 |
| R2: API key 운영 조건 | **부분 accepted** — 해시 비교·로그 redaction·CORS 제한·rotation 수용 / **rate limit은 rejected**(데모 규모 과잉, 공개 전환 시 재검) |
| R2: embedding 차원 미고정 | **accepted** — D1 모델+차원 고정, embedding_dim 기록, 차원 변경 마이그레이션 premortem (R1 기각 유지 + 조건 보강) |
| R2: payload 통과 저장의 2차 의미론 누출 | **accepted** — API 응답 whitelist, payload는 DB 내부 보관 (R1 기각 유지 + 조건 보강) |
| R2: 빈 그래프 리스크 | accepted — D1 그래프 fixture + 임계값/stoplist fallback |
| R2: doc_paths 경로 무의미/노출 | accepted — doc_refs{name,source_type,storage_key}로 교체, 절대경로 금지 |
| R1: shares_topic 명명·edges 테이블 | accepted — "shared topic view", on-the-fly 쿼리 |
| R1: items 통합 테이블 | accepted — segments 단일 검색 단위 + annotations 분리 |
| R0: Neo4j/Graph RAG | deferred — 게이트: multi-hop 질문 10개+골든셋 + 관계판정 F1≥0.7 전망 시 2차 진입 |
| R0: 2차 설계서 정합 | deferred — 소재 확보 시 씨앗 필드 재검 |
| R0: 온톨로지/관계 enum | rejected for MVP |
| R0: entity_id | accepted — nullable 저장만, 미노출 |

## 8. 열린 질문
- 2차 설계서 v1.1 소재 (팀원 워크스페이스 추정)
- FastAPI 호스팅(Railway/Render/Fly) — 도원 배포 스택과 D0–1 정렬
