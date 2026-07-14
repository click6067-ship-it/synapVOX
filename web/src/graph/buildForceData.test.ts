import { describe, it, expect } from 'vitest'
import { buildForceData } from './buildForceData'
import type { GraphNode, GraphLink } from './mapGraph'

const nodes: GraphNode[] = [
  { id: 'a', type: 'session', label: 'A', r: 10, seq: 1, bridge: false },
  { id: 'b', type: 'concept', label: 'B', r: 9, bridge: false },
  { id: 'c', type: 'concept', label: 'C', r: 9, bridge: true },
]

const links: GraphLink[] = [
  { from: 'a', to: 'b', rel: 'SESSION_MENTIONS_CONCEPT', relClass: 'mentions' },
  { from: 'a', to: 'c', rel: 'SESSION_MENTIONS_CONCEPT', relClass: 'mentions' },
  { from: 'b', to: 'c', rel: 'CONCEPT_CO_OCCURS_WITH', relClass: 'cooccur' },
]

describe('buildForceData', () => {
  const { nodes: fnodes, links: flinks } = buildForceData({ nodes, links })
  const byId = (id: string) => fnodes.find((n) => n.id === id)!

  it('computes degree = count of incident links per node', () => {
    expect(byId('a').degree).toBe(2) // a-b, a-c
    expect(byId('b').degree).toBe(2) // a-b, b-c
    expect(byId('c').degree).toBe(2) // a-c, b-c
  })

  it('precomputes neighbors as a Set of adjacent ids (both directions)', () => {
    expect(byId('a').neighbors).toEqual(new Set(['b', 'c']))
    expect(byId('b').neighbors).toEqual(new Set(['a', 'c']))
    expect(byId('c').neighbors).toEqual(new Set(['a', 'b']))
  })

  it('carries node fields through (type/label/seq/bridge)', () => {
    expect(byId('a').type).toBe('session')
    expect(byId('a').label).toBe('A')
    expect(byId('a').seq).toBe(1)
    expect(byId('c').bridge).toBe(true)
  })

  it('maps links to {source, target, relClass}', () => {
    expect(flinks).toEqual([
      { source: 'a', target: 'b', relClass: 'mentions' },
      { source: 'a', target: 'c', relClass: 'mentions' },
      { source: 'b', target: 'c', relClass: 'cooccur' },
    ])
  })

  it('starts every node with degree 0 / empty neighbors before links (no leftover state)', () => {
    const isolated = buildForceData({
      nodes: [{ id: 'x', type: 'concept', label: 'X', r: 9, bridge: false }],
      links: [],
    })
    expect(isolated.nodes[0].degree).toBe(0)
    expect(isolated.nodes[0].neighbors).toEqual(new Set())
  })
})
