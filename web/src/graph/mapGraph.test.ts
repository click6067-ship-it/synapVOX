import { describe, it, expect } from 'vitest'
import { mapGraph } from './mapGraph'
import type { GraphData } from '../api/types'

const raw: GraphData = {
  nodes: [
    { id: 's1', type: 'session', label: 'S1', meta: { seq: 1 } },
    { id: 's2', type: 'session', label: 'S2', meta: { seq: 2 } },
    { id: 'c1', type: 'concept', label: 'Bridge', meta: {} },
    { id: 'c2', type: 'concept', label: 'Solo', meta: {} },
  ],
  edges: [
    { src: 's1', dst: 'c1', rel_type: 'SESSION_MENTIONS_CONCEPT', concept_id: 'c1', concept_label: 'Bridge', weight: 1 },
    { src: 's2', dst: 'c1', rel_type: 'SESSION_MENTIONS_CONCEPT', concept_id: 'c1', concept_label: 'Bridge', weight: 1 },
    { src: 's1', dst: 'c2', rel_type: 'SESSION_MENTIONS_CONCEPT', concept_id: 'c2', concept_label: 'Solo', weight: 1 },
    { src: 'c1', dst: 'c2', rel_type: 'CONCEPT_CO_OCCURS_WITH', concept_id: null, concept_label: null, weight: 2 },
    { src: 's1', dst: 's2', rel_type: 'NEXT_SESSION', concept_id: null, concept_label: null, weight: 1 },
    { src: 's1', dst: 's2', rel_type: 'BOGUS_UNKNOWN', concept_id: null, concept_label: null, weight: 1 },
  ],
}

describe('mapGraph', () => {
  const { nodes, links } = mapGraph(raw)
  const byId = (id: string) => nodes.find((n) => n.id === id)!

  it('flags a concept mentioned by >=2 distinct sessions as a bridge', () => {
    expect(byId('c1').bridge).toBe(true) // s1 + s2
    expect(byId('c2').bridge).toBe(false) // s1 only
  })

  it('sizes concept radius from degree: r = min(7 + deg*0.7, 16)', () => {
    // c1 degree = 2 mentions + 1 cooccur = 3 -> 7 + 2.1 = 9.1
    // c2 degree = 1 mention + 1 cooccur = 2 -> 7 + 1.4 = 8.4
    expect(byId('c1').r).toBeCloseTo(9.1)
    expect(byId('c2').r).toBeCloseTo(8.4)
  })

  it('carries session type/seq through', () => {
    expect(byId('s1').type).toBe('session')
    expect(byId('s1').seq).toBe(1)
    expect(byId('c1').type).toBe('concept')
  })

  it('maps rel_type -> relClass and drops unknown relations', () => {
    expect(links.find((l) => l.rel === 'NEXT_SESSION')!.relClass).toBe('next')
    expect(links.find((l) => l.rel === 'CONCEPT_CO_OCCURS_WITH')!.relClass).toBe('cooccur')
    expect(links.filter((l) => l.relClass === 'mentions').length).toBe(3)
    expect(links.some((l) => l.rel === 'BOGUS_UNKNOWN')).toBe(false)
    expect(links.length).toBe(5) // 6 edges - 1 unknown
  })
})
