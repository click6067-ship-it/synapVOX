# SynapVox 프론트엔드 재구축 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** standalone SynapVox 프론트를 다글로형 다크 테크 멀티프로젝트 제품(React+Vite)으로 재구축하고, 백엔드(gsvx)에 멀티프로젝트 API를 추가한다.

**Architecture:** Render의 Graphiti 백엔드(gsvx)를 `project`(group_id) 파라미터로 일반화하고 `/projects`를 추가한다. 새 React+Vite SPA(`web/`)가 그 API를 호출해 홈(입력창+타일+최근카드)·워크스페이스(소스+라이브 포스 그래프+RAG 채팅)를 렌더한다. 프론트는 Vercel, 백엔드는 Render.

**Tech Stack:** Python 3.12 / FastAPI / graphiti-core (백엔드). React 19 + TypeScript + Vite 8 (프론트). 라우팅=react-router-dom. 그래프=자체 imperative rAF 포스 시뮬레이션(라이브러리 없음). 배포=Vercel + Render.

## Global Constraints

- 백엔드 group_id(=project id)는 **영숫자·대시·언더스코어만**(Graphiti 제약). 프론트는 사용자 입력을 slug로 변환.
- API 인증: 헤더 `X-API-Key`(공개 데모 키 `demo-bio`). 모든 데이터 엔드포인트는 `project` 파라미터 필수(미지정 시 기본 `P-BIO`).
- 프론트 API 베이스: `import.meta.env.VITE_API_BASE ?? 'https://synapvox-graphiti.onrender.com'`.
- 디자인 anti-slop: Inter/Roboto·보라 그라데이션·gradient text·동일 radius 카드 남용 금지. 다크 테크. 시그니처=라이브 그래프. 완료 게이트 `node ~/.claude/tools/headless/sloplint.mjs <url>`.
- Render free-tier no-server 404 대응: API 클라이언트에 조용한 재시도(엣지 no-server/GET 네트워크 실패만).
- 기존 파일 스타일 준수. TDD(가능한 곳). 잦은 커밋. 브랜치 `feat/frontend-rebuild-daglo`.
- 백엔드 회귀 게이트: `.venv/bin/python -m pytest -q` (현재 48 통과 유지).

## File Structure

**백엔드(수정):**
- `gsvx/api.py` — 엔드포인트에 `project` 파라미터 + `/projects` 추가.
- `gsvx/engine.py` — `list_projects()` 추가(group_id별 세션/개념 카운트).
- `tests/test_gsvx_api.py` — 멀티프로젝트 회귀 테스트 추가.

**프론트(신규, `web/`):**
- `web/index.html`, `web/vite.config.ts`, `web/tsconfig.json`, `web/package.json`, `web/src/vite-env.d.ts`
- `web/src/main.tsx`, `web/src/App.tsx`(라우팅), `web/src/styles/tokens.css`(다크 디자인 토큰)
- `web/src/api/client.ts` — fetch+재시도, project 파라미터, 타입.
- `web/src/graph/forceSim.ts` — 순수 물리(테스트 가능).
- `web/src/graph/GraphCanvas.tsx` — SVG 렌더 + sim + 드래그/줌 + 필터.
- `web/src/nav/Drawer.tsx`
- `web/src/home/Home.tsx`, `web/src/home/CreateInput.tsx`, `web/src/home/ProjectGrid.tsx`, `web/src/home/ActionTiles.tsx`
- `web/src/workspace/Workspace.tsx`, `web/src/workspace/SourcesPanel.tsx`, `web/src/workspace/ChatPanel.tsx`
- `web/src/graph/forceSim.test.ts` (vitest)

---

## Phase A — 백엔드 멀티프로젝트

### Task A1: engine.list_projects() + /projects 엔드포인트

**Files:**
- Modify: `gsvx/engine.py` (GraphitiEngine에 메서드 추가)
- Modify: `gsvx/api.py` (`/projects` 라우트)
- Test: `tests/test_gsvx_api.py`

