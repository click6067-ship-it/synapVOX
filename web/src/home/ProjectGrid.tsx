// Recent-projects grid. Self-contained: fetches listProjects on mount and owns
// its own loading/error/empty states so a cold Render backend (client.ts's
// retry/backoff) just shows as "불러오는 중…" for a few extra seconds.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listProjects } from '../api/client'
import type { Project } from '../api/types'

type State = { status: 'loading' } | { status: 'error' } | { status: 'ready'; projects: Project[] }

function ProjectGrid() {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [retryTick, setRetryTick] = useState(0)
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    listProjects()
      .then((projects) => {
        // Defensive: the API can 404 with a valid-but-unexpected JSON body
        // (e.g. {"detail":"Not Found"} on a route/deploy mismatch) without
        // rejecting the promise. Don't mistake that shape for "no projects yet".
        if (cancelled) return
        if (Array.isArray(projects)) setState({ status: 'ready', projects })
        else setState({ status: 'error' })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [retryTick])

  if (state.status === 'loading') {
    return <p className="project-grid-status">최근 프로젝트를 불러오는 중…</p>
  }

  if (state.status === 'error') {
    return (
      <div className="project-grid-status">
        <p>프로젝트를 불러오지 못했습니다.</p>
        <button type="button" className="project-grid-retry" onClick={() => setRetryTick((t) => t + 1)}>
          다시 시도
        </button>
      </div>
    )
  }

  if (state.projects.length === 0) {
    return <p className="project-grid-status project-grid-empty">아직 프로젝트가 없어요. 위에 텍스트를 붙여넣어 첫 지식 그래프를 만들어 보세요.</p>
  }

  return (
    <div className="project-grid">
      {state.projects.map((p) => (
        <button key={p.project} type="button" className="project-card" onClick={() => navigate(`/p/${p.project}`)}>
          <span className="project-card-name">{p.project}</span>
          <span className="project-card-meta">
            <span>세션 {p.sessions}</span>
            <span className="project-card-dot" aria-hidden="true" />
            <span>개념 {p.concepts}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

export default ProjectGrid
