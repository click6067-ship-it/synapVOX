// Dashboard — the app's default screen (the graph is a separate mode; 질문하기
// lives in the far-right rail). Two shapes, chosen by the route param:
//   • overview  (no project) → TopWorkbench + ProjectShelf; empty → onboarding.
//   • focused   (a project)  → TopWorkbench + OutlineView, with a right
//                              DetailDrawer for concept/session clicks.
// Nav is prop-driven: this decides WHAT, AppLayout wires HOW (open upload, route
// to /p/:project, switch to graph, focus/ask the far-right 질문하기 rail).
import type { JSX } from 'react'
import { useParams } from 'react-router-dom'
import { useProjects } from '../data/useProjects'
import { useOutline } from '../data/useOutline'
import { useDetail } from '../detail/useDetail'
import { DetailDrawer } from '../detail/DetailDrawer'
import type { FNode } from '../graph/buildForceData'
import { projectLabel } from '../graph/projectMeta'
import TopWorkbench from './TopWorkbench'
import ProjectShelf from './ProjectShelf'
import OutlineView from './OutlineView'
import EmptyOnboarding from './EmptyOnboarding'
import './dashboard.css'

type DashboardProps = {
  onAddLecture(): void
  onOpenGraph(scope: 'project' | 'all', project?: string): void
  onSelectProject(project: string): void
  // 질문하기 lives in the far-right rail (AppLayout). These forward the dashboard's
  // 질문하기 button and a concept's "이 개념 질문" to that rail.
  onFocusQuestion(): void
  onAskConcept(label: string): void
}

export default function Dashboard(props: DashboardProps): JSX.Element {
  const { project } = useParams<{ project: string }>()
  return project ? <FocusedDashboard project={project} {...props} /> : <OverviewDashboard {...props} />
}

function OverviewDashboard(props: DashboardProps): JSX.Element {
  const { onAddLecture, onOpenGraph, onSelectProject, onFocusQuestion } = props
  const { projects, loading, error } = useProjects()

  if (loading) return <div className="dash dash--center"><p className="dash__status">불러오는 중…</p></div>
  if (error) return <div className="dash dash--center"><p className="dash__status dash__status--error">{error}</p></div>
  if (projects.length === 0)
    return (
      <div className="dash">
        <EmptyOnboarding onAddLecture={onAddLecture} onSelectProject={onSelectProject} />
      </div>
    )

  return (
    <div className="dash">
      <TopWorkbench
        eyebrow="SYNAPVOX · 아카이브"
        title="오늘 정리할 강의"
        subtitle="과목을 열어 단원·개념을 확인하고, 오른쪽에서 질문하세요."
        onAddLecture={onAddLecture}
        onQuestion={onFocusQuestion}
      />
      <ProjectShelf projects={projects} onOpen={onSelectProject} onGraph={(p) => onOpenGraph('project', p)} />
    </div>
  )
}

function FocusedDashboard(props: DashboardProps & { project: string }): JSX.Element {
  const { project, onAddLecture, onOpenGraph, onFocusQuestion, onAskConcept } = props
  const { units, loading, error, stats } = useOutline(project)
  const detail = useDetail(project)

  // useDetail.open expects a graph FNode, but only reads id/type/label — the
  // outline gives us those directly, so we synthesize a minimal node.
  const openConcept = (id: string, label: string, bridge: boolean) =>
    detail.open(asNode({ id, type: 'concept', label, bridge }))
  const openSession = (id: string, label: string) =>
    detail.open(asNode({ id, type: 'session', label, bridge: false }))

  return (
    <div className="dash">
      <TopWorkbench
        eyebrow="과목"
        title={projectLabel(project)}
        subtitle={`세션 ${stats.sessions} · 개념 ${stats.concepts}`}
        onAddLecture={onAddLecture}
        onQuestion={onFocusQuestion}
        onOpenGraph={() => onOpenGraph('project', project)}
      />

      <OutlineView
        units={units}
        loading={loading}
        error={error}
        onSelectConcept={openConcept}
        onSelectSession={openSession}
      />

      {detail.state.status !== 'idle' ? (
        <div className="dash-detail">
          <DetailDrawer
            state={detail.state}
            onClose={detail.close}
            onAskAbout={(label) => {
              detail.close()
              onAskConcept(label)
            }}
          />
        </div>
      ) : null}
    </div>
  )
}

// Build the minimal FNode useDetail needs from outline data.
function asNode(n: { id: string; type: 'concept' | 'session'; label: string; bridge: boolean }): FNode {
  return { ...n, degree: 0, neighbors: new Set<string>() }
}