**Interfaces:**
- Produces: `GraphitiEngine.list_projects() -> list[dict]` — `[{"project": str, "sessions": int, "concepts": int}]`
- Produces: `GET /projects` → `{"projects": [...]}` (인증 필요, project 파라미터 불필요)

- [ ] **Step 1: 실패 테스트 작성** — `tests/test_gsvx_api.py`에 StubEngine에 `list_projects` 추가 + 라우트 테스트

```python
# StubEngine에 추가
async def list_projects(self):
    return [{"project": "P-BIO", "sessions": 2, "concepts": 5}]

def test_projects_endpoint():
    app = create_app(StubEngine(), CORPUS, KEY_MAP, ["*"], readonly=False)
    with TestClient(app) as c:
        r = c.get("/projects", headers={"X-API-Key": "demo-bio"})
    assert r.status_code == 200
    assert r.json()["projects"][0]["project"] == "P-BIO"
```

- [ ] **Step 2: 실패 확인** — `.venv/bin/python -m pytest tests/test_gsvx_api.py::test_projects_endpoint -q` → FAIL (`/projects` 404)

- [ ] **Step 3: 구현** — `gsvx/engine.py`에 실제 메서드 추가:

```python
async def list_projects(self):
    rows = await self._read(
        "MATCH (e:Episodic) WITH e.group_id AS project, count(e) AS sessions "
        "RETURN project, sessions ORDER BY project")
    out = []
    for r in rows:
        c = await self._read(
            "MATCH (n:Entity {group_id:$g}) RETURN count(n) AS c", g=r["project"])
        out.append({"project": r["project"], "sessions": r["sessions"],
                    "concepts": (c[0]["c"] if c else 0)})
    return out
```

`gsvx/api.py`에 라우트 추가(project_id 의존성 없이 인증만):

```python
@app.get("/projects")
async def projects(x_api_key: str | None = Header(None, alias="X-API-Key")):
    if not x_api_key or hashlib.sha256(x_api_key.encode()).hexdigest() not in key_map:
        raise HTTPException(401, "invalid API key")
    return {"projects": await engine.list_projects()}
```

- [ ] **Step 4: 통과 확인** — `.venv/bin/python -m pytest tests/test_gsvx_api.py -q` → PASS

- [ ] **Step 5: 커밋** — `git add gsvx/ tests/ && git commit -m "feat(gsvx): /projects 목록 엔드포인트"`

### Task A2: 엔드포인트 project 파라미터 일반화

**Files:**
- Modify: `gsvx/api.py` (graph/ask/search/ingest-text/corpus가 `project` 쿼리 파라미터 수용, 기본 P-BIO)
- Test: `tests/test_gsvx_api.py`

**Interfaces:**
- Consumes: 없음. Produces: `GET /graph?project=X`, `GET /ask?project=X&q=`, `POST /ingest-text {project, text, title}` 등이 group_id로 X 사용.

- [ ] **Step 1: 실패 테스트** — 다른 project로 호출 시 그 group_id가 엔진에 전달되는지(StubEngine이 받은 pid 기록):

```python
def test_graph_uses_project_param():
    eng = StubEngine()
    app = create_app(eng, CORPUS, KEY_MAP, ["*"], readonly=False)
    with TestClient(app) as c:
        c.get("/graph?project=P-DL", headers={"X-API-Key": "demo-bio"})
    assert eng.last_project == "P-DL"
```
(StubEngine.graph에 `self.last_project = project` 기록 추가)

- [ ] **Step 2: 실패 확인** — pytest → FAIL (현재 project 파라미터 무시)

- [ ] **Step 3: 구현** — `project_id` 의존성을 "키 인증 + `project` 쿼리 파라미터(기본 P-BIO)"로 변경:

