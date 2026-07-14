// Four quick actions below the CreateInput (Daglo-style action row).
// "텍스트로 추가"/"딥러닝 샘플 불러오기"/"그래프 보기" are wired to real behavior;
// the 4th is a clearly-marked coming-soon: "전역 검색" (cross-project search),
// deliberately NOT "AI 질문" — per-project chat already works in the workspace,
// so a disabled copy of it here would read as "chat is unavailable".

function IconTextAdd() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d="M6 4h9l3 3v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M9 13h6M12 10v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
function IconSample() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path d="M10 3h4M11 3v5.2L6.2 18a1.6 1.6 0 0 0 1.5 2.3h8.6a1.6 1.6 0 0 0 1.5-2.3L13 8.2V3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8.4 14.5h7.2" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}
function IconGraphView() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <circle cx="6" cy="17" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="18" cy="7" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="16" cy="18" r="1.8" fill="currentColor" />
      <path d="M8 16 L14 12.5 M16.3 16.3 L17.4 9.4" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}
function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <circle cx="11" cy="11" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M15.5 15.5 L20 20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

type Props = {
  onAddText: () => void
  onLoadSample: () => void
  onViewGraph: () => void
}

function ActionTiles({ onAddText, onLoadSample, onViewGraph }: Props) {
  return (
    <div className="action-tiles" role="group" aria-label="빠른 작업">
      <button type="button" className="action-tile" onClick={onAddText}>
        <span className="action-tile-icon">
          <IconTextAdd />
        </span>
        <span className="action-tile-label">텍스트로 추가</span>
      </button>
      <button type="button" className="action-tile" onClick={onLoadSample}>
        <span className="action-tile-icon action-tile-icon--sess">
          <IconSample />
        </span>
        <span className="action-tile-label">딥러닝 샘플 불러오기</span>
      </button>
      <button type="button" className="action-tile" onClick={onViewGraph}>
        <span className="action-tile-icon action-tile-icon--conc">
          <IconGraphView />
        </span>
        <span className="action-tile-label">그래프 보기</span>
      </button>
      <button type="button" className="action-tile action-tile--placeholder" disabled title="곧 제공">
        <span className="action-tile-icon">
          <IconSearch />
        </span>
        <span className="action-tile-label">
          전역 검색 <span className="soon-badge">곧</span>
        </span>
      </button>
    </div>
  )
}

export default ActionTiles
