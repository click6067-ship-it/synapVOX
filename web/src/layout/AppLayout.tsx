// AppLayout — the persistent frame shared by every screen: the paper AppSidebar
// (left rail) + a routed main area (<Outlet/>) + one global UploadDrawer. This is
// where the IA's "graph is a mode" lives: the sidebar never unmounts, and nav
// state is derived from the URL rather than component state, so deep links work.
//   /            → Dashboard (overview)      view=dashboard, no active project
//   /p/:project  → Dashboard (focused)       view=dashboard, active project
//   /graph?scope=project&project=P  → graph  view=graph, scope=project
//   /graph?scope=all                → graph  view=graph, scope=all (galaxy)
// Children receive nav callbacks via Outlet context (AppOutletContext).
import { useCallback, useMemo, useState } from 'react'
import type { JSX } from 'react'
import { Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { AppSidebar } from '../sidebar/AppSidebar'
import { UploadDrawer } from '../upload/UploadDrawer'
import { useProjects } from '../data/useProjects'
import './applayout.css'

export type AppOutletContext = {
  // "＋ 강의 추가" — mode (add vs new project) is decided by AppLayout from the
  // active project; children just request the drawer.
  onAddLecture(): void
  onOpenGraph(scope: 'project' | 'all', project?: string): void
  onSelectProject(project: string): void
  // Bumped when the sidebar's 질문하기 is pressed on a focused dashboard, so the
  // Question Dock can imperatively focus itself. 0 = never requested.
  focusQuestionNonce: number
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

  const openUpload = useCallback(() => {
    // A focused project → add a lecture to it; otherwise → create a new subject.
    setUpload({ open: true, mode: activeProject ? 'add' : 'new' })
  }, [activeProject])

  // 질문하기: route to a project's dashboard (structured Q&A lives there), then
  // nudge its Question Dock to focus. No project yet → guide them to add one.
  const focusQuestion = useCallback(() => {
    const target = activeProject ?? projects[0]?.project ?? null
    if (!target) {
      setUpload({ open: true, mode: 'new' })
      return
    }
    if (location.pathname !== `/p/${encodeURIComponent(target)}`) {
      navigate(`/p/${encodeURIComponent(target)}`)
    }
    setFocusQuestionNonce((n) => n + 1)
  }, [activeProject, projects, location.pathname, navigate])

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
      focusQuestionNonce,
    }),
    [openUpload, openGraph, selectProject, focusQuestionNonce],
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
          onSelectProject={selectProject}
        />
      </div>

      <main className="applayout__main">
        <Outlet context={outletContext} />
      </main>

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
