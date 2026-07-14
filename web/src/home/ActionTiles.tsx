// Four quick actions below the CreateInput (Daglo-style action row).
// "텍스트로 추가"/"딥러닝 샘플 불러오기"/"그래프 보기" are wired to real behavior;
// "AI 질문" mirrors the Drawer's not-yet-wired placeholder (consistent, not a dead end).

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
function IconAsk() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7A2.5 2.5 0 0 1 17.5 16H10l-4.5 4v-4H6.5A2.5 2.5 0 0 1 4 13.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <text x="12" y="12.5" textAnchor="middle" fontSize="8" fill="currentColor">
        ?
      </text>
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
      <button type="button" className="action-tile action-tile--placeholder" aria-disabled="true" title="준비 중">
        <span className="action-tile-icon">
          <IconAsk />
        </span>
        <span className="action-tile-label">AI 질문</span>
      </button>
    </div>
  )
}

export default ActionTiles
