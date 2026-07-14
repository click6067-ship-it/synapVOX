// Sidebar — the paper "spine" of Archive Graph Studio. Top to bottom:
//   wordmark (Fraunces) + archive kicker · collapse toggle
//   ProjectSwitcher (card-catalog dropdown)
//   ＋ 강의 추가  (opens the upload drawer)
//   SessionList  ("lecture slips", scrolls)
//   GraphStats   (s · c · e, mono, pinned to the foot)
// Purely prop-driven (data down, callbacks up) — Task 14 wires the data + nav.
// Collapse toggles the rail width via `collapsed` + onToggleCollapse (280↔64).
import type { JSX } from 'react'
import type { Project } from '../api/types'
import { ProjectSwitcher } from './ProjectSwitcher'
import { SessionList } from './SessionList'
import type { SidebarSession } from './SessionList'
import { GraphStats } from './GraphStats'
import type { GraphStatsData } from './GraphStats'
import './sidebar.css'

export function Sidebar(props: {
  project: string
  projects: Project[]
  sessions: SidebarSession[]
  stats: GraphStatsData
  collapsed: boolean
  onToggleCollapse(): void
  onSelectProject(p: string): void
  onNewProject(): void
  onOpenUpload(): void
  onHoverSession(id: string | null): void
}): JSX.Element {
  const {
    project,
    projects,
    sessions,
    stats,
    collapsed,
    onToggleCollapse,
    onSelectProject,
    onNewProject,
    onOpenUpload,
    onHoverSession,
  } = props

  return (
    <nav className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}`} aria-label="아카이브">
      <header className="sidebar__brand">
        {collapsed ? (
          <span className="sidebar__wordmark sidebar__wordmark--mono" aria-label="SynapVox">
            S<span className="sidebar__wordmark-v">V</span>
          </span>
        ) : (
          <span className="sidebar__id">
            <span className="sidebar__wordmark">
              Synap<span className="sidebar__wordmark-v">Vox</span>
            </span>
            <span className="sidebar__kicker">ARCHIVE GRAPH</span>
          </span>
        )}
        <button
          type="button"
          className="sidebar__collapse"
          aria-label={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
          title={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
          onClick={onToggleCollapse}
        >
          {collapsed ? '»' : '«'}
        </button>
      </header>

      <div className="sidebar__switch">
        <ProjectSwitcher
          project={project}
          projects={projects}
          collapsed={collapsed}
          onSelectProject={onSelectProject}
          onNewProject={onNewProject}
        />
      </div>

      <button
        type="button"
        className={`sidebar__add${collapsed ? ' sidebar__add--icon' : ''}`}
        onClick={onOpenUpload}
        aria-label="강의 추가"
        title="강의 추가"
      >
        <span className="sidebar__add-plus" aria-hidden="true">
          ＋
        </span>
        {!collapsed && <span className="sidebar__add-text">강의 추가</span>}
      </button>

      {!collapsed && (
        <div className="sidebar__seclabel">
          <span>세션</span>
          <span className="sidebar__seccount">{sessions.length}</span>
        </div>
      )}

      <div className="sidebar__slips">
        <SessionList sessions={sessions} collapsed={collapsed} onHoverSession={onHoverSession} />
      </div>

      <footer className="sidebar__foot">
        <GraphStats stats={stats} collapsed={collapsed} />
      </footer>
    </nav>
  )
}
