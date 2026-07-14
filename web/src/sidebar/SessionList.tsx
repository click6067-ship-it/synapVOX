// SessionList — the sidebar's stack of "lecture slips": flat paper labels, one
// per ingested session, in reading order. Each slip = a session-red filing tab
// + seq number (mono) + lecture title. Hovering a slip drives the graph
// highlight (onHoverSession(id)); leaving clears it (onHoverSession(null)).
// Collapsed → the slips shrink to a column of session-red dots (title on hover).
import type { JSX } from 'react'
import './sidebar.css'

export type SidebarSession = { id: string; seq?: number; label: string }

export function SessionList(props: {
  sessions: SidebarSession[]
  collapsed: boolean
  onHoverSession(id: string | null): void
}): JSX.Element {
  const { sessions, collapsed, onHoverSession } = props

  if (sessions.length === 0) {
    return collapsed ? (
      <div className="sessionlist sessionlist--collapsed" aria-label="세션 없음" />
    ) : (
      <div className="sessionlist">
        <p className="sessionlist__empty">아직 강의가 없습니다.</p>
      </div>
    )
  }

  if (collapsed) {
    return (
      <ul className="sessionlist sessionlist--collapsed" aria-label="세션 목록">
        {sessions.map((s) => (
          <li key={s.id} className="sessionlist__dotwrap">
            <span
              className="slip__dot"
              title={s.seq != null ? `${s.seq}. ${s.label}` : s.label}
              onMouseEnter={() => onHoverSession(s.id)}
              onMouseLeave={() => onHoverSession(null)}
            />
          </li>
        ))}
      </ul>
    )
  }

  return (
    <ul className="sessionlist" aria-label="세션 목록">
      {sessions.map((s) => (
        <li
          key={s.id}
          className="slip"
          onMouseEnter={() => onHoverSession(s.id)}
          onMouseLeave={() => onHoverSession(null)}
          onFocus={() => onHoverSession(s.id)}
          onBlur={() => onHoverSession(null)}
          tabIndex={0}
        >
          <span className="slip__seq">{s.seq != null ? String(s.seq).padStart(2, '0') : '—'}</span>
          <span className="slip__label" title={s.label}>
            {s.label}
          </span>
        </li>
      ))}
    </ul>
  )
}
