// Persistent left drawer nav (Daglo-style: dark, icon+label, collapsible, off-canvas on narrow screens).
import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'

/** Small inline-SVG icon set — no external icon library/CDN. */
function IconGraphMark() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <circle cx="6" cy="18" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="18" cy="6" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="14" cy="16" r="2" fill="currentColor" />
      <path d="M8 17 L12.4 16.4 M15.6 14.6 L17 8" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}
function IconPlusGraph() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <circle cx="7" cy="17" r="2" fill="currentColor" />
      <circle cx="16" cy="8" r="2" fill="currentColor" />
      <path d="M8.5 15.7 L14.5 9.3" stroke="currentColor" strokeWidth="1.4" />
      <path d="M18.5 4v6M15.5 7h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
function IconProjects() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <rect x="3.5" y="4" width="7" height="7" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="13.5" y="4" width="7" height="7" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="3.5" y="14" width="7" height="7" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="13.5" y="14" width="7" height="7" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}
function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <circle cx="11" cy="11" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M15.5 15.5 L20 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}
function IconUser() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <circle cx="12" cy="8.5" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5 20c1.2-3.8 4-5.6 7-5.6s5.8 1.8 7 5.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
function IconChevron({ pointingRight }: { pointingRight: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" style={{ transform: pointingRight ? 'rotate(180deg)' : undefined }}>
      <path d="M14.5 6.5 8.5 12l6 5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function IconMenu() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}
function IconClose() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function Drawer() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const navigate = useNavigate()

  const closeMobile = () => setMobileOpen(false)

  // "내 프로젝트" — 홈의 최근 프로젝트 섹션으로. "새 그래프"(홈 상단 입력)와 같은 라우트라
  // 둘 다 NavLink면 동시 active가 돼 위치 피드백이 애매해진다 → 이건 스크롤 액션으로 분리.
  const goProjects = () => {
    closeMobile()
    navigate('/')
    // 홈이 렌더된 뒤 최근 섹션으로 스크롤(다른 라우트에서 왔을 때 대비 지연).
    setTimeout(() => document.getElementById('home-recent')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
  }

  return (
    <>
      <button type="button" className="drawer-hamburger" aria-label="메뉴 열기" onClick={() => setMobileOpen(true)}>
        <IconMenu />
      </button>
      {mobileOpen && <div className="drawer-scrim" onClick={closeMobile} aria-hidden="true" />}

      <aside className={`drawer${collapsed ? ' drawer--collapsed' : ''}${mobileOpen ? ' drawer--open' : ''}`} aria-label="주 메뉴">
        <div className="drawer-top">
          <Link to="/" className="drawer-logo" onClick={closeMobile}>
            <span className="drawer-logo-mark">
              <IconGraphMark />
            </span>
            {!collapsed && <span className="drawer-logo-text">SynapVox</span>}
          </Link>
          <button type="button" className="drawer-close" aria-label="메뉴 닫기" onClick={closeMobile}>
            <IconClose />
          </button>
        </div>

        <nav className="drawer-nav">
          <NavLink
            to="/"
            end
            className={({ isActive }) => `drawer-item${isActive ? ' active' : ''}`}
            onClick={closeMobile}
            title={collapsed ? '새 그래프' : undefined}
          >
            <span className="drawer-item-icon">
              <IconPlusGraph />
            </span>
            {!collapsed && <span className="drawer-item-label">새 그래프</span>}
          </NavLink>
          <button type="button" className="drawer-item" onClick={goProjects} title={collapsed ? '내 프로젝트' : undefined}>
            <span className="drawer-item-icon">
              <IconProjects />
            </span>
            {!collapsed && <span className="drawer-item-label">내 프로젝트</span>}
          </button>
          {/* Coming-soon: cross-project search. Deliberately NOT "AI 질문" — that
              (per-project chat) already works inside the workspace, so a disabled
              copy of it here would read as "chat unavailable". */}
          <button
            type="button"
            className="drawer-item drawer-item--placeholder"
            disabled
            title={collapsed ? '전역 검색 (곧 제공)' : '곧 제공'}
          >
            <span className="drawer-item-icon">
              <IconSearch />
            </span>
            {!collapsed && (
              <span className="drawer-item-label">
                전역 검색 <span className="soon-badge">곧</span>
              </span>
            )}
          </button>
        </nav>

        <div className="drawer-bottom">
          <button
            type="button"
            className="drawer-collapse-toggle"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? '드로워 펼치기' : '드로워 접기'}
            aria-pressed={collapsed}
          >
            <IconChevron pointingRight={collapsed} />
            {!collapsed && <span className="drawer-item-label">접기</span>}
          </button>
          <button type="button" className="drawer-item drawer-item--placeholder" disabled title={collapsed ? '프로필 (곧 제공)' : '곧 제공'}>
            <span className="drawer-item-icon">
              <IconUser />
            </span>
            {!collapsed && (
              <span className="drawer-item-label">
                프로필 <span className="soon-badge">곧</span>
              </span>
            )}
          </button>
        </div>
      </aside>
    </>
  )
}

export default Drawer
