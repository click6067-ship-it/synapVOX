# SynapVox IA "Archive Dashboard + Graph Mode" Implementation Plan (P0)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Turn SynapVox from a graph-first app into a structured knowledge **dashboard** (default home) where the force graph is a **mode** reached from a sidebar button; present Project → 단원(session) → 개념 as an outline; make the first entry immediately intuitive.

**Architecture:** A persistent left Sidebar + routed main area. `/` and `/p/:project` render the **Dashboard** (Top Workbench + Project Shelf + Outline + Question Dock); `/graph` renders the existing **GraphView** as a mode (scope=project|all via search params). Backend is frozen; the outline is derived from `/graph` (session nodes + the concepts they mention). Reuses GraphView, api client, mapGraph, useAsk, useDetail, tokens.

**Tech Stack:** React 19, Vite, react-router-dom v7, react-force-graph-2d, Vitest.

## Global Constraints

- Backend **frozen**: `GET /projects`, `GET /graph?project`, `POST /ingest-text`, `GET /ask?project&q`, `GET /concept/{id}?project`, `GET /session/{id}?project`.
- **단원 = 세션** (decided). UI copy pairs them: `1단원 · CNN`. No separate backend unit level.
- **교차연결** = normalized-label exact match (decided) — P1 only, NOT in P0.
- **Default entry = Dashboard**, NOT the graph. Graph is a mode at `/graph`.
- **Archive aesthetic (unchanged):** tokens `--paper #F4F0E7 / --ink #181713 / --canvas #07120F / --node-core #D8FF6A / --session-red #C84E3A / --rule-blue #2F6F86 / --sub / --rule`; fonts Fraunces (display) / Atkinson Hyperlegible (UI) / JetBrains Mono (mono/stats); radius only `0/4/8`; `--bind` 2px ink line.
- **Project display names** via `projectLabel(id)`: P-BIO→딥러닝, P-LIFE→생명과학, P-ML→머신러닝 (fallback = id). Must be used in sidebar, dashboard, graph.
- **Reuse, don't rebuild** the graph: `GraphView` (props `{project, alsoShow?, reloadKey?, onSelectNode?, onGraphMeta?, onSessions?, highlightId?, askExpansionIds?}`, handle `{growWith?}`), hierarchy colors, galaxy/mainRepel, elastic physics — all preserved.
- Samples already seeded: P-BIO(7 sessions), P-LIFE(2), P-ML(3).
- TDD for pure logic (outline builder, project meta). Visual components verified by build + headless screenshot/E2E. Frequent commits. Branch `feat/ia-dashboard`.

---

## File Structure

```
web/src/
  graph/
    projectMeta.ts        NEW  projectLabel + PROJECT_LABELS (moved out of GraphView) — shared
    GraphView.tsx         MODIFY (import projectLabel from projectMeta; no behavior change)
    buildOutline.ts       NEW  graph {nodes,links} → outline (session → its concepts), pure/tested
    outline.types.ts      NEW  Outline types (or inline in buildOutline)
  data/
    useProjects.ts        NEW  listProjects() hook (shared by dashboard + sidebar)
    useOutline.ts         NEW  getGraph(project) → buildOutline, with loading/error
  layout/
    AppLayout.tsx         NEW  Sidebar + <Outlet/> (persistent sidebar, routed main)
    AppShell.tsx          KEEP (used by graph mode's 3-column)
  sidebar/
    Sidebar.tsx           MODIFY  new nav: Primary actions + Projects + graph button + Archive
    sidebar.css           MODIFY
  dashboard/
    Dashboard.tsx         NEW  page: TopWorkbench + ProjectShelf + OutlineView + QuestionDock
    TopWorkbench.tsx      NEW  title + 강의추가 CTA + 질문하기
    ProjectShelf.tsx      NEW  project cards (label, stats, recent sessions, 열기/그래프)
    OutlineView.tsx       NEW  accordion project→단원(session)→개념
    QuestionDock.tsx      NEW  ask + answer (reuses useAsk / AnswerDrawer)
    EmptyOnboarding.tsx   NEW  first-entry CTA + 3 steps + 샘플로 보기
    dashboard.css         NEW
  pages/
    GraphModePage.tsx     NEW  graph mode at /graph (scope from search params; ~ old GraphPage guts)
    GraphPage.tsx         DELETE after migration (logic moves to GraphModePage)
  App.tsx                 MODIFY  routes (see Task 8)
  upload/ ask/ detail/    KEEP (reused by dashboard + graph mode)
```

