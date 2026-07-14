import type { GraphData, Project } from './types'

const BASE = (import.meta.env.VITE_API_BASE ?? 'https://synapvox-graphiti.onrender.com').replace(/\/$/, '')
const KEY = import.meta.env.VITE_API_KEY ?? 'demo-bio'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** A non-2xx API response. `status` lets callers special-case caps/limits
 * (413 too long, 429 limit reached) vs. generic failure; `message` carries the
 * backend's `detail` when present. */
export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function req(path: string, opts: RequestInit = {}, method = 'GET'): Promise<Response> {
  const backoff = [400, 1000, 2000]
  for (let a = 0; ; a++) {
    if (a > 0) await sleep(backoff[a - 1])
    let r: Response
    try {
      r = await fetch(`${BASE}${path}`, {
        ...opts,
        method,
        headers: { 'X-API-Key': KEY, ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...opts.headers },
      })
    } catch (e) {
      if (method === 'GET' && a < backoff.length) continue
      throw e
    }
    const edgeDown = r.status === 404 && r.headers.get('x-render-routing') === 'no-server'
    if ((edgeDown || (method === 'GET' && r.status >= 502)) && a < backoff.length) continue
    return r
  }
}

/** Parse a JSON body, but REJECT (throw ApiError) on any non-2xx — so a failed
 * ingest never resolves and lets the UI navigate to a broken workspace, and
 * reads never silently consume an error-shaped payload. */
async function jsonOrThrow(r: Response): Promise<unknown> {
  if (r.ok) return r.json()
  let detail = ''
  try {
    const body = (await r.json()) as { detail?: string }
    detail = typeof body?.detail === 'string' ? body.detail : ''
  } catch {
    /* non-JSON error body */
  }
  throw new ApiError(r.status, detail || `요청에 실패했습니다 (${r.status})`)
}

export async function listProjects(): Promise<Project[]> {
  const body = (await jsonOrThrow(await req('/projects'))) as { projects?: Project[] }
  return Array.isArray(body?.projects) ? body.projects : []
}

export async function getGraph(project: string): Promise<GraphData> {
  return (await jsonOrThrow(await req(`/graph?project=${encodeURIComponent(project)}`))) as GraphData
}

export async function ask(project: string, q: string): Promise<{ answer: string }> {
  return (await jsonOrThrow(await req(`/ask?project=${encodeURIComponent(project)}&q=${encodeURIComponent(q)}&k=6`))) as {
    answer: string
  }
}

export async function ingestText(project: string, title: string, text: string): Promise<unknown> {
  return jsonOrThrow(await req('/ingest-text', { body: JSON.stringify({ project, title, text }) }, 'POST'))
}
