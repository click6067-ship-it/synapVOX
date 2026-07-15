// AppSidebar — the dashboard-first paper "spine" (Archive aesthetic). Top→bottom:
//   wordmark (Fraunces, red "Vox") + ARCHIVE kicker · collapse toggle
//   Primary actions: ＋ 강의 추가 · 대시보드 · 질문하기 · 그래프 시각화
//   Graph scope segmented control (only in graph mode): 현재 프로젝트 / 전체 / 교차연결(곧·P1)
//   Projects: projectLabel + 세션 N·개념 M (mono), + 모든 과목 → galaxy
// Purely prop-driven (data down, callbacks up). AppLayout wires nav/data.
// Collapse toggles the rail width via `collapsed` + onToggleCollapse (280↔64, icons only).
import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { Project } from '../api/types'
import { projectLabel } from '../graph/projectMeta'
import './sidebar.css'

export function AppSidebar(props: {
  projects: Project[]
  activeProject: string | null
  view: 'dashboard' | 'graph'
  scope?: 'project' | 'all' | 'cross'
  collapsed: boolean
  onToggleCollapse(): void
  onNavDashboard(): void
  onOpenUpload(): void
  onFocusQuestion(): void
  onOpenGraph(scope: 'project' | 'all'): void
  onOpenGraphProjects(ids: string[]): void
  onSelectProject(p: string): void
  graphProjects?: string[] // projects the graph currently shows → seeds the checkboxes
}): JSX.Element {
  const {
    projects,
    activeProject,
    view,
    scope,
    collapsed,
    onToggleCollapse,
    onNavDashboard,
    onOpenUpload,
    onFocusQuestion,
    onOpenGraph,
    onOpenGraphProjects,
    onSelectProject,
    graphProjects,
  } = props

  const dashboardActive = view === 'dashboard'
  const graphActive = view === 'graph'

  // Checkbox selection for "함께 보기" (교차연결). Seeded from whatever the graph is
  // currently showing so a deep link / active galaxy reflects in the checkboxes.
  const graphKey = (graphProjects ?? []).join(',')
  const [selected, setSelected] = useState<Set<string>>(() => new Set(graphProjects ?? []))
  useEffect(() => {
    if (view === 'graph') setSelected(new Set(graphProjects ?? []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, graphKey])
  const toggleSelected = (p: string) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(p)) next.delete(p)
      else next.add(p)
      return next
    })
  // Preserve sidebar order (딥러닝·생명과학·머신러닝) in the emitted list.
  const selectedOrdered = projects.map((p) => p.project).filter((p) => selected.has(p))

  // The "그래프 시각화" button: checked subjects → visualize those together;
  // else the current project's graph (or the galaxy when none is focused).
  const graphDefaultScope: 'project' | 'all' = activeProject ? 'project' : 'all'
  const openGraphFromSelection = () => {
    if (selectedOrdered.length >= 1) onOpenGraphProjects(selectedOrdered)
    else onOpenGraph(graphDefaultScope)
  }

  const totals = projects.reduce(
    (acc, p) => ({ sessions: acc.sessions + p.sessions, concepts: acc.concepts + p.concepts }),
    { sessions: 0, concepts: 0 },
  )

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
            <span className="sidebar__kicker">ARCHIVE</span>
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

      {/* ── Primary actions ─────────────────────────────── */}
      <div className="sidebar__nav">
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

        <button
          type="button"
          className={`navitem${dashboardActive ? ' is-active' : ''}`}
          onClick={onNavDashboard}
          aria-current={dashboardActive ? 'page' : undefined}
          title="대시보드"
        >
          <span className="navitem__ico" aria-hidden="true">
            ▤
          </span>
          {!collapsed && <span className="navitem__label">대시보드</span>}
        </button>

        <button
          type="button"
          className="navitem"
          onClick={onFocusQuestion}
          title="질문하기"
        >
          <span className="navitem__ico" aria-hidden="true">
            ?
          </span>
          {!collapsed && <span className="navitem__label">질문하기</span>}
        </button>

        <button
          type="button"
          className={`navitem${graphActive ? ' is-active' : ''}`}
          onClick={openGraphFromSelection}
          aria-current={graphActive ? 'page' : undefined}
          title={
            selectedOrdered.length > 1
              ? `선택한 ${selectedOrdered.length}과목 함께 보기 (교차연결)`
              : '그래프 시각화'
          }
        >
          <span className="navitem__ico" aria-hidden="true">
            ◈
          </span>
          {!collapsed && (
            <span className="navitem__label">
              그래프 시각화
              {selectedOrdered.length > 0 && (
                <span className="navitem__badge">{selectedOrdered.length}</span>
              )}
            </span>
          )}
        </button>

        {/* Scope shortcuts — only while the graph mode is active, and only expanded */}
        {graphActive && !collapsed && (
          <div className="appseg" role="group" aria-label="그래프 범위">
            <button
              type="button"
              className={`appseg__opt${(graphProjects?.length ?? 0) <= 1 && scope !== 'all' ? ' is-active' : ''}`}
              onClick={() => onOpenGraph('project')}
              disabled={!activeProject}
            >
              현재 과목
            </button>
            <button
              type="button"
              className={`appseg__opt${scope === 'all' ? ' is-active' : ''}`}
              onClick={() => onOpenGraph('all')}
            >
              전체
            </button>
          </div>
        )}
      </div>

      {/* ── Projects ────────────────────────────────────── */}
      {!collapsed && (
        <div className="sidebar__seclabel">
          <span>과목</span>
          <span className="sidebar__seccount">{projects.length}</span>
        </div>
      )}
      {!collapsed && projects.length > 1 && (
        <p className="appprojects__hint">
          체크해서 <strong>그래프 시각화</strong>로 함께 보기
        </p>
      )}

      <div className="sidebar__slips">
        <ul className="appprojects">
          {projects.map((p) => {
            const active = p.project === activeProject
            const label = projectLabel(p.project)
            const checked = selected.has(p.project)
            return (
              <li key={p.project} className={`appproj-row${checked ? ' is-checked' : ''}`}>
                {!collapsed && (
                  <input
                    type="checkbox"
                    className="appproj-check"
                    checked={checked}
                    onChange={() => toggleSelected(p.project)}
                    aria-label={`${label} 그래프에 포함`}
                    title={`${label} 함께 보기`}
                  />
                )}
                <button
                  type="button"
                  className={`appproj${active ? ' is-active' : ''}`}
                  onClick={() => onSelectProject(p.project)}
                  aria-current={active ? 'true' : undefined}
                  title={label}
                >
                  {collapsed ? (
                    <span className="appproj__mono" aria-hidden="true">
                      {label.slice(0, 1)}
                    </span>
                  ) : (
                    <>
                      <span className="appproj__name">{label}</span>
                      <span className="appproj__counts">
                        세션 {p.sessions}·개념 {p.concepts}
                      </span>
                    </>
                  )}
                </button>
              </li>
            )
          })}

          <li>
            <button
              type="button"
              className="appproj appproj--all"
              onClick={() => onOpenGraph('all')}
              title="모든 과목 함께 보기"
            >
              {collapsed ? (
                <span className="appproj__mono" aria-hidden="true">
                  ◎
                </span>
              ) : (
                <span className="appproj__name">
                  <span aria-hidden="true">◎</span> 모든 과목
                </span>
              )}
            </button>
          </li>
        </ul>
      </div>

      {!collapsed && projects.length > 0 && (
        <footer className="sidebar__foot appfoot">
          세션 <span className="appfoot__n">{totals.sessions}</span> · 개념{' '}
          <span className="appfoot__n">{totals.concepts}</span>
        </footer>
      )}
    </nav>
  )
}
