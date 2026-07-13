# SynapVox 발표자료 (2조)

### slide1
PM  ·  도원
SynapVox
Vector DB + Graph DB 기반 녹음본 어시스턴트
SynapVox
1

### slide2
문제 정의
녹음본은 매일 쌓이지만, 녹음본 간의 관계는 알 수 없다.
1
구어체 전사의 한계
흐려진 발음·맥락에 안 맞는 단어가 그대로 기록돼 가독성이 떨어진다
2
참고 자료와의 단절
슬라이드·문서를 참고하지 않고 음성만 전사해 고유명사·전문용어가 왜곡된다
3
단편화된 기록
프로젝트 안에서 쌓인 여러 녹음본이 서로 연결되지 않아 맥락을 놓친다
핵심 문제
사용자는 하나의 프로젝트 안에서 쌓인
여러 회의를 하나의 질문으로 관통해서
탐색할 수단이 없다.
근거 (경쟁사 분석)
다글로·NotebookLM·클로바노트 모두 세션(녹음본/노트) 내부는 강력하지만, 세션을 가로지르는 연결은 지원하지 않는다.
SynapVox
2

### slide3
세 서비스 모두 같은 구조적 공백을 갖는다
세션(녹음본/노트/노트북) 내부는 강력하지만, 세션을 가로지르는 연결이 없다
다글로
기본 단위
녹음본 = 보드
단위 내 기능
채팅/코딩/퀴즈 등 다양
세션 간 연결
✗ 불가
NotebookLM
기본 단위
노트북 (소스 ≤50개)
단위 내 기능
채팅 + 오디오오버뷰 + 마인드맵
세션 간 연결
✗ 불가
클로바노트
기본 단위
녹음본 = 노트
단위 내 기능
요약 + 키워드 + 액션아이템
세션 간 연결
✗ 불가
SynapVox
기본 단위
프로젝트
단위 내 기능
STT RAG 정제 + Graph RAG 연결
세션 간 연결
✓ Graph RAG (Multi-hop)
SynapVox
3

### slide4
MVP 전략
STT 2단계 RAG → 청킹 → Vector+Graph DB → Graph RAG, 모든 데이터는 프로젝트 단위로 스코프
①
STT 1단계
회의자료 RAG로
키워드 추출 →
Whisper prompt 주입
→
②
STT 2단계
전사문+자료+과거
회의록 RAG로
전사 정리
→
③
청킹
자료+정제 전사문을
의미 단위로
분할
→
④
Vector+Graph DB
임베딩 저장 +
Entity/Relationship
추출·적재
→
⑤
Graph RAG
유사도 검색 +
LLM 답변,
관계 시각화
모든 청크·노드·엣지에 project_id 부여 → 같은 프로젝트 회의만 검색·그래프로 연결 (프로젝트 간 격리)
SynapVox
4

### slide5
4인 역할 분담
계약(contract) = 3개 스키마 — 중간 포맷 JSON · LLM 출력 JSON · Vector/Graph DB 스키마
A
현우
데이터 파이프라인 / 전처리
STT 연동, 자료 텍스트 추출,
중간 포맷 JSON
B
도윤
LLM / 프롬프트 & 품질
출력 스키마, 프롬프트,
검증·평가셋
C
용하
백엔드 / DB & 검색
Vector+Graph DB,
project_id 스코프 검색
D
도원
통합 / 제품 (PM 겸)
E2E 통합, 수용기준,
UI·일정 관리
SynapVox
5

### slide6
로드맵
프로젝트 기간 7/13(월) – 7/18(일)
7/13
Step 0 · STT 키워드 RAG 검증
월 · 최우선
키워드 RAG 적용 전/후 STT 정확도 비교, 3개 스키마 확정
7/14
Step 1 · STT 2단계 파이프라인
화
키워드 RAG+Whisper 연동, 전사 정리 RAG 체인 구현
7/15–16
Step 2 · 청킹 + Vector/Graph DB 적재
수-목
청킹, 임베딩 저장, Entity/Relationship 추출·적재
7/17–18
Step 3 · Graph RAG + 관계 시각화
금-토
유사도 검색→LLM 답변, 회의 간 관계 그래프 뷰
7/19
Step 4 · 통합 점검
일
E2E 리허설, 발표 준비
SynapVox
6