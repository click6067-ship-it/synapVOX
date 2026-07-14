// 백엔드(/graph, /projects) 응답 형식 — gsvx/engine.py graph()/list_projects() 그대로 매핑.

export type Project = { project: string; sessions: number; concepts: number }

export type RawNode = {
  id: string
  type: string
  label: string
  meta: Record<string, unknown>
}

export type RawEdge = {
  src: string
  dst: string
  rel_type: string
  concept_id: string | null
  concept_label: string | null
  weight: number
}

export type GraphData = { nodes: RawNode[]; edges: RawEdge[] }
