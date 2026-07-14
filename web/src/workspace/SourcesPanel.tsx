// Left column: the project's sessions (강의). Session nodes come from the graph
// that GraphCanvas loaded, handed down by Workspace. Clicking a card selects
// that session (Workspace highlights it in the detail + active state here).
import type { GraphNode } from '../graph/mapGraph'

type Props = {
  sessions: GraphNode[]
  onSelectSource: (id: string) => void
  selectedId?: string | null
}

function SourcesPanel({ sessions, onSelectSource, selectedId }: Props) {
  const ordered = [...sessions].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))

  return (
    <div className="sources-panel">
      <div className="sources-head">
        <h2 className="sources-title">강의</h2>
        <span className="sources-count">{ordered.length}</span>
      </div>

      {ordered.length === 0 ? (
        <p className="sources-empty">아직 강의가 없습니다. 가운데에서 “텍스트로 추가”로 첫 강의를 넣어 보세요.</p>
      ) : (
        <ul className="sources-list">
          {ordered.map((s, i) => {
            const active = s.id === selectedId
            const seq = s.seq ?? i + 1
            return (
              <li key={s.id}>
                <button
                  type="button"
                  className={`source-card${active ? ' source-card--active' : ''}`}
                  onClick={() => onSelectSource(s.id)}
                  aria-pressed={active}
                >
                  <span className="source-seq">{seq}</span>
                  <span className="source-label" title={s.label}>
                    {s.label}
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

export default SourcesPanel
