// ProjectSwitcher — a card-catalog dropdown of projects. Trigger shows the
// current project (mono) + its session/concept tally; opening reveals every
// project as a row (name + mono counts), the active one flagged with a
// session-red tab. Selecting calls onSelectProject (Task 14 navigates /p/:id).
// Self-contained: closes on outside click / Escape. Collapsed → a static
// monogram badge (no dropdown — the rail's `overflow:hidden` would clip a wide
// menu; the user expands the sidebar to switch projects).
import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { Project } from '../api/types'
import './sidebar.css'

export function ProjectSwitcher(props: {
  project: string
  projects: Project[]
  collapsed: boolean
  onSelectProject(p: string): void
}): JSX.Element {
  const { project, projects, collapsed, onSelectProject } = props
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const current = projects.find((p) => p.project === project)

  function choose(p: string) {
    setOpen(false)
    if (p !== project) onSelectProject(p)
  }

  // Collapsed rail: a non-interactive monogram badge (dropdown would be clipped
  // by the sidebar's overflow:hidden). Hooks above still run unconditionally.
  if (collapsed) {
    return (
      <div className="projectswitcher projectswitcher--collapsed">
        <span className="projectswitcher__monogram" title={project} aria-label={`프로젝트 ${project}`}>
          {initials(project)}
        </span>
      </div>
    )
  }

  return (
    <div className="projectswitcher" ref={rootRef}>
      <button
        type="button"
        className="projectswitcher__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        title={project}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="projectswitcher__label">
          <span className="projectswitcher__name">{project || '프로젝트 없음'}</span>
          {current && (
            <span className="projectswitcher__counts">
              <span className="projectswitcher__n">{current.sessions}</span> sessions
              <span className="graphstats__sep"> · </span>
              <span className="projectswitcher__n">{current.concepts}</span> concepts
            </span>
          )}
        </span>
        <span className={`projectswitcher__chev${open ? ' is-open' : ''}`} aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <ul className="projectswitcher__menu" role="listbox" aria-label="프로젝트 전환">
          <li className="projectswitcher__legend" aria-hidden="true">
            project<span className="projectswitcher__legendcounts">sessions · concepts</span>
          </li>
          {projects.length === 0 && <li className="projectswitcher__empty">프로젝트가 없습니다</li>}
          {projects.map((p) => {
            const active = p.project === project
            return (
              <li key={p.project} role="option" aria-selected={active}>
                <button
                  type="button"
                  className={`projectswitcher__item${active ? ' is-active' : ''}`}
                  onClick={() => choose(p.project)}
                  title={p.project}
                >
                  <span className="projectswitcher__itemname">{p.project}</span>
                  <span className="projectswitcher__itemcounts">
                    <span className="projectswitcher__n">{p.sessions}</span>
                    <span className="graphstats__sep"> · </span>
                    <span className="projectswitcher__n">{p.concepts}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// Two-letter monogram for the collapsed rail — first alphanumerics of the id,
// e.g. "demo-bio" → "DB", "bio" → "BI".
function initials(id: string): string {
  const parts = id.split(/[-_\s]+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return (id.slice(0, 2) || '··').toUpperCase()
}
