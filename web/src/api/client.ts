import type { GraphData, Project } from './types'

const BASE = (import.meta.env.VITE_API_BASE ?? 'https://synapvox-graphiti.onrender.com').replace(/\/$/, '')
const KEY = import.meta.env.VITE_API_KEY ?? 'demo-bio'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

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

export async function listProjects(): Promise<Project[]> {
  return (await (await req('/projects')).json()).projects
}

export async function getGraph(project: string): Promise<GraphData> {
  return (await req(`/graph?project=${encodeURIComponent(project)}`)).json()
}

export async function ask(project: string, q: string): Promise<{ answer: string }> {
  return (await req(`/ask?project=${encodeURIComponent(project)}&q=${encodeURIComponent(q)}&k=6`)).json()
}

export async function ingestText(project: string, title: string, text: string): Promise<unknown> {
  return (await req('/ingest-text', { body: JSON.stringify({ project, title, text }) }, 'POST')).json()
}