```python
def project_id(project: str = "P-BIO",
               x_api_key: str | None = Header(None, alias="X-API-Key")) -> str:
    if not x_api_key or hashlib.sha256(x_api_key.encode()).hexdigest() not in key_map:
        raise HTTPException(401, "invalid API key")
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", project):
        raise HTTPException(400, "invalid project id")
    return project
```
(파일 상단 `import re`. ingest-text/reset는 body의 `project`도 허용하도록 소폭 조정.)

- [ ] **Step 4: 통과 확인** — `.venv/bin/python -m pytest -q` → 전체 PASS

- [ ] **Step 5: 커밋** — `git commit -am "feat(gsvx): 엔드포인트 project(group_id) 파라미터 일반화"`

---

## Phase B — 프론트 스캐폴드 + 디자인 토큰 + API 클라이언트

### Task B1: web/ Vite React 스캐폴드 + 다크 토큰

**Files:**
- Create: `web/package.json`, `web/vite.config.ts`, `web/tsconfig.json`, `web/tsconfig.node.json`, `web/index.html`, `web/src/main.tsx`, `web/src/App.tsx`, `web/src/vite-env.d.ts`, `web/src/styles/tokens.css`

**Interfaces:**
- Produces: 빌드되는 빈 SPA + `tokens.css`의 다크 디자인 변수(`--bg`,`--surface`,`--ink`,`--sub`,`--accent-conc`,`--accent-sess`,`--mono`).

- [ ] **Step 1: 스캐폴드** — `web/`에서 `npm create vite@latest . -- --template react-ts` 대신 최소 파일 직접 생성(deps: react 19, react-dom, react-router-dom / dev: vite 8, @vitejs/plugin-react, typescript). `npm install`.

- [ ] **Step 2: 다크 토큰 작성** — `web/src/styles/tokens.css`:

```css
:root{
  --bg:#0e0f13; --surface:#16181f; --surface-2:#1c1f28; --line:#272b36;
  --ink:#e8eaf0; --sub:#9aa0b0; --faint:#6b7180;
  --accent-conc:#3fb9a0;   /* 개념=청록 */
  --accent-sess:#7c8cf0;   /* 세션=인디고 */
  --edge:#3a4050; --danger:#e0674a;
  --mono:'JetBrains Mono','SF Mono',ui-monospace,monospace;
  --sans:'Pretendard',system-ui,'Apple SD Gothic Neo',sans-serif;
  --radius:14px; --shadow:0 8px 30px rgba(0,0,0,.4);
}
*{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--sans)}
```
(anti-slop: Inter/보라 금지, 모노스페이스 시그니처. 폰트는 self-host 또는 시스템 폴백.)

- [ ] **Step 3: 빌드 확인** — `cd web && npm run build` → dist 생성, 에러 0.

- [ ] **Step 4: 커밋** — `git add web/ && git commit -m "feat(web): Vite React 스캐폴드 + 다크 디자인 토큰"`

### Task B2: API 클라이언트(재시도 + project)

**Files:**
- Create: `web/src/api/client.ts`, `web/src/api/types.ts`

**Interfaces:**
- Produces:
  - `type Project = { project: string; sessions: number; concepts: number }`
  - `type GraphData = { nodes: RawNode[]; edges: RawEdge[] }` (RawNode/RawEdge는 백엔드 /graph 형식)
  - `listProjects(): Promise<Project[]>`
  - `getGraph(project: string): Promise<GraphData>`
  - `ask(project: string, q: string): Promise<{ answer: string }>`
  - `ingestText(project: string, title: string, text: string): Promise<unknown>`

- [ ] **Step 1: 타입 + 클라이언트 작성** — `web/src/api/client.ts`:

