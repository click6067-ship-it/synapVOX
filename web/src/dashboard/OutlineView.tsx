// OutlineView — the focused project as a 단원(session) → 개념 accordion.
// Each row: mono `${seq}단원` + title + concept count; expanding reveals the
// concepts as chips colored by graph tier (bridge = lime core, leaf = teal) and
// a `세션 원문` affordance. Clicking a chip opens the concept detail; the row
// title opens the session detail — both via the parent's useDetail wiring.
import { useState } from 'react'
import type { JSX } from 'react'
import type { OutlineUnit } from '../graph/buildOutline'

export default function OutlineView(props: {
  units: OutlineUnit[]
  loading: boolean
  error: string | null
  onSelectConcept(id: string, label: string, bridge: boolean): void
  onSelectSession(id: string, label: string): void
}): JSX.Element {
  const { units, loading, error, onSelectConcept, onSelectSession } = props

  // Open the first 단원 by default so the outline never lands fully collapsed.
  const [open, setOpen] = useState<Set<string>>(() => new Set(units[0] ? [units[0].id] : []))
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  if (loading) return <p className="outline__status">단원을 정리하는 중…</p>
  if (error) return <p className="outline__status outline__status--error">{error}</p>
  if (units.length === 0)
    return <p className="outline__status">아직 정리된 단원이 없어요. 강의를 추가하면 단원·개념이 자동으로 정리됩니다.</p>

  return (
    <section className="outline" aria-label="단원">
      <ul className="outline__list">
        {units.map((u) => {
          const isOpen = open.has(u.id)
          return (
            <li key={u.id} className="outline__unit">
              <button
                type="button"
                className="outline__row"
                aria-expanded={isOpen}
                onClick={() => toggle(u.id)}
              >
                <span className="outline__seq">{u.seq}단원</span>
                <span className="outline__label">{u.label}</span>
                <span className="outline__meta">
                  <span className="outline__count">개념 {u.concepts.length}</span>
                  <span aria-hidden="true" className="outline__caret">{isOpen ? '−' : '+'}</span>
                </span>
              </button>

              {isOpen ? (
                <div className="outline__body">
                  {u.concepts.length > 0 ? (
                    <ul className="outline__chips">
                      {u.concepts.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            className={`chip ${c.bridge ? 'chip--bridge' : 'chip--leaf'}`}
                            onClick={() => onSelectConcept(c.id, c.label, c.bridge)}
                          >
                            {c.label}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="outline__empty">추출된 개념이 없어요.</p>
                  )}
                  <button
                    type="button"
                    className="outline__session-btn"
                    onClick={() => onSelectSession(u.id, u.label)}
                  >
                    세션 원문 보기 →
                  </button>
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
