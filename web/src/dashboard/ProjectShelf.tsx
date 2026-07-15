// ProjectShelf — the all-projects overview. One flat paper card per project
// (딥러닝/생명과학/머신러닝): friendly label, mono `세션 N · 개념 M` stats, up to
// two recent 단원 titles (from a light useOutline), and `열기` / `그래프 보기`.
// Each card is its own component so it can call useOutline once per instance
// (hooks stay unconditional) — a fetch failure just degrades to stats only.
import type { JSX } from 'react'
import type { Project } from '../api/types'
import { projectLabel } from '../graph/projectMeta'
import { useOutline } from '../data/useOutline'

export default function ProjectShelf(props: {
  projects: Project[]
  onOpen(project: string): void
  onGraph(project: string): void
}): JSX.Element {
  const { projects, onOpen, onGraph } = props
  return (
    <section className="shelf" aria-label="과목">
      <h2 className="shelf__head">정리된 과목 <span className="shelf__count">{projects.length}</span></h2>
      <ul className="shelf__grid">
        {projects.map((p) => (
          <ShelfCard
            key={p.project}
            project={p}
            onOpen={() => onOpen(p.project)}
            onGraph={() => onGraph(p.project)}
          />
        ))}
      </ul>
    </section>
  )
}

function ShelfCard(props: { project: Project; onOpen(): void; onGraph(): void }): JSX.Element {
  const { project, onOpen, onGraph } = props
  const { units } = useOutline(project.project)
  // "Recent" = the highest-seq 단원 (units come sorted ascending by seq).
  const recent = units.slice(-2).reverse()

  return (
    <li className="card">
      <button type="button" className="card__open-hit" onClick={onOpen} aria-label={`${projectLabel(project.project)} 열기`}>
        <h3 className="card__label">{projectLabel(project.project)}</h3>
        <p className="card__stats">
          세션 {project.sessions} · 개념 {project.concepts}
        </p>
      </button>

      {recent.length > 0 ? (
        <ul className="card__units">
          {recent.map((u) => (
            <li key={u.id} className="card__unit">
              <span className="card__unit-seq">{u.seq}단원</span>
              <span className="card__unit-label">{u.label}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="card__units card__units--empty">아직 정리된 단원이 없어요</p>
      )}

      <div className="card__actions">
        <button type="button" className="card__open" onClick={onOpen}>
          열기
        </button>
        <button type="button" className="card__graph" onClick={onGraph}>
          그래프 보기
        </button>
      </div>
    </li>
  )
}