```ts
const BASE = (import.meta.env.VITE_API_BASE ?? 'https://synapvox-graphiti.onrender.com').replace(/\/$/, '');
const KEY = import.meta.env.VITE_API_KEY ?? 'demo-bio';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function req(path: string, opts: RequestInit = {}, method = 'GET'): Promise<Response> {
  const backoff = [400, 1000, 2000];
  for (let a = 0; ; a++) {
    if (a > 0) await sleep(backoff[a - 1]);
    let r: Response;
    try { r = await fetch(`${BASE}${path}`, { ...opts, method, headers: { 'X-API-Key': KEY, ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...opts.headers } }); }
    catch (e) { if (method === 'GET' && a < backoff.length) continue; throw e; }
    const edgeDown = r.status === 404 && r.headers.get('x-render-routing') === 'no-server';
    if ((edgeDown || (method === 'GET' && r.status >= 502)) && a < backoff.length) continue;
    return r;
  }
}
export async function listProjects(){ return (await (await req('/projects')).json()).projects; }
export async function getGraph(project: string){ return (await req(`/graph?project=${encodeURIComponent(project)}`)).json(); }
export async function ask(project: string, q: string){ return (await req(`/ask?project=${encodeURIComponent(project)}&q=${encodeURIComponent(q)}&k=6`)).json(); }
export async function ingestText(project: string, title: string, text: string){
  return (await req('/ingest-text', { body: JSON.stringify({ project, title, text }) }, 'POST')).json();
}
```

- [ ] **Step 2: 빌드 확인** — `cd web && npm run build` → PASS
- [ ] **Step 3: 커밋** — `git commit -am "feat(web): API 클라이언트(재시도+project)"`

---

## Phase C — 라이브 포스 그래프

### Task C1: forceSim.ts (순수 물리, 단위 테스트)

**Files:**
- Create: `web/src/graph/forceSim.ts`, `web/src/graph/forceSim.test.ts`
- Modify: `web/package.json` (devDep: vitest), 스크립트 `"test":"vitest run"`

**Interfaces:**
- Produces:
  - `type SimNode = { id: string; type: 'session'|'concept'; x: number; y: number; vx: number; vy: number; px: number|null; py: number|null }`
  - `type SimLink = { a: number; b: number }`
  - `initSim(nodes, links): {nodes:SimNode[]; idx:Record<string,number>; links:SimLink[]; alpha:number}`
  - `stepSim(sim, W, H): void` — 한 프레임 물리(반발+스프링+중력, alpha 감쇠). 위치를 sim.nodes에 갱신.

- [ ] **Step 1: 실패 테스트** — 겹친 두 노드가 한 스텝 후 벌어지는지:

```ts
import { describe, it, expect } from 'vitest';
import { initSim, stepSim } from './forceSim';
it('반발로 겹친 노드가 벌어진다', () => {
  const sim = initSim([{id:'a',type:'concept',x:100,y:100,vx:0,vy:0,px:null,py:null},
                       {id:'b',type:'concept',x:101,y:100,vx:0,vy:0,px:null,py:null}], []);
  const d0 = Math.hypot(sim.nodes[0].x-sim.nodes[1].x, sim.nodes[0].y-sim.nodes[1].y);
  for (let i=0;i<10;i++) stepSim(sim, 960, 560);
  const d1 = Math.hypot(sim.nodes[0].x-sim.nodes[1].x, sim.nodes[0].y-sim.nodes[1].y);
  expect(d1).toBeGreaterThan(d0);
});
```

- [ ] **Step 2: 실패 확인** — `cd web && npx vitest run` → FAIL (모듈 없음)

- [ ] **Step 3: 구현** — `web/src/graph/forceSim.ts` (팀 프론트 App.tsx의 simStep 로직을 순수 함수로 이관: 중심중력 0.010, 근접반발 620/d²(d²<24000), 스프링 REST74·K0.035, 감쇠0.86, alpha*=0.985, px!=null이면 고정). clamp 포함.

- [ ] **Step 4: 통과 확인** — `npx vitest run` → PASS
- [ ] **Step 5: 커밋** — `git commit -am "feat(web): forceSim 순수 물리 + vitest"`

### Task C2: GraphCanvas.tsx (SVG + sim 구동 + 드래그/줌/필터)

