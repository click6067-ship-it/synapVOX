// GraphModePage — the force graph as a *mode* (not the whole app). The persistent
// left AppSidebar, global upload, and the far-right 질문하기 rail all live in
// AppLayout; this page is just the canvas + a right detail drawer. Scope from URL:
//   /graph?scope=project&project=P-BIO → one project's graph
//   /graph?scope=all                   → the galaxy (every project as a far-apart
//                                        hub cluster via GraphView's mainRepel)
//   /graph?projects=A,B                → those together (교차연결 bridges)
// Asking happens in the right rail; its RAG evidence (askExpansion, via Outlet
// context) highlights this graph — "질문하면 그래프가 근거로 반응".
import { useCallback, useMemo, useState } from 'react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import GraphView from '../graph/GraphView'
import type { FNode } from '../graph/buildForceData'
import { useProjects } from '../data/useProjects'
import { DetailDrawer } from '../detail/DetailDrawer'
import { useDetail } from '../detail/useDetail'
import type { AppOutletContext } from '../layout/AppLayout'
import './graphmode.css'

export default function GraphModePage() {
  const [params] = useSearchParams()
  const { projects } = useProjects()
  const { askExpansion, onAskConcept } = useOutletContext<AppOutletContext>()

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
  const [detailOpen, setDetailOpen] = useState(false)
  const detail = useDetail(project)

  const handleGraphMeta = useCallback(
    (m: { nodes: number; edges: number; settled: boolean; cross?: number }) =>
      // `cross` only rides the initial load; keep the last value on settle ticks.
      setMeta((prev) => ({ ...prev, ...m, cross: m.cross ?? prev.cross })),
    [],
  )
  const handleSelectNode = useCallback(
    (n: FNode) => {
      detail.open(n)
      setDetailOpen(true)
    },
    [detail],
  )
  const closeDetail = useCallback(() => {
    setDetailOpen(false)
    detail.close()
  }, [detail])

  // Every project after the first renders as its own far-apart hub cluster.
  const alsoShow = useMemo(() => showProjects.slice(1), [showProjects])

  return (
    <div className="graphmode">
      <div className="graphmode__canvas">
        {project ? (
          <>
            <GraphView
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
          </>
        ) : (
          <div className="canvas-empty">그래프를 불러오는 중…</div>
        )}
      </div>
      {detailOpen && detail.state.status !== 'idle' ? (
        <aside className="graphmode__drawer">
          <DetailDrawer
            state={detail.state}
            onClose={closeDetail}
            onAskAbout={(label) => {
              closeDetail()
              onAskConcept(label)
            }}
          />
        </aside>
      ) : null}
    </div>
  )
}
