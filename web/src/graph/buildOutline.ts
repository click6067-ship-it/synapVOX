// Pure transform: mapGraph output -> dashboard outline (Project → 단원 → 개념).
// 단원 = 세션 (decided): units are the session nodes, sorted by seq. Each
// unit's concepts are the concept endpoints of 'mentions' links whose OTHER
// endpoint is that session. No DOM/React — unit-testable.

import type { GraphNode, GraphLink } from './mapGraph'

export type OutlineConcept = { id: string; label: string; bridge: boolean }
export type OutlineUnit = { id: string; seq: number; label: string; concepts: OutlineConcept[] }

export function buildOutline(mapped: { nodes: GraphNode[]; links: GraphLink[] }): OutlineUnit[] {
  // Index every node by id so link endpoints (which are string ids on the
  // mapGraph output, before react-force-graph mutates them into node objects)
  // resolve to a concrete node — and its type/label/bridge.
  const byId: Record<string, GraphNode> = {}
  for (const n of mapped.nodes) byId[n.id] = n

  const sessions = mapped.nodes.filter((n) => n.type === 'session')

  // session id -> ordered, deduped concept list it mentions.
  const conceptsBySession: Record<string, OutlineConcept[]> = {}
  const seenBySession: Record<string, Set<string>> = {}
  for (const s of sessions) {
    conceptsBySession[s.id] = []
    seenBySession[s.id] = new Set()
  }

  for (const l of mapped.links) {
    if (l.relClass !== 'mentions') continue
    // Determine which endpoint is a known session and which is the concept.
    // A well-formed mention has exactly one session endpoint.
    const fromNode = byId[l.from]
    const toNode = byId[l.to]
    const fromIsSession = fromNode?.type === 'session'
    const toIsSession = toNode?.type === 'session'
    if (fromIsSession === toIsSession) continue // neither/both sessions → not a clean mention

    const sessionId = fromIsSession ? l.from : l.to
    const conceptNode = fromIsSession ? toNode : fromNode
    if (!conceptNode || conceptNode.type !== 'concept') continue
    if (!(sessionId in conceptsBySession)) continue

    const seen = seenBySession[sessionId]
    if (seen.has(conceptNode.id)) continue // dedup per unit
    seen.add(conceptNode.id)
    conceptsBySession[sessionId].push({
      id: conceptNode.id,
      label: conceptNode.label,
      bridge: conceptNode.bridge,
    })
  }

  return sessions
    .map((s) => ({
      id: s.id,
      seq: s.seq ?? 0, // fall back to 0 when the session carries no seq
      label: s.label,
      concepts: conceptsBySession[s.id],
    }))
    .sort((a, b) => a.seq - b.seq)
}