**Files:**
- Create: `web/src/graph/GraphCanvas.tsx`, `web/src/graph/mapGraph.ts`
- Test: playwright(수동 Task G1에서)

**Interfaces:**
- Consumes: `initSim/stepSim`(C1), `getGraph`(B2). Props: `{ project: string; onSelect?(id:string):void; filter: FilterState }`
- Produces: `mapGraph(raw): {nodes; links}` (백엔드 형식→GraphNode: id,type,label,r,seq + rel 라벨). 컴포넌트가 rAF로 sim 구동, node <g>/edge <line>를 ref로 직접 갱신.

- [ ] **Step 1: 구현** — `mapGraph.ts`(백엔드 /graph → 노드/링크, degree로 r, 다리개념 판정). `GraphCanvas.tsx`(refs: svgRef·nodeElRef·edgeElRef, useEffect에서 getGraph→initSim→rAF stepSim+DOM갱신, onPointerDown/Move/Up 드래그=pointerToGraph 좌표변환·px핀·alpha재점화, 필터로 visible 토글, 다크 스타일: 노드 발광 stroke, 다리개념만 라벨).

- [ ] **Step 2: 빌드 확인** — `npm run build` → PASS
- [ ] **Step 3: 커밋** — `git commit -am "feat(web): GraphCanvas 라이브 포스 그래프"`

---

## Phase D — 셸 + 드로워 + 라우팅

### Task D1: App 셸 + 좌측 드로워 + 라우팅

**Files:**
- Modify: `web/src/App.tsx` (BrowserRouter: `/`=Home, `/p/:projectId`=Workspace), `web/src/main.tsx`
- Create: `web/src/nav/Drawer.tsx`, `web/src/styles/app.css`

**Interfaces:**
- Consumes: Home(E), Workspace(F). Produces: 라우트 구조 + 항상 표시되는 좌측 드로워(로고·새 그래프(→/)·내 프로젝트·프로필, 접기 토글, 모바일 오프캔버스).

- [ ] **Step 1: 구현** — Drawer(다크, 아이콘+라벨) + App 라우팅. 플레이스홀더 Home/Workspace로 라우트 연결 확인.
- [ ] **Step 2: 빌드 + 스모크** — `npm run build`; `npm run preview` + playwright로 `/`와 `/p/x` 라우트 렌더 확인.
- [ ] **Step 3: 커밋** — `git commit -am "feat(web): 앱 셸 + 좌측 드로워 + 라우팅"`

---

## Phase E — 홈 (다글로형)

### Task E1: Home = 헤드라인 + 입력창 + 타일 + 최근 프로젝트

**Files:**
- Create: `web/src/home/Home.tsx`, `web/src/home/CreateInput.tsx`, `web/src/home/ActionTiles.tsx`, `web/src/home/ProjectGrid.tsx`, `web/src/home/home.css`

**Interfaces:**
- Consumes: `listProjects`, `ingestText`(B2), react-router `useNavigate`.
- Produces: 홈 화면. CreateInput 제출 → slug 생성 → `ingestText(slug,title,text)` → `/p/:slug`로 이동. ProjectGrid=listProjects 카드(클릭→워크스페이스). ActionTiles=딥러닝 샘플 불러오기/그래프 보기 등.

- [ ] **Step 1: 구현** — 헤드라인(중앙, 다크·serif아님·시그니처 타이포) + CreateInput(큰 textarea + 제목 + 전송, 로딩중 표시) + ActionTiles(4개) + ProjectGrid(카드: 제목·세션수·개념수). slug = 제목→`[A-Za-z0-9_-]` 변환+타임스탬프.
- [ ] **Step 2: 빌드 + preview 스모크** — 홈 렌더, 최근 프로젝트 카드에 실제 `/projects` 데이터, 콘솔에러 0(playwright).
- [ ] **Step 3: 커밋** — `git commit -am "feat(web): 홈(입력창+타일+최근 프로젝트)"`

---

## Phase F — 워크스페이스

### Task F1: SourcesPanel (실제 세션)

