// AppShell — 3-zone layout frame for "Archive Graph Studio":
//   paper sidebar (280px, collapsed 64px) │ graph canvas (hero, --canvas) │
//   paper detail drawer (360px when present, else 0).
// The chrome↔canvas boundary is the "제본선" (2px ink border on the canvas
// column edges). Full viewport, no page scroll. Below 900px the sidebar becomes
// an off-canvas overlay (hamburger-toggled) and the drawer a bottom sheet.
// Structure only — real content is injected via props.
import { useState } from 'react'
import type { JSX, ReactNode } from 'react'
import './appshell.css'

export function AppShell(props: {
  sidebar: ReactNode
  canvas: ReactNode
  drawer?: ReactNode // right drawer; null/undefined = closed (canvas takes its space)
  sidebarCollapsed: boolean
}): JSX.Element {
  const { sidebar, canvas, drawer, sidebarCollapsed } = props

  // Mobile off-canvas state — deliberately independent of sidebarCollapsed
  // (collapse is a desktop width mode; mobileOpen is the overlay toggle).
  const [mobileOpen, setMobileOpen] = useState(false)

  const className = [
    'appshell',
    sidebarCollapsed ? 'appshell--sidebar-collapsed' : '',
    drawer != null ? 'appshell--has-drawer' : '',
    mobileOpen ? 'appshell--mobile-open' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={className}>
      {/* Mobile hamburger placeholder — toggles the off-canvas sidebar */}
      <button
        type="button"
        className="appshell__hamburger"
        aria-label={mobileOpen ? '메뉴 닫기' : '메뉴 열기'}
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen((v) => !v)}
      >
        ≡
      </button>

      {/* Mobile backdrop — tap to dismiss the sidebar overlay */}
      <div
        className="appshell__backdrop"
        aria-hidden="true"
        onClick={() => setMobileOpen(false)}
      />

      <aside className="appshell__sidebar">{sidebar}</aside>

      <section className="appshell__canvas">{canvas}</section>

      <aside className="appshell__drawer">{drawer}</aside>
    </div>
  )
}
