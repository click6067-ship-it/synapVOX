// Shared projects hook — lists projects (딥러닝/생명과학/머신러닝 …) for the
// dashboard shelf + the sidebar. reload() re-fetches after an ingest/new project.
import { useCallback, useEffect, useState } from 'react'
import { listProjects } from '../api/client'
import type { Project } from '../api/types'
import { rememberProjectNames } from '../graph/projectMeta'

export function useProjects(): {
  projects: Project[]
  loading: boolean
  error: string | null
  reload(): void
} {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    listProjects()
      .then((p) => {
        if (cancelled) return
        const list = Array.isArray(p) ? p : []
        rememberProjectNames(list) // so projectLabel(id) resolves names app-wide
        setProjects(list)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setError('프로젝트를 불러오지 못했습니다.')
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { projects, loading, error, reload }
}
