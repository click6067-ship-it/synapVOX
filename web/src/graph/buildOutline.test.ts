import { describe, it, expect } from 'vitest'
import { buildOutline } from './buildOutline'
import type { GraphNode, GraphLink } from './mapGraph'

// 단원 = 세션. Outline units are session nodes sorted by seq; each unit's
// concepts are the concept endpoints of 'mentions' links whose OTHER endpoint
// is that session. bridge is carried straight off the concept node.
const nodes: GraphNode[] = [
  // s2 declared BEFORE s1 to prove sort-by-seq (not input order).
  { id: 's2', type: 'session', label: '2단원 · RNN', r: 10, seq: 2, bridge: false },
  { id: 's1', type: 'session', label: '1단원 · CNN', r: 10, seq: 1, bridge: false },
  { id: 'c1', type: 'concept', label: 'Convolution', r: 8, bridge: false },
  { id: 'c2', type: 'concept', label: 'Backprop', r: 9, bridge: true }, // mentioned by s1 + s2
  { id: 'c3', type: 'concept', label: 'Sequence', r: 8, bridge: false },
  // orphan concept — mentioned by no session; must appear under no unit.
  { id: 'c9', type: 'concept', label: 'Orphan', r: 8, bridge: false },
]

const links: GraphLink[] = [
  // s1 mentions c1, c2. Mix endpoint directions to prove robustness.
  { from: 's1', to: 'c1', rel: 'SESSION_MENTIONS_CONCEPT', relClass: 'mentions' },
  { from: 'c2', to: 's1', rel: 'SESSION_MENTIONS_CONCEPT', relClass: 'mentions' },
  // s2 mentions c2, c3.
  { from: 's2', to: 'c2', rel: 'SESSION_MENTIONS_CONCEPT', relClass: 'mentions' },
  { from: 's2', to: 'c3', rel: 'SESSION_MENTIONS_CONCEPT', relClass: 'mentions' },
  // duplicate mention of c1 by s1 → must dedup to a single concept entry.
  { from: 's1', to: 'c1', rel: 'SESSION_MENTIONS_CONCEPT', relClass: 'mentions' },
  // non-mentions links must be ignored.
  { from: 's1', to: 's2', rel: 'NEXT_SESSION', relClass: 'next' },
  { from: 'c1', to: 'c2', rel: 'CONCEPT_CO_OCCURS_WITH', relClass: 'cooccur' },
]

describe('buildOutline', () => {
  const outline = buildOutline({ nodes, links })

  it('returns one unit per session, sorted by seq', () => {
    expect(outline.map((u) => u.id)).toEqual(['s1', 's2'])
    expect(outline.map((u) => u.seq)).toEqual([1, 2])
    expect(outline.map((u) => u.label)).toEqual(['1단원 · CNN', '2단원 · RNN'])
  })

  it('lists the concepts each session mentions (labels carried)', () => {
    expect(outline[0].concepts.map((c) => c.label)).toEqual(['Convolution', 'Backprop'])
    expect(outline[1].concepts.map((c) => c.label)).toEqual(['Backprop', 'Sequence'])
  })

  it('carries the bridge flag off the concept node', () => {
    const c2InS1 = outline[0].concepts.find((c) => c.id === 'c2')!
    const c2InS2 = outline[1].concepts.find((c) => c.id === 'c2')!
    expect(c2InS1.bridge).toBe(true)
    expect(c2InS2.bridge).toBe(true)
    expect(outline[0].concepts.find((c) => c.id === 'c1')!.bridge).toBe(false)
  })

  it('dedups a concept mentioned twice by the same session', () => {
    const s1c1 = outline[0].concepts.filter((c) => c.id === 'c1')
    expect(s1c1.length).toBe(1)
  })

  it('omits orphan concepts (no mentioning session)', () => {
    const allConceptIds = outline.flatMap((u) => u.concepts.map((c) => c.id))
    expect(allConceptIds).not.toContain('c9')
  })

  it('falls back to seq 0 when a session has no seq', () => {
    const noSeq = buildOutline({
      nodes: [{ id: 'sX', type: 'session', label: 'X', r: 10, bridge: false }],
      links: [],
    })
    expect(noSeq[0].seq).toBe(0)
    expect(noSeq[0].concepts).toEqual([])
  })
})