---

## Task 1: `projectMeta.ts` — shared project labels

**Files:** Create `web/src/graph/projectMeta.ts`; Modify `web/src/graph/GraphView.tsx` (import from it). Test: `projectMeta.test.ts`.

**Interfaces — Produces:** `export function projectLabel(project: string): string`.

- [ ] **Step 1 (TDD):** Test: `projectLabel('P-BIO')==='딥러닝'`, `projectLabel('P-ML')==='머신러닝'`, `projectLabel('graph-x')==='graph-x'` (fallback).
- [ ] **Step 2:** Move `PROJECT_LABELS` + `projectLabel` out of GraphView into `projectMeta.ts` (export). In GraphView, replace the local defs with `import { projectLabel } from './projectMeta'` (delete the local copy).
- [ ] **Step 3:** `npm test` pass + `npm run build` clean. Commit: `refactor(web): shared projectMeta.projectLabel`

---

## Task 2: `buildOutline` — graph → project outline (TDD)

**Files:** Create `web/src/graph/buildOutline.ts` + `buildOutline.test.ts`. Consumes `mapGraph` output (or raw GraphData).

**Interfaces:**
```ts
export type OutlineConcept = { id: string; label: string; bridge: boolean }
export type OutlineUnit = { id: string; seq: number; label: string; concepts: OutlineConcept[] }
export function buildOutline(mapped: { nodes: GraphNode[]; links: GraphLink[] }): OutlineUnit[]
// Units = session nodes sorted by seq. Each unit's concepts = concept nodes it MENTIONS
// (SESSION_MENTIONS_CONCEPT / relClass 'mentions' link where one end is this session).
```

- [ ] **Step 1:** Failing test — given a session s1(seq1) mentioning concepts c1,c2 and s2(seq2) mentioning c2,c3 → `buildOutline` returns `[{seq:1,label:s1,concepts:[c1,c2]},{seq:2,...c2,c3}]`, concepts carry `bridge`.
- [ ] **Step 2:** `npm test` FAIL → implement (index concepts by id; for each session, collect mentioned concept ids from 'mentions' links where the session is an endpoint; sort sessions by seq) → PASS.
- [ ] **Step 3:** Commit: `feat(web): buildOutline (project→단원→개념)`

---

## Task 3: `useProjects` + `useOutline` data hooks

**Files:** Create `web/src/data/useProjects.ts`, `web/src/data/useOutline.ts`.

**Interfaces:**
```ts
// useProjects.ts
export function useProjects(): { projects: Project[]; loading: boolean; error: string | null; reload(): void }
// useOutline.ts
export function useOutline(project: string): { units: OutlineUnit[]; loading: boolean; error: string | null;
  stats: { sessions: number; concepts: number } }
```
- `useProjects`: `listProjects()` on mount + `reload()`.
- `useOutline`: `getGraph(project)` → `mapGraph` → `buildOutline`; stats from node counts. Cold-start tolerant (loading state). Guard empty project (return empty).

- [ ] **Step 1:** Implement both (follow the existing fetch/loading/error pattern from GraphView). No new backend calls beyond the frozen endpoints.
- [ ] **Step 2:** `npm run build` clean (hooks type-check). Commit: `feat(web): useProjects + useOutline hooks`

---

## Task 4: Sidebar overhaul

**Files:** Modify `web/src/sidebar/Sidebar.tsx`, `sidebar.css`. Uses `projectLabel`.

**Interfaces — Produces:**
```ts
Sidebar(props: {
  projects: Project[]
  activeProject: string | null           // highlighted project (route)
  view: 'dashboard' | 'graph'            // which mode is active
  collapsed: boolean
  onToggleCollapse(): void
  onNavDashboard(): void                  // → /
  onOpenUpload(): void                    // → upload drawer
  onFocusQuestion(): void                 // → dashboard question dock / focus
  onOpenGraph(scope: 'project' | 'all'): void  // → /graph?scope=…
  onSelectProject(p: string): void        // → /p/:p (dashboard)
}): JSX.Element
```
Structure (top→bottom): `SynapVox Archive` wordmark · **Primary**: `＋ 강의 추가`, `대시보드`, `질문하기`, `그래프 시각화`(active-aware) · **Projects**: each `projectLabel(p)` (+ sessions/concepts mono) selectable + `모든 과목`(→ onOpenGraph('all')) · foot: stats. Archive aesthetic, radius 0/4, no rounded cards. Collapse 280↔64 (icons only).

