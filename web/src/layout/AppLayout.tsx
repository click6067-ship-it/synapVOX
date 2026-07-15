// AppLayout — the persistent frame shared by every screen: the paper AppSidebar
// (left rail) + a routed main area (<Outlet/>) + one global UploadDrawer. This is
// where the IA's "graph is a mode" lives: the sidebar never unmounts, and nav
// state is derived from the URL rather than component state, so deep links work.
//   /            → Dashboard (overview)      view=dashboard, no active project
//   /p/:project  → Dashboard (focused)       view=dashboard, active project
//   /graph?scope=project&project=P  → graph  view=graph, scope=project
//   /graph?scope=all                → graph  view=graph, scope=all (galaxy)
// Children receive nav callbacks via Outlet context (AppOutletContext).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import { Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { AppSidebar } from '../sidebar/AppSidebar'
import { UploadDrawer } from '../upload/UploadDrawer'
import { QuestionRail } from '../ask/QuestionRail'
import { useAsk } from '../ask/useAsk'
import { useProjects } from '../data/useProjects'
import { projectLabel } from '../graph/projectMeta'
import './applayout.css'

export type AppOutletContext = {
  // "＋ 강의 추가" — mode (add vs new project) is decided by AppLayout from the
  // active project; children just request the drawer.
  onAddLecture(): void
  onOpenGraph(scope: 'project' | 'all', project?: string): void
  onSelectProject(project: string): void
  // Focus the far-right 질문하기 rail (from the dashboard's 질문하기 button).
  onFocusQuestion(): void
  // Ask a concept in the right rail (a detail drawer's "이 개념 질문").
  onAskConcept(label: string): void
  // RAG evidence node ids from the last answer → GraphModePage highlights them.
  askExpansion: Set<string> | null
}

