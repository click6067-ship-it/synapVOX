# SynapVox — 세션간 개념 연결 MVP 구현 블루프린트 (담당 C)

v1.0 최종 — Round 3 Codex VERDICT: APPROVED (hard-gate 7/7) · 2026-07-13 · 기간 ~1주(7/13–7/19)

> 담당 C(백엔드/DB & 검색)의 **구현 설계도**. 확정 입력: STT 미구현(세션=플레인 텍스트) · 캠벨 생명과학1 합성 세션 · 데모=개념 그래프 시각화 중심(노드 클릭→근거) · 관계=SHARES_CONCEPT/NEXT/CONTINUES/EXPANDS · 하이브리드 개념추출 · project_id 격리.

---

## 1. 이 MVP가 증명하는 것
같은 프로젝트에 세션(강의)을 여러 개 넣으면 **개념이 세션을 가로질러 어떻게 이어지는지를 그래프로 보여주고, 노드를 클릭하면 근거 세그먼트(원문 span)를 보여준다.** 경쟁사가 못 하는 "세션 간 연결"의 최소 증명.

## 2. 성공 기준 (측정 가능 · Round1·2 반영)
0. **seed-only backbone 커버리지 게이트(D1 완료조건 · Round2 #3)**: 필수 데모 concept ≥5개, **각 concept이 ≥2 세션에 등장**, seed matcher recall ≥0.8(hidden concept 라벨 대비). 이게 충족돼야 D2 그래프가 "끊긴 별"이 아니라 세션을 잇는 형태로 뜬다.
1. **그래프 뷰**: `/graph`가 project_id 범위의 **session·concept 노드 + session→concept(SESSION_MENTIONS_CONCEPT) backbone + concept↔concept(CONCEPT_CO_OCCURS_WITH) + session→session(NEXT_SESSION/CONTINUES/EXPANDS)** 반환. 데모에서 "세포호흡이 3→5→6강으로 이어짐"이 보인다. **backbone만으로도 세션이 개념을 통해 연결돼 보여야 함**(LLM 관계 없이 성립 — §11 최소버전).
2. **근거 드릴다운**: concept 노드 클릭 → 그 개념을 다룬 세션들 + 근거 세그먼트의 **matched_text/char_start/char_end**(거친 segment 전체가 아니라 매칭 범위). 환각 없음.
3. **증분성(정직하게 재정의)**: 세션 1개 추가 시 **전역 재색인 없이**, 신규 세션이 건드리는 개념의 **bounded 후보집합**만 갱신. 비용 = O(신규 세션 크기 + Σ min(degree(concept), CANDIDATE_CAP)). "N에 무관"이라 주장하지 않음 — **candidate_policy로 상한**(§7-5).
4. **격리**: cross-project 누출 0 (repo 단일 경유 + 자동 테스트).
5. **관계 품질 게이트(D4) — precision만으로 게임 방지**: 합성 코퍼스의 **hidden 정답셋**으로 CONTINUES/EXPANDS를 (a) precision ≥ 0.8 **그리고** (b) "필수 데모 엣지 N개 중 ≥80% recall". 미달 시 해당 타입 렌더 중단(seed-only 그래프로), 팀 승인(조용한 격하 금지).
6. **멱등**: 같은 세션 재-ingest 시 엣지 weight 누적·stale row 없음(§7-멱등 테스트).

## 3. 비범위 (의도적 삭제/연기)
STT·녹음 · MS-GraphRAG의 community detection/global report/map-reduce · full 의미관계(CONTRADICTS/SUPERSEDES) · Neo4j 운영(§5) · 멀티테넌시 인증 · ANN 튜닝 · 중간 seq 삽입(§7 **seq append-only 고정**).

## 4. 아키텍처 — 쓰기(무겁게 staging→짧은 커밋) / 읽기(캐시 조회만) 분리
사용자 "속도→캐시" 우려의 설계상 답: **무거운 LLM·임베딩은 ingest 시 1회 → staging에서 검증 → 짧은 DB 트랜잭션으로 물질화. 쿼리는 물질화된 그래프/벡터만 조회(LLM·추출 0).**

```
[세션 텍스트]                                    ┌── 읽기 (빠름, DB read only) ──┐
     │                                           │ GET /graph     물질화 노드/엣지
 ── 쓰기 (ingest_run, staging→commit) ──         │ GET /concept   개념+근거 span
  0. ingest_run 생성(status=pending)             │ GET /search    벡터top-k + BFS≤2
  1. 세그먼트화(비-LLM)                          │ GET /timeline  NEXT 순
  2. 임베딩 ─────────┐ 외부호출은                └───────────────────────────────┘
  3. seed 개념 매칭   │ staging에서 완료             ▲ (LLM/임베딩 호출 0)
  4. (LLM) 개념 보완  │ (DB 트랜잭션 밖),            │
  5. (LLM) 관계 판정  │ 캐시로 멱등                  │
     status=ready ───┘                             │
  6. 검증된 결과만 짧은 트랜잭션 upsert ───────────┘
     (기존 run의 derived row 삭제 후 재생성 = 멱등)
     status=committed
```
- **외부 호출(LLM/임베딩)을 DB 트랜잭션 안에 두지 않는다**(Round1 #4). staging 완료 후 검증된 결과만 upsert.
- 중간 실패 → `ingest_runs.status=failed`, derived row 미커밋(부분 커밋 없음).

## 5. 저장소·그래프 기술 결정
**단일 관계형 스토어(SQLite 데모 → Postgres+pgvector 배포)에 그래프를 explicit nodes/edges 테이블 + `graph_adjacency` 뷰.** Neo4j 아님.
- 근거: ingest 원자성(개념·엣지·임베딩 한 트랜잭션), 소규모 그래프(세션~10·개념~100·엣지~수백)엔 앱측 BFS≤2로 충분, 벡터+그래프 동일 DB로 project_id 일관.
- **발표 문구 정정(Round1 #9)**: "Graph DB"라는 표현이 청중에게 Neo4j류를 기대하게 함 → **"Vector DB + property-graph over Postgres(그래프 데이터모델)"**로 정확히 표기하도록 D(도원)에 전달. 그래프 *데이터모델*을 구현하는 것은 사실이므로 차별점은 유효, 다만 "graph database 제품"으로 오해 안 되게.

## 6. 데이터 모델 (C 소유 · Round1+2 반영 — aggregate는 저장 안 하고 VIEW)

**핵심 원칙(Round2 #1): mentions가 유일한 write 타깃. backbone·개념공기 엣지는 mentions 위의 VIEW라 재-ingest 멱등이 자동.** 저장 행으로 누적하는 aggregate 없음 → weight 누적/과삭제 불가능.

```
-- 베이스 테이블 (write 타깃)
ingest_runs(run_id PK, project_id, session_id, source_hash, status('pending'|'ready'|'committed'|'failed'),
            schema_version, prompt_version, seed_version, code_version, created_at)
sessions(session_id PK, project_id NOT NULL, external_id, seq INT, title, chapter, source_hash,
         UNIQUE(project_id, external_id))     -- 멱등 키=external_id, source_hash 변하면 update (Round2 #7)
segments(session_id FK, seg_no, project_id, text, order_idx,
         embedding BLOB_or_VEC, embedding_model, PRIMARY KEY(session_id, seg_no))
         -- SQLite=BLOB/JSON, Postgres=vector(dim) 분기 (Round2 #6)
concepts(concept_id PK, project_id, canonical_label, source('seed'|'llm'),
         embedding BLOB_or_VEC, embedding_model)
concept_aliases(concept_id FK, project_id, alias, kind('seed'|'llm'|'jamo'))
mentions(mention_id PK, session_id, seg_no, concept_id, project_id, occurrence_idx,
         matched_text, char_start, char_end, extractor('seed'|'llm'), confidence, created_by_run_id)
         -- 근거 span, 한 세그먼트 내 같은 개념 다중 등장 허용 (Round2 OPTIONAL 수용)
session_relations(project_id, src_session, dst_session,
                  rel_type('CONTINUES'|'EXPANDS'), concept_id, evidence JSON, created_by_run_id)
         -- 판정 기반(rule/LLM)이라 유일하게 저장. 재-ingest 시 해당 session row 삭제-후-재생성
extraction_cache(cache_key PK, kind, value JSON)
   cache_key = sha256(kind + input_hash + model + params_hash(temp,system)
                      + prompt_version + schema_version + seed_version + code_version)   -- Round1 #5

-- VIEW (저장 안 함 → 자동 멱등, Round2 #1)
VIEW v_session_concept  := SELECT project_id, session_id, concept_id, COUNT(*) weight
                           FROM mentions GROUP BY project_id, session_id, concept_id   -- ★backbone
VIEW v_concept_cooccur  := mentions self-join ON same(session_id, seg_no), src<dst, COUNT weight
VIEW v_next_session     := sessions ORDER BY seq → 인접쌍 (seq append-only, Round1 #7)

-- 통합 인접 뷰 (Round1 #8, Round2 #5 — 양방향 명시)
VIEW graph_adjacency(project_id, src_type, src_id, dst_type, dst_id, rel_type, weight) :=
    v_session_concept  → 2 rows (SESSION→CONCEPT 'SESSION_MENTIONS_CONCEPT' + CONCEPT→SESSION 역방향)
  ⊍ v_concept_cooccur  → 2 rows ('CONCEPT_CO_OCCURS_WITH' 양방향)
  ⊍ v_next_session     → 정방향 'NEXT_SESSION' + 역방향 'PREV_SESSION'
  ⊍ session_relations  → 정방향 rel_type + 역방향 reverse_rel_type('CONTINUED_BY'|'EXPANDED_BY')
```
- **MVP edge vocabulary 고정(Round2 #2)**: 저장/API = `SESSION_MENTIONS_CONCEPT · CONCEPT_CO_OCCURS_WITH · NEXT_SESSION · CONTINUES · EXPANDS`. 발표용 display label은 프론트에서 `SHARES_CONCEPT` 등으로 변환(§5 D 계약).
- **데모 그래프 척추 = `v_session_concept`**: 개념 하나가 여러 세션에 걸치면 그 자체로 세션들이 개념을 통해 연결돼 보임(노드 클릭 전에도).
- **멱등(Round2 #1)**: 재-ingest = 그 session의 mentions·session_relations 행만 삭제 후 재생성. backbone/공기 엣지는 VIEW라 자동 정정. external_id 충돌 시 기존 session update(Round2 #7).

## 7. Ingest 파이프라인 (쓰기 경로 상세)
1. **ingest_run 생성**: external_id로 세션 식별 — 동일 external_id면 기존 session update, source_hash가 바뀌면 그 세션의 segments/mentions/session_relations 교체(멱등, Round3 OPTIONAL 정합).
2. **세그먼트화(비-LLM)**: 문단/발화 단위 분할, order_idx.
3. **임베딩**: 세그먼트 → 벡터(캐시 키 멱등).
4. **seed 개념 매칭(비-LLM, 최소버전의 핵심)**: 캠벨 목차 seed 사전 + alias(한/영/약어) exact 매칭 → mentions(extractor='seed', char_start/end, matched_text). **이 단계까지만으로 그래프가 뜬다.**
5. **(LLM) 개념 보완 — D5+ 옵션(Round1 #11)**: seed 미스 후보를 LLM 추출(캐시 멱등) → 임베딩+문자열 유사도로 기존 concept 병합 판정 → 신규면 concepts(source='llm')+alias. 개념 중복률 20%↑면 끔(kill).
6. **엣지 = 대부분 VIEW라 계산 불필요**: `v_session_concept`·`v_concept_cooccur`·`v_next_session`은 mentions/sessions 위 VIEW → ingest가 mentions만 쓰면 backbone·공기·NEXT가 자동으로 나옴(멱등). **판정 기반인 `session_relations`(CONTINUES/EXPANDS)만 실제 계산·저장**:
   - **candidate_policy로 bound(Round1 #1)**: 신규 세션이 다룬 각 개념에 대해 (그 개념을 다룬 **직전 k=2 세션**, 신규 세션) 쌍만, `max_candidate_pairs/session=20`.
   - **high-degree stoplist는 CONTINUES 후보 제외로만(Round2 #4)**: ATP 같은 허브는 후보에서 빼되(폭발 방지), **필수 데모 엣지는 stoplist 개념에 의존하지 않게 설계**(전자전달계·산화적인산화·NADH 등 구체 개념으로 CONTINUES). → 스톱리스트가 데모 관계를 죽이지 않음.
   - D3는 **rule/fixture-seeded로 먼저**(개념 공유 + seq 인접 + 근거 유사도 임계), LLM 판정은 D5+ 그 위에.
7. **커밋**: staging 검증 후 짧은 트랜잭션으로 mentions·session_relations upsert, status=committed.

## 8. 읽기 경로 API (C 구현 · 프론트 계약)
- `GET /graph` → `{nodes:[{id,type,label}], edges:[{src,dst,rel_type,concept_id?,weight}]}` (project_id=key). 프론트 그래프뷰 데이터소스. **backbone/공기 엣지는 display 방향 1개만 내보냄(중복 렌더 방지); 양방향은 BFS용 graph_adjacency 내부에서만**(Round3 OPTIONAL).
- `GET /concept/{id}` → 개념 + 언급 세션 + 근거 세그먼트(matched_text·char span). 노드 클릭 드릴다운.
- `GET /search?q=` → 벡터 top-k 세그먼트 → 각 히트 개념에서 `graph_adjacency` 앱측 **BFS depth≤2**(cycle 방지 visited set) → 연결 세션/개념 확장 반환.
- `GET /timeline` → NEXT 순 세션.
- (옵션) `GET /ask?q=` → 위 근거를 컨텍스트로 LLM 1회 답변(인용). 데모 여유 시.

## 9. 합성 코퍼스 설계 (Round1 #10 — leakage 방지)
캠벨 생명과학1 기반 세션 6~8개, 개념 스레드 교차. **파일 2분할**:
- `sessions_visible.json` — LLM·매칭에 들어가는 세션 텍스트(세그먼트). **정답 라벨 절대 미포함.**
- `labels_hidden.json` — 세그먼트별 정답 개념 + 세션쌍 정답 관계(CONTINUES/EXPANDS) + **필수 데모 엣지 목록**. eval 스크립트만 읽음. **LLM 입력에 이 파일이 안 들어가는 것을 테스트로 강제.**
- 스레드 예: 세포호흡 S3(해당과정)→S5(TCA, CONTINUES)→S6(전자전달계, CONTINUES+EXPANDS). ATP=허브(backbone hub, high-degree→CONTINUES 후보 제외). **필수 데모 CONTINUES 엣지는 구체 개념으로**(예: 해당과정→TCA, TCA→전자전달계, NADH의 재산화) — stoplist 개념 ATP에 의존 안 함(Round2 #4). S4 광합성=전자전달 병렬(EXPANDS). 타 project 세션 1~2개(격리).
- 평가: precision + 필수엣지 recall(성공기준 5). **LLM 입력에 labels_hidden.json이 안 들어가는 것을 테스트로 강제**(Round1 #10).

## 10. 팀 계약 (3개 스키마, 첫날 확정)
- A(현우)=중간포맷 JSON(텍스트→세그먼트). B(도윤)=LLM 출력 JSON(개념추출+CONTINUES/EXPANDS 판정 스키마 + prompt_version). C(용하)=DB/그래프 스키마(§6)+API(§8). D(도원)=E2E·프론트 그래프뷰·수용기준·발표문구(§5).

## 11. 구현 순서 (최소버전 = seed-only 그래프를 척추로 · D1 기계적 분할 Round2 #8)
- **D1 오전**: DB 스키마+마이그레이션(SQLite BLOB 분기) + repo 골격(project_id·ingest_runs·멱등) + seed concept 3개
- **D1 오후**: visible corpus 3세션 + hidden labels + 필수엣지 목록 + seed 사전 확장 → **커버리지 게이트(성공기준 0) 통과 확인**
- **D2 오전 ★최소버전**: ingest 쓰기(세그먼트·임베딩·**seed 매칭·mentions**) → VIEW로 `v_session_concept`·`/graph`·`/concept`가 뜬다. **LLM 없이 세션간 연결 그래프 데모 가능.**
- **D2 오후**: corpus 6~8세션 확장 + 격리 테스트 + 멱등 테스트(재-ingest weight 불변)
- **D3**: `CONTINUES/EXPANDS`를 **rule/fixture-seeded로** 붙여 데모 완성 + candidate_policy(k2·cap20·stoplist) + session_relations + 증분 추가 경로
- **D4**: 관계 품질 게이트(precision+필수엣지 recall) + `/search` graph_adjacency BFS≤2 + 캐시 키 확장 검증
- **D5**: 프론트 그래프뷰 연동(D) + 드릴다운 span + **(옵션) LLM 개념 보완·LLM 관계 판정**을 rule 위에(실패해도 데모는 D3 상태로 성립)
- **D6**: E2E·증분 추가 시연·발표 큐레이션 · **D7**: 버퍼

## 12. Premortem + kill 조건
1. "Graph RAG" 범위 팽창 → 데모 질문/정답셋 D1 없으면 cross-session concept retrieval로 축소.
2. 개념 분열 → 중복률 20%↑면 seed-only 후퇴(감지=신규개념/병합 로그).
3. CONTINUES/EXPANDS 오염 → precision<0.8 또는 필수엣지 recall<0.8이면 렌더 중단(seed-only 그래프로).
4. 캐시 오해 → 캐시는 ingest 재실행·증분 비용만 절감(쿼리는 조회 구조). 확장 키(§6)로 프롬프트/사전 변경 시 무효화.
5. 증분이 전역 재계산 유발 → candidate_policy 상한(k=2·cap20·stoplist), 못 지키면 CONTINUES 계층 제거.
6. 멱등 깨짐(재-ingest weight 누적) → ingest_runs derived-row 삭제-후-재생성 + 멱등 자동 테스트.
7. multi-hop 쿼리 폭발/사이클 → graph_adjacency 뷰 + BFS depth≤2 + visited set.
8. project_id 누출 → repo 단일 경유 + 자동 테스트.
9. 발표 "Graph DB" 반박 → 문구 "property-graph over Postgres"로 정정(§5).
10. 합성 eval leakage → visible/hidden 파일 분리 + LLM 입력 라벨 부재 테스트 + recall 병행.
11. aggregate weight 누적/과삭제(Round2 #1) → backbone·공기 엣지를 저장 안 하고 VIEW로 → 구조적으로 불가능.
12. SQLite에 vector 타입 없음(Round2 #6) → embedding BLOB/JSON 저장, 검색은 Python cosine(D4); Postgres는 vector(dim) 분기.
13. D1 과밀로 최소버전이 D3로 밀림(Round2 #8) → D1 오전/오후 기계적 분할, 커버리지 게이트로 D1 종료 판정.

## 13. 열린 질문
- 임베딩 모델·비용 소유(B vs C), 배포 스토어(로컬 데모=SQLite 충분 vs Postgres) — Postgres면 발표 "graph over Postgres" 주장도 강해짐
- rule/fixture-seeded CONTINUES 판정 규칙의 구체 형태(개념 공유 + seq 인접 + 근거 유사도 임계?) — D3 착수 시 확정
