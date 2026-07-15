// Dashboard — the app's default screen (the graph is a separate mode).
// Two shapes, chosen by the route param:
//   • overview  (no project) → TopWorkbench + ProjectShelf; empty → onboarding.
//   • focused   (a project)  → TopWorkbench + OutlineView + QuestionDock, with a
//                              right DetailDrawer for concept/session clicks.
// Nav is prop-driven: this component decides WHAT, the parent (AppLayout) wires
// HOW (open upload drawer, route to /p/:project, switch to graph mode).
import { useEffect, useRef } from 'react'
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
import QuestionDock, { type QuestionDockHandle } from './QuestionDock'
import EmptyOnboarding from './EmptyOnboarding'
import './dashboard.css'

type DashboardProps = {
  onAddLecture(): void
  onOpenGraph(scope: 'project' | 'all', project?: string): void
  onSelectProject(project: string): void
  // Bumped by AppLayout when the sidebar's 질문하기 is pressed → focus the dock.
  focusQuestionNonce?: number
}

export default function Dashboard(props: DashboardProps): JSX.Element {
  const { project } = useParams<{ project: string }>()
  return project ? (
    <FocusedDashboard project={project} {...props} />
  ) : (
    <OverviewDashboard {...props} />
  )
}

function OverviewDashboard(props: DashboardProps): JSX.Element {
  const { onAddLecture, onOpenGraph, onSelectProject } = props
  const { projects, loading, error } = useProjects()
  const shelfRef = useRef<HTMLDivElement>(null)

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
        subtitle="과목을 열어 단원·개념을 확인하고, 궁금한 걸 질문하세요."
        onAddLecture={onAddLecture}
        onQuestion={() => shelfRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
      />
      <div ref={shelfRef}>
        <ProjectShelf
          projects={projects}
          onOpen={onSelectProject}
          onGraph={(p) => onOpenGraph('project', p)}
        />
      </div>
    </div>
  )
}

function FocusedDashboard(props: DashboardProps & { project: string }): JSX.Element {
  const { project, onAddLecture, onOpenGraph, focusQuestionNonce } = props
  const { units, loading, error, stats } = useOutline(project)
  const detail = useDetail(project)
  const dockRef = useRef<QuestionDockHandle>(null)

  // Sidebar 질문하기 (via AppLayout) → focus the dock. Skip the initial 0 so we
  // don't steal focus on first load.
  useEffect(() => {
    if (focusQuestionNonce) dockRef.current?.focus()
  }, [focusQuestionNonce])

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
        onQuestion={() => dockRef.current?.focus()}
        onOpenGraph={() => onOpenGraph('project', project)}
      />

      <OutlineView
        units={units}
        loading={loading}
        error={error}
        onSelectConcept={openConcept}
        onSelectSession={openSession}
      />

      <QuestionDock ref={dockRef} project={project} onOpenGraph={() => onOpenGraph('project', project)} />

      {detail.state.status !== 'idle' ? (
        <div className="dash-detail">
          <DetailDrawer
            state={detail.state}
            onClose={detail.close}
            onAskAbout={(label) => {
              detail.close()
              dockRef.current?.ask(`"${label}"이 무엇인지 이 강의들을 근거로 설명해줘`)
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
