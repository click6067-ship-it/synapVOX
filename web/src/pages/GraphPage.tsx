// GraphPage — the whole app for one project. Composes the AppShell (sidebar |
// graph canvas | contextual right drawer) and wires the pieces together:
//   sidebar hover → graph highlight · node click → detail drawer ·
//   upload → Growth Ring (incremental, no relayout) · ask → answer drawer +
//   RAG expansion · project switch. GraphView owns the elastic physics.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../layout/AppShell'
import { Sidebar } from '../sidebar/Sidebar'
import type { SidebarSession } from '../sidebar/SessionList'
import GraphView, { type GraphViewHandle } from '../graph/GraphView'
import type { FNode } from '../graph/buildForceData'
import { buildForceData } from '../graph/buildForceData'
import { mapGraph } from '../graph/mapGraph'
import { getGraph, listProjects } from '../api/client'
import type { Project } from '../api/types'
import { UploadDrawer } from '../upload/UploadDrawer'
import { AskBar } from '../ask/AskBar'
import { AnswerDrawer } from '../ask/AnswerDrawer'
import { useAsk } from '../ask/useAsk'
import { DetailDrawer } from '../detail/DetailDrawer'
import { useDetail } from '../detail/useDetail'
import './graphpage.css'

export default function GraphPage() {
  const { projectId } = useParams()
  const navigate = useNavigate()

  const [projects, setProjects] = useState<Project[]>([])
  const [sessions, setSessions] = useState<FNode[]>([])
  const [meta, setMeta] = useState({ nodes: 0, edges: 0, settled: false })
  const [collapsed, setCollapsed] = useState(false)
  const [hoverSession, setHoverSession] = useState<string | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadMode, setUploadMode] = useState<'add' | 'new'>('add')
  const [panel, setPanel] = useState<'detail' | 'answer' | null>(null)
  const [askExpansion, setAskExpansion] = useState<Set<string> | null>(null)

  const graphRef = useRef<GraphViewHandle>(null)

  // Resolve the active project: explicit route param, else the first project.
  const project = projectId ?? projects[0]?.project ?? ''

  useEffect(() => {
    listProjects().then(setProjects).catch(() => setProjects([]))
  }, [])

  // `/` → `/p/{first project}` once projects load, so GraphView always mounts
  // with a stable route-provided project (no '' → id transition mid-fetch).
  useEffect(() => {
    if (!projectId && projects.length > 0) navigate(`/p/${projects[0].project}`, { replace: true })
  }, [projectId, projects, navigate])

  const detail = useDetail(project)
  const ask = useAsk(project, setAskExpansion)

  // ── Memoized callbacks (GraphView effects depend on identity) ──────────────
  const handleGraphMeta = useCallback((m: { nodes: number; edges: number; settled: boolean }) => setMeta(m), [])
  const handleSessions = useCallback((s: FNode[]) => setSessions(s), [])
  const handleSelectNode = useCallback(
    (n: FNode) => {
      detail.open(n)
      setPanel('detail')
    },
    [detail],
  )

  // Upload succeeded. Two outcomes, keyed on where the lecture actually landed:
  //   • same project → refetch the full graph and grow it in (mergeSubgraph
  //     dedupes, so only the new session + its concepts are added; existing
  //     nodes keep their positions → no relayout, Growth Ring fires).
  //   • a new project (new-project mode's fresh slug) → navigate into it; its
  //     GraphView mounts and fetches the freshly-seeded graph.
  const handleIngested = useCallback(
    async (target: string) => {
      if (target !== project) {
        navigate(`/p/${target}`)
        return
      }
      try {
        const raw = await getGraph(project)
        graphRef.current?.growWith?.(buildForceData(mapGraph(raw)))
      } catch {
        /* graph refresh failed — leave the current graph as-is */
      }
    },
    [project, navigate],
  )

  const handleAsk = useCallback(
    (q: string) => {
      ask.ask(q)
      setPanel('answer')
    },
    [ask],
  )

  const handleAskAbout = useCallback(
    (label: string) => {
      ask.ask(`"${label}"이 무엇인지 이 강의들을 근거로 설명해줘`)
      setPanel('answer')
    },
    [ask],
  )

  const closeDrawer = useCallback(() => {
    setPanel(null)
    detail.close()
    ask.clear()
  }, [detail, ask])

  const sidebarSessions: SidebarSession[] = useMemo(
    () =>
      sessions
        .slice()
        .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
        .map((s) => ({ id: s.id, seq: s.seq, label: s.label })),
    [sessions],
  )

  const stats = useMemo(
    () => ({ sessions: sessions.length, concepts: Math.max(0, meta.nodes - sessions.length), edges: meta.edges }),
    [sessions.length, meta.nodes, meta.edges],
  )

  const sidebar = (
    <Sidebar
      project={project}
      projects={projects}
      sessions={sidebarSessions}
      stats={stats}
      collapsed={collapsed}
      onToggleCollapse={() => setCollapsed((c) => !c)}
      onSelectProject={(p) => navigate(`/p/${p}`)}
      onNewProject={() => {
        setUploadMode('new')
        setUploadOpen(true)
      }}
      onOpenUpload={() => {
        setUploadMode('add')
        setUploadOpen(true)
      }}
      onHoverSession={setHoverSession}
    />
  )

  const canvas = project ? (
    <>
      <GraphView
        ref={graphRef}
        project={project}
        onGraphMeta={handleGraphMeta}
        onSessions={handleSessions}
        onSelectNode={handleSelectNode}
        highlightId={hoverSession}
        askExpansionIds={askExpansion}
      />
      {/* graph HUD (top-left) */}
      <div className="hud">
        {meta.nodes} concepts · {meta.edges} edges · {meta.settled ? 'settled' : 'settling…'}
      </div>
      <AskBar onSubmit={handleAsk} busy={ask.busy} />
    </>
  ) : (
    <div className="canvas-empty">프로젝트를 불러오는 중…</div>
  )

  const drawer =
    panel === 'detail' && detail.state.status !== 'idle' ? (
      <DetailDrawer state={detail.state} onClose={closeDrawer} onAskAbout={handleAskAbout} />
    ) : panel === 'answer' ? (
      <AnswerDrawer answer={ask.answer} busy={ask.busy} onClose={closeDrawer} />
    ) : undefined

  return (
    <>
      <AppShell sidebar={sidebar} canvas={canvas} drawer={drawer} sidebarCollapsed={collapsed} />
      <UploadDrawer
        project={project}
        open={uploadOpen}
        mode={uploadMode}
        onClose={() => setUploadOpen(false)}
        onIngested={handleIngested}
      />
    </>
  )
}