- [ ] **Step 1:** Rebuild Sidebar with the new prop API + structure. `그래프 시각화` shows a small scope hint; clicking defaults to `onOpenGraph('project')` (or 'all' when no active project). `active` styling marks the current view/project.
- [ ] **Step 2:** `npx tsc --noEmit` clean for Sidebar. Screenshot check later. Commit: `feat(web): sidebar — dashboard-first nav + graph button`

---

## Task 5: Dashboard components (Top Workbench, Project Shelf, Outline, Question Dock)

**Files:** Create `web/src/dashboard/{Dashboard,TopWorkbench,ProjectShelf,OutlineView,QuestionDock}.tsx` + `dashboard.css`. Uses `useProjects`, `useOutline`, `projectLabel`, `useAsk`, `AnswerDrawer`.

**Interfaces — Produces:** `export default function Dashboard(): JSX.Element` (reads `useParams().project` — undefined = all-projects overview; a value = focused project).

- [ ] **Step 1: TopWorkbench** — `props{ onAddLecture(); onAsk(q); busy }`. Title `오늘 정리할 강의` (Fraunces), big `강의 추가` CTA, secondary `질문하기` (focuses the question input). Archive look.
- [ ] **Step 2: ProjectShelf** — `props{ projects; onOpen(p); onGraph(p) }`. Cards: `projectLabel` + `세션 N · 개념 M` (mono) + up to 2 recent session titles + `열기`(→/p/:p) + `그래프 보기`(→/graph?scope=project&project=p). Flat paper cards, radius 4.
- [ ] **Step 3: OutlineView** — `props{ project; units: OutlineUnit[]; onSelectConcept(id); onSelectSession(id) }`. Accordion: each unit row `${seq}단원 · ${label}` (mono seq + title), expand → its concepts as chips (bridge = lime, else teal — mirror graph tiers). Clicking a concept/session opens detail (reuse useDetail/DetailDrawer or a right panel).
- [ ] **Step 4: QuestionDock** — reuse `useAsk(project, ()=>{})` + `AnswerDrawer` (or inline answer). `이 프로젝트에 질문하기` input; on answer, show cited sessions; `그래프에서 근거 보기` → `/graph?scope=project&project=…` (deep-link; P1 wires the actual highlight).
- [ ] **Step 5: Dashboard** — compose: if `project` param → focused (TopWorkbench + that project's OutlineView + QuestionDock); else → overview (TopWorkbench + ProjectShelf + a compact multi-project outline). Loading/empty states.
- [ ] **Step 6:** `npm run build` clean. Commit: `feat(web): dashboard (workbench + shelf + outline + question dock)`

---

## Task 6: Empty-state onboarding

**Files:** Create `web/src/dashboard/EmptyOnboarding.tsx`; used by Dashboard when `projects.length===0`.

**Interfaces:** `EmptyOnboarding(props{ onAddLecture(); onOpenSample(project: string); samples: Project[] })`.

- [ ] **Step 1:** Center single CTA `첫 강의 추가` (→ upload) + 3 steps (`1. 강의 텍스트 붙여넣기` `2. 단원·개념 자동 정리` `3. 질문하거나 그래프로 보기`) + `샘플로 보기: 딥러닝 · 생명과학 · 머신러닝` (→ /p/:sample). Since samples exist, this shows when a *new* project has no data too. Archive aesthetic, generous whitespace, clearly the primary action.
- [ ] **Step 2:** Build + screenshot. Commit: `feat(web): first-entry onboarding empty state`

---

## Task 7: GraphMode page (graph as a mode at `/graph`)

**Files:** Create `web/src/pages/GraphModePage.tsx` (migrate the graph guts from the current `GraphPage.tsx`); keep upload/ask/detail drawer wiring. Reads scope + project from `useSearchParams`.

**Interfaces:** route `/graph?scope=project&project=P-BIO` (single) or `/graph?scope=all` (galaxy). `scope=cross` accepted but P1 (P0: fall back to `all` + a "곧" note).

- [ ] **Step 1:** Move GraphPage's AppShell(sidebar-in-graph-context, GraphView canvas, detail/answer drawer) + upload/ask/detail hooks into GraphModePage. `scope=project` → `<GraphView project={param}/>`; `scope=all` → GraphView with `alsoShow={otherProjects}` (galaxy). A back/`대시보드` affordance in the sidebar returns to `/`.
- [ ] **Step 2:** `npm run build` clean; the graph still renders/settles (elastic physics untouched). Commit: `feat(web): graph mode page (/graph?scope=…)`

---

## Task 8: App routing + AppLayout + delete old GraphPage

**Files:** Create `web/src/layout/AppLayout.tsx`; Modify `web/src/App.tsx`; delete `web/src/pages/GraphPage.tsx` (superseded).

- [ ] **Step 1: AppLayout** — renders `<Sidebar …/>` + `<Outlet/>` (persistent sidebar; main = routed page). Owns nav callbacks (useNavigate): dashboard `/`, upload (a shared upload drawer state), graph `/graph?scope=…`, select project `/p/:p`. Holds the shared UploadDrawer (so 강의 추가 works from any view) with `onIngested` refreshing projects.
- [ ] **Step 2: App.tsx routes:**
  ```tsx
  <Routes>
    <Route element={<AppLayout/>}>
      <Route path="/" element={<Dashboard/>} />
      <Route path="/p/:project" element={<Dashboard/>} />
      <Route path="/graph" element={<GraphModePage/>} />
    </Route>
  </Routes>
  ```
- [ ] **Step 3:** Delete `GraphPage.tsx`; confirm no dangling imports; `npm run build` clean; `npm test` pass. Commit: `feat(web): AppLayout + routes (dashboard default, /graph mode)`

---

## Task 9: Wire-up, states, E2E, deploy

- [ ] **Step 1:** Verify nav flows: `/` shows dashboard (project shelf w/ 딥러닝·생명과학·머신러닝); click a project → `/p/:p` outline (단원→개념); sidebar `그래프 시각화` → `/graph?scope=project`; `모든 과목` → `/graph?scope=all` (galaxy). 강의 추가 works from dashboard.
- [ ] **Step 2:** States: dashboard loading/cold-start/error/empty (onboarding); graph mode unchanged.
- [ ] **Step 3:** `npm run build` clean, `npm test` all pass, tsc no unused.
- [ ] **Step 4:** Deploy (vercel --prod) → full live E2E: dashboard is the default (not graph), project→단원(세션)→개념 outline renders, graph button reaches the graph (elastic 276px preserved), samples visible, 0 console errors, no horizontal overflow (320/768/1500), sloplint clean.
- [ ] **Step 5:** Commit + finishing-a-development-branch (merge to main).

**Deliverable:** Dashboard-first IA; graph is a mode via the sidebar; clear first-entry; hierarchy visible; graph strengths preserved.

---

## Parallelization (subagent-driven)
- **Serial foundation:** Task 1 → 2 → 3 (projectMeta, buildOutline, hooks — logic layer).
- **Parallel batch (disjoint):** Task 4 (sidebar), Task 5 (dashboard/*), Task 7 (GraphModePage) — dispatch together after the hooks exist. Task 6 (onboarding) with 5.
- **Serial finish:** Task 8 (routing/layout, integrates) → Task 9 (E2E/deploy).

## P1 (separate plan later) — 교차연결
`/graph?scope=cross`: normalize concept labels (lowercase, strip spaces/punctuation/Korean particles), exact-match across projects → synthetic cross nodes (small ivory ring + blue halo) + `rule-blue` dashed cross edges; inspector tag `프론트 추정 연결`; stopword list. Validated: 딥러닝∩머신러닝 = 11 shared, 딥러닝∩생명과학 = 0.

## Self-Review
- **Spec coverage:** §2 sitemap → T8; §3/§4 dashboard → T5; §4 onboarding → T6; §5 sidebar → T4; §6 graph mode → T7; §8 samples → seeded + projectLabel T1; 단원=세션 → buildOutline T2. §6 cross-connect = P1 (deferred, noted). All P0 spec items covered.
- **Placeholder scan:** logic tasks (1,2,3) carry signatures+tests; UI tasks carry files+interfaces+verify (visual/E2E). No TBD.
- **Type consistency:** `OutlineUnit`/`OutlineConcept` (T2) consumed by useOutline (T3), OutlineView (T5). `projectLabel` (T1) used T4/T5/T7. Sidebar prop API (T4) consumed by AppLayout (T8). GraphView props reused unchanged.