export default function AppLayout(): JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const { projects, reload } = useProjects()

  const [collapsed, setCollapsed] = useState(false)
  const [upload, setUpload] = useState<{ open: boolean; mode: 'add' | 'new' }>({
    open: false,
    mode: 'add',
  })
  const [focusQuestionNonce, setFocusQuestionNonce] = useState(0)

  // ── Derive nav state from the URL (single source of truth) ─────────────────
  const view: 'dashboard' | 'graph' = location.pathname.startsWith('/graph') ? 'graph' : 'dashboard'
  const scope: 'project' | 'all' | 'cross' =
    params.get('scope') === 'all' ? 'all' : params.get('scope') === 'cross' ? 'cross' : 'project'
  const activeProject = useMemo(() => {
    if (view === 'graph') return params.get('project')
    const m = location.pathname.match(/^\/p\/([^/]+)/)
    return m ? decodeURIComponent(m[1]) : null
  }, [view, params, location.pathname])

  // Which projects the graph is currently showing (for the sidebar's checkboxes
  // to reflect a deep link / active galaxy). Empty outside graph mode.
  const graphProjects = useMemo(() => {
    if (view !== 'graph') return []
    const pp = params.get('projects')
    if (pp) return pp.split(',').map((s) => s.trim()).filter(Boolean)
    if (params.get('scope') === 'all') return projects.map((p) => p.project)
    const single = params.get('project')
    return single ? [single] : []
  }, [view, params, projects])

  // ── Right-rail Q&A (shared) ────────────────────────────────────────────────
  // The 질문하기 rail asks the active project (or, in a multi-project graph, the
  // first shown). AppLayout owns the RAG state so the same ask ALSO drives the
  // graph highlight (askExpansion → GraphModePage via Outlet context).
  const [askExpansion, setAskExpansion] = useState<Set<string> | null>(null)
  const askProject = activeProject ?? graphProjects[0] ?? ''
  const ask = useAsk(askProject, setAskExpansion)
  // Switching projects clears the previous answer + graph highlight. Guarded on
  // the ACTUAL project change (via ref) so a mere re-render can never wipe a live
  // answer, independent of useAsk's clear identity.
  const askClearRef = useRef(ask.clear)
  askClearRef.current = ask.clear
  const prevAskProjectRef = useRef(askProject)
  useEffect(() => {
    if (prevAskProjectRef.current !== askProject) {
      prevAskProjectRef.current = askProject
      askClearRef.current()
    }
  }, [askProject])
  // Multi-project graph asks only the first shown project (backend /ask is per
  // group_id) — disclose that in the rail rather than silently scoping.
  const askNote =
    graphProjects.length > 1 ? `여러 과목을 함께 보는 중 — 질문은 ${projectLabel(askProject)} 기준이에요.` : undefined

  // ── Navigation handlers ────────────────────────────────────────────────────
  const openGraph = useCallback(
    (s: 'project' | 'all', project?: string) => {
      const p = project ?? activeProject
      if (s === 'project' && p) {
        navigate(`/graph?scope=project&project=${encodeURIComponent(p)}`)
      } else {
        navigate('/graph?scope=all')
      }
    },
    [navigate, activeProject],
  )

  const selectProject = useCallback(
    (p: string) => navigate(`/p/${encodeURIComponent(p)}`),
    [navigate],
  )

  // 교차연결: visualize a checkbox-selected set of subjects together. One id → a
  // single-project graph; two+ → the galaxy with cross-concept bridges.
  const openGraphProjects = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return
      navigate(`/graph?projects=${ids.map(encodeURIComponent).join(',')}`)
    },
    [navigate],
  )

  const openUpload = useCallback(() => {
    // A focused project → add a lecture to it; otherwise → create a new subject.
    setUpload({ open: true, mode: activeProject ? 'add' : 'new' })
  }, [activeProject])

  // 질문하기: focus the far-right rail's input. If a subject is active, bump the
  // nonce now. If not, navigate to the first project first and defer the focus
  // bump until that project is active (else the rail input isn't mounted yet).
  const pendingFocusRef = useRef(false)
  const focusQuestion = useCallback(() => {
    if (askProject) {
      setFocusQuestionNonce((n) => n + 1)
      return
    }
    if (projects[0]) {
      pendingFocusRef.current = true
      navigate(`/p/${encodeURIComponent(projects[0].project)}`)
    } else {
      setUpload({ open: true, mode: 'new' })
    }
  }, [askProject, projects, navigate])
  useEffect(() => {
    if (askProject && pendingFocusRef.current) {
      pendingFocusRef.current = false
      setFocusQuestionNonce((n) => n + 1)
    }
  }, [askProject])

  // "이 개념 질문" from a detail drawer → ask it in the right rail + focus it.
  const askAsk = ask.ask
  const askConcept = useCallback(
    (label: string) => {
      askAsk(`"${label}"이 무엇인지 이 강의들을 근거로 설명해줘`)
      setFocusQuestionNonce((n) => n + 1)
    },
    [askAsk],
  )

  // Upload succeeded → refresh the project list and land on the new lecture's
  // focused dashboard (dashboard-first: you see the new outline, not the graph).
  const handleIngested = useCallback(
    (target: string) => {
      reload()
      navigate(`/p/${encodeURIComponent(target)}`)
    },
    [reload, navigate],
  )

  const outletContext: AppOutletContext = useMemo(
    () => ({
      onAddLecture: openUpload,
      onOpenGraph: openGraph,
      onSelectProject: selectProject,
      onFocusQuestion: focusQuestion,
      onAskConcept: askConcept,
      askExpansion,
    }),
    [openUpload, openGraph, selectProject, focusQuestion, askConcept, askExpansion],
  )

  return (
    <div className={`applayout${collapsed ? ' applayout--collapsed' : ''}`}>
      <div className="applayout__rail">
        <AppSidebar
          projects={projects}
          activeProject={activeProject}
          view={view}
          scope={view === 'graph' ? scope : undefined}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((c) => !c)}
          onNavDashboard={() => navigate('/')}
          onOpenUpload={openUpload}
          onFocusQuestion={focusQuestion}
          onOpenGraph={openGraph}
          onOpenGraphProjects={openGraphProjects}
          onSelectProject={selectProject}
          graphProjects={graphProjects}
        />
      </div>

      <main className="applayout__main">
        <Outlet context={outletContext} />
      </main>

      <div className="applayout__qrail">
        <QuestionRail
          project={askProject}
          answer={ask.answer}
          busy={ask.busy}
          error={ask.error}
          onAsk={ask.ask}
          onClear={ask.clear}
          focusNonce={focusQuestionNonce}
          note={askNote}
        />
      </div>

      <UploadDrawer
        project={activeProject ?? ''}
        open={upload.open}
        mode={upload.mode}
        onClose={() => setUpload((u) => ({ ...u, open: false }))}
        onIngested={handleIngested}
      />
    </div>
  )
}
