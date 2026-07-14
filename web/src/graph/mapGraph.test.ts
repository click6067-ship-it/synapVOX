import { describe, it, expect } from 'vitest'
import { mapGraph } from './mapGraph'
import type { GraphData } from '../api/types'

const raw: GraphData = {
  nodes: [
    { id: 's1', type: 'session', label: 'S1', meta: { seq: 1 } },
    { id: 's2', type: 'session', label: 'S2', meta: { seq: 2 } },
    { id: 'c1', type: 'concept', label: 'Bridge', meta: {} },
    { id: 'c2', type: 'concept', label: 'Solo', meta: {} },
    { id: 'c3', type: 'concept', label: 'UnknownRelTouched', meta: {} },
    { id: 'c4', type: 'concept', label: 'MalformedMentionTouched', meta: {} },
  ],
  edges: [
    { src: 's1', dst: 'c1', rel_type: 'SESSION_MENTIONS_CONCEPT', concept_id: 'c1', concept_label: 'Bridge', weight: 1 },
    { src: 's2', dst: 'c1', rel_type: 'SESSION_MENTIONS_CONCEPT', concept_id: 'c1', concept_label: 'Bridge', weight: 1 },
    { src: 's1', dst: 'c2', rel_type: 'SESSION_MENTIONS_CONCEPT', concept_id: 'c2', concept_label: 'Solo', weight: 1 },
    { src: 'c1', dst: 'c2', rel_type: 'CONCEPT_CO_OCCURS_WITH', concept_id: null, concept_label: null, weight: 2 },
    { src: 's1', dst: 's2', rel_type: 'NEXT_SESSION', concept_id: null, concept_label: null, weight: 1 },
    { src: 's1', dst: 's2', rel_type: 'BOGUS_UNKNOWN', concept_id: null, concept_label: null, weight: 1 },
    // c3 has exactly one real, rendered mention (from s2) ...
    { src: 's2', dst: 'c3', rel_type: 'SESSION_MENTIONS_CONCEPT', concept_id: 'c3', concept_label: 'UnknownRelTouched', weight: 1 },
    // ... plus an edge with an unknown rel_type that also touches c3. This
    // must be dropped from `links` and MUST NOT inflate c3's degree/r.
    { src: 'c3', dst: 'c1', rel_type: 'BOGUS_UNKNOWN_C3', concept_id: null, concept_label: null, weight: 1 },
    // Malformed SESSION_MENTIONS_CONCEPT edge: neither endpoint is a
    // session. Still a known rel_type (rendered, counts toward degree) but
    // must NOT be attributed as a mention to either side (no misattribution).
    { src: 'c2', dst: 'c4', rel_type: 'SESSION_MENTIONS_CONCEPT', concept_id: null, concept_label: null, weight: 1 },
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
    // c2 degree = 1 mention (s1) + 1 cooccur + 1 malformed mention (c2->c4,
    //   still rendered/counted for degree even though skipped for bridge
    //   attribution) = 3 -> 7 + 2.1 = 9.1
    expect(byId('c1').r).toBeCloseTo(9.1)
    expect(byId('c2').r).toBeCloseTo(9.1)
  })

  it('does not inflate a concept degree/r from an edge dropped for unknown rel_type', () => {
    // c3 has exactly one known/rendered edge (mention from s2). It is also
    // touched by an edge with an unknown rel_type (c3 -> c1) that must be
    // dropped from `links` — and therefore must NOT count toward c3's degree.
    const c3Links = links.filter((l) => l.from === 'c3' || l.to === 'c3')
    expect(c3Links.length).toBe(1)
    expect(byId('c3').r).toBeCloseTo(7.7) // deg=1 -> 7 + 0.7
  })

  it('does not misattribute a SESSION_MENTIONS_CONCEPT mention when neither endpoint is a session', () => {
    // c2 -> c4 is malformed (neither endpoint is a session) and must be
    // skipped for mention-direction attribution, even though the edge is
    // still rendered (known rel_type) and counts toward degree above.
    expect(byId('c2').bridge).toBe(false) // still only 1 real session mention (s1)
    expect(byId('c4').bridge).toBe(false) // never legitimately mentioned by a session
  })

  it('carries session type/seq through', () => {
    expect(byId('s1').type).toBe('session')
    expect(byId('s1').seq).toBe(1)
    expect(byId('c1').type).toBe('concept')
  })

  it('maps rel_type -> relClass and drops unknown relations', () => {
    expect(links.find((l) => l.rel === 'NEXT_SESSION')!.relClass).toBe('next')
    expect(links.find((l) => l.rel === 'CONCEPT_CO_OCCURS_WITH')!.relClass).toBe('cooccur')
    expect(links.filter((l) => l.relClass === 'mentions').length).toBe(5)
    expect(links.some((l) => l.rel === 'BOGUS_UNKNOWN')).toBe(false)
    expect(links.some((l) => l.rel === 'BOGUS_UNKNOWN_C3')).toBe(false)
    expect(links.length).toBe(7) // 9 edges - 2 unknown
  })
})
