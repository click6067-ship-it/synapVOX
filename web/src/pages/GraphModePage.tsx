// GraphModePage — the force graph as a *mode* (not the whole app). Reached from
// the sidebar's 그래프 시각화 button; the persistent AppSidebar + global upload
// live in AppLayout, so this page is just the canvas + its overlays + a right
// drawer. Scope comes from the URL:
//   /graph?scope=project&project=P-BIO → one project's graph
//   /graph?scope=all                   → the galaxy (every project as a far-apart
//                                        hub cluster via GraphView's mainRepel)
// Reuses the existing GraphView (elastic physics · hierarchy colors · galaxy),
// useAsk (RAG → 근거 하이라이트), useDetail (concept/session inspector).
import { useCallback, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import GraphView, { type GraphViewHandle } from '../graph/GraphView'
import type { FNode } from '../graph/buildForceData'
import { useProjects } from '../data/useProjects'
import { AskBar } from '../ask/AskBar'
import { AnswerDrawer } from '../ask/AnswerDrawer'
import { useAsk } from '../ask/useAsk'
import { DetailDrawer } from '../detail/DetailDrawer'
import { useDetail } from '../detail/useDetail'
import './graphmode.css'

export default function GraphModePage() {
  const [params] = useSearchParams()
  const { projects } = useProjects()

  const scope: 'project' | 'all' = params.get('scope') === 'all' ? 'all' : 'project'
  const projectParam = params.get('project') ?? ''
  const projectsParam = params.get('projects')

  // Which projects to render together:
  //   ?projects=A,B  → exactly those (multi-select → 교차연결 bridges appear)
  //   ?scope=all     → every project (galaxy)
  //   ?scope=project&project=X (or nothing) → a single project
  const showProjects = useMemo(() => {
    const explicit = projectsParam ? projectsParam.split(',').map((s) => s.trim()).filter(Boolean) : []
    if (explicit.length) return explicit
    if (scope === 'all') return projects.map((p) => p.project)
    const single = projectParam || projects[0]?.project
    return single ? [single] : []
  }, [projectsParam, scope, projectParam, projects])

  const project = showProjects[0] ?? ''
  const multi = showProjects.length > 1

  const [meta, setMeta] = useState({ nodes: 0, edges: 0, settled: false, cross: 0 })
  const [panel, setPanel] = useState<'detail' | 'answer' | null>(null)
  const [askExpansion, setAskExpansion] = useState<Set<string> | null>(null)

  const graphRef = useRef<GraphViewHandle>(null)
  const detail = useDetail(project)
  const ask = useAsk(project, setAskExpansion)

  const handleGraphMeta = useCallback(
    (m: { nodes: number; edges: number; settled: boolean; cross?: number }) =>
      // `cross` only rides the initial load; keep the last value on settle ticks.
      setMeta((prev) => ({ ...prev, ...m, cross: m.cross ?? prev.cross })),
    [],
  )
  const handleSelectNode = useCallback(
    (n: FNode) => {
      detail.open(n)
      setPanel('detail')
    },
    [detail],
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

  // Every project after the first renders as its own far-apart hub cluster.
  const alsoShow = useMemo(() => showProjects.slice(1), [showProjects])

  const drawer =
    panel === 'detail' && detail.state.status !== 'idle' ? (
      <DetailDrawer state={detail.state} onClose={closeDrawer} onAskAbout={handleAskAbout} />
    ) : panel === 'answer' ? (
      <AnswerDrawer answer={ask.answer} busy={ask.busy} error={ask.error} onClose={closeDrawer} />
    ) : null

  return (
    <div className="graphmode">
      <div className="graphmode__canvas">
        {project ? (
          <>
            <GraphView
              ref={graphRef}
              project={project}
              alsoShow={alsoShow}
              onGraphMeta={handleGraphMeta}
              onSelectNode={handleSelectNode}
              askExpansionIds={askExpansion}
            />
            <div className="hud">
              {multi ? `${showProjects.length}과목 · ` : ''}
              {meta.nodes} concepts · {meta.edges} edges
              {meta.cross ? ` · 교차연결 ${meta.cross}` : ''} · {meta.settled ? 'settled' : 'settling…'}
            </div>
            <AskBar onSubmit={handleAsk} busy={ask.busy} />
          </>
        ) : (
          <div className="canvas-empty">그래프를 불러오는 중…</div>
        )}
      </div>
      {drawer ? <aside className="graphmode__drawer">{drawer}</aside> : null}
    </div>
  )
}
