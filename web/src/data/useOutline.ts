// Project outline hook — fetches a project's graph and derives the
// 단원(session) → 개념 outline for the dashboard. Cold-start tolerant.
import { useEffect, useState } from 'react'
import { getGraph } from '../api/client'
import { mapGraph } from '../graph/mapGraph'
import { buildOutline, type OutlineUnit } from '../graph/buildOutline'

export function useOutline(project: string): {
  units: OutlineUnit[]
  loading: boolean
  error: string | null
  stats: { sessions: number; concepts: number }
} {
  const [units, setUnits] = useState<OutlineUnit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState({ sessions: 0, concepts: 0 })

  useEffect(() => {
    if (!project) {
      setUnits([])
      setStats({ sessions: 0, concepts: 0 })
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    getGraph(project)
      .then((raw) => {
        if (cancelled) return
        const mapped = mapGraph(raw)
        setUnits(buildOutline(mapped))
        setStats({
          sessions: mapped.nodes.filter((n) => n.type === 'session').length,
          concepts: mapped.nodes.filter((n) => n.type === 'concept').length,
        })
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setError('그래프를 불러오지 못했습니다.')
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [project])

  return { units, loading, error, stats }
}