**Files:** Create `web/src/workspace/SourcesPanel.tsx`
**Interfaces:** Consumes: 워크스페이스가 전달하는 sessions(GraphCanvas가 로드한 그래프의 session 노드). Produces: 강의 목록 카드, 클릭 → `onSelectSource(id)`.
- [ ] Step 1: 구현(다크 리스트, 제목·개념수). Step 2: 빌드. Step 3: 커밋 `feat(web): SourcesPanel`.

### Task F2: ChatPanel (RAG /ask)

**Files:** Create `web/src/workspace/ChatPanel.tsx`
**Interfaces:** Consumes `ask`(B2). Produces: 메시지 로그 + 입력 → `ask(project,q)` → 답변(근거 인용 텍스트) 표시, 로딩 '…'.
- [ ] Step 1: 구현(비동기 제출, 실패 메시지 폴백). Step 2: 빌드. Step 3: 커밋 `feat(web): ChatPanel RAG`.

### Task F3: Workspace 통합 (3컬럼)

**Files:** Create `web/src/workspace/Workspace.tsx`, `web/src/workspace/workspace.css`
**Interfaces:** Consumes: `useParams().projectId`, GraphCanvas(C2), SourcesPanel(F1), ChatPanel(F2). Produces: 3컬럼 다크 레이아웃 + 필터 바(개념근거/동시출현/다음세션/연속확장/핵심개념만) + "텍스트로 추가"(현재 프로젝트에 ingestText) + 노드 상세.
- [ ] Step 1: 구현(FilterState 상태, GraphCanvas에 project+filter 전달, 노드선택→소스/상세 연동). Step 2: 빌드. Step 3: 커밋 `feat(web): 워크스페이스 3컬럼 통합`.

---

## Phase G — 통합·검증·배포

### Task G1: E2E 검증 + 배포

**Files:** Modify `web/vercel.json`(있으면), `render.yaml`(SVX_READONLY=0 확인)
**Interfaces:** 전체 플로우.
- [ ] **Step 1: 백엔드 재배포** — Phase A 변경을 main에 반영(또는 브랜치→배포). Render 재배포, `/projects`·`/graph?project=` 확인(curl).
- [ ] **Step 2: 프론트 playwright E2E** — preview에서: 홈 로드→최근 프로젝트→워크스페이스 그래프 애니메이션(위치 시간차 변화)·드래그·필터·RAG 답변, 콘솔에러 0. 홈 입력→새 프로젝트 생성→이동 확인(쓰기 모드).
- [ ] **Step 3: sloplint + vcheck** — `node ~/.claude/tools/headless/sloplint.mjs <preview-url>` 신호 판정 + `/vcheck`. 기본값 수렴 신호면 디자인 조정.
- [ ] **Step 4: Vercel 배포** — `cd web && vercel deploy --prod --yes`. 라이브 URL playwright 재확인.
- [ ] **Step 5: 커밋 + PR** — `git commit`; feat 브랜치 push; (standalone은 개인 repo라) main 머지 또는 PR.

---

## Self-Review

**Spec coverage:** 드로워(D1)·홈 입력/타일/최근(E1)·워크스페이스 소스/그래프/채팅(F1-3)·멀티프로젝트(A1-2,E1)·라이브 애니 그래프(C1-2)·다크 디자인(B1,G1)·백엔드 project(A)·배포(G1) — 스펙 각 항목에 태스크 매핑됨. STT/회의스키마/인증은 Out(스펙과 일치).
**Placeholder scan:** 핵심 로직(A1-2,B2,C1)은 완전 코드. UI(C2,E1,F*)는 파일·인터페이스·검증 명시 + 재사용 근거(팀 프론트 simStep·mapGraph). 실행자는 subagent-driven에서 태스크별로 상세화.
**Type consistency:** `project:string`·`GraphData`·`SimNode`·`initSim/stepSim`·`mapGraph`·`ingestText(project,title,text)` 태스크 간 일관.
