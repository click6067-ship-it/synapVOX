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

// /concept/{id}·/session/{id} 상세 — 백엔드(engine.concept_detail/session_detail)
// 응답을 client의 normalizer가 이 형태로 정규화한다(키 이름 차이 흡수):
//   concept: sessions[].session_id → sid, evidence 필드 제거.
//   session: concepts[].concept_id → id, text = segments[].text(없으면 summary).
export type ConceptDetail = {
  concept_id: string
  label: string
  summary: string | null
  sessions: { sid: string; title: string; snippet?: string }[]
}

export type SessionDetail = {
  session_id: string
  title: string
  text?: string
  concepts: { id: string; label: string }[]
}
