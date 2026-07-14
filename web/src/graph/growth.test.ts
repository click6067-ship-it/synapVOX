import { describe, it, expect } from 'vitest'
import { mergeSubgraph, ANCHOR_JITTER } from './growth'
import type { FNode, FLink } from './buildForceData'

// Build an FNode with an already-settled position (as if d3-force had run) so we
// can prove existing nodes keep both their identity AND their coordinates.
function fnode(id: string, type: 'session' | 'concept', x?: number, y?: number): FNode {
  return { id, type, label: id.toUpperCase(), bridge: false, degree: 0, neighbors: new Set(), x, y }
}

describe('mergeSubgraph', () => {
  it('merges a new node without relayout: keeps existing OBJECTS + seeds new near anchor', () => {
    // existing {a,b} already laid out; a-b link between them
    const existingA = fnode('a', 'session', 100, 50)
    const existingB = fnode('b', 'concept', 140, 70)
    const existing = {
      nodes: [existingA, existingB],
      links: [{ source: 'a', target: 'b', relClass: 'mentions' } as FLink],
    }
    // give the reused objects live velocity too — must survive the merge untouched
    ;(existingA as unknown as { vx: number; vy: number }).vx = 0.3
    ;(existingA as unknown as { vx: number; vy: number }).vy = -0.2

    // incoming adds c, linked to existing a
    const incoming = {
      nodes: [fnode('c', 'concept')],
      links: [{ source: 'a', target: 'c', relClass: 'mentions' } as FLink],
    }

    const result = mergeSubgraph(existing, incoming)

    // 3 nodes total
    expect(result.nodes).toHaveLength(3)

    // CRITICAL: the a/b nodes are the SAME references (d3 preserves x/y/vx/vy).
    expect(result.nodes.find((n) => n.id === 'a')).toBe(existingA)
    expect(result.nodes.find((n) => n.id === 'b')).toBe(existingB)
    // and their coordinates + velocity are untouched
    const a = result.nodes.find((n) => n.id === 'a')!
    expect(a.x).toBe(100)
    expect(a.y).toBe(50)
    expect((a as unknown as { vx: number }).vx).toBe(0.3)

    // the new node c is a distinct object seeded near its anchor a (±jitter)
    const c = result.nodes.find((n) => n.id === 'c')!
    expect(c).not.toBe(incoming.nodes[0]) // fresh insert, not the caller's object
    expect(Number.isFinite(c.x)).toBe(true)
    expect(Number.isFinite(c.y)).toBe(true)
    expect(Math.abs((c.x as number) - 100)).toBeLessThanOrEqual(ANCHOR_JITTER)
    expect(Math.abs((c.y as number) - 50)).toBeLessThanOrEqual(ANCHOR_JITTER)

    // reported deltas
    expect(result.addedNodeIds).toEqual(['c'])
    expect(result.anchorId).toBe('a')
  })

  it('recomputes degree + neighbors across the merged links (hover/LOD stay correct)', () => {
    const a = fnode('a', 'session', 0, 0)
    const b = fnode('b', 'concept', 10, 0)
    const existing = {
      nodes: [a, b],
      links: [{ source: 'a', target: 'b', relClass: 'mentions' } as FLink],
    }
    const incoming = {
      nodes: [fnode('c', 'concept')],
      links: [{ source: 'a', target: 'c', relClass: 'cooccur' } as FLink],
    }
    const result = mergeSubgraph(existing, incoming)
    const byId = (id: string) => result.nodes.find((n) => n.id === id)!
    expect(byId('a').degree).toBe(2) // a-b, a-c
    expect(byId('b').degree).toBe(1)
    expect(byId('c').degree).toBe(1)
    expect(byId('a').neighbors).toEqual(new Set(['b', 'c']))
    expect(byId('c').neighbors).toEqual(new Set(['a']))
  })

  it('dedupes re-sent nodes and links (idempotent re-merge does not grow the graph)', () => {
    const a = fnode('a', 'session', 0, 0)
    const b = fnode('b', 'concept', 10, 0)
    const existing = {
      nodes: [a, b],
      links: [{ source: 'a', target: 'b', relClass: 'mentions' } as FLink],
    }
    // incoming re-includes a (the anchor session) and the same a-b link
    const incoming = {
      nodes: [a, fnode('b', 'concept')],
      links: [{ source: 'a', target: 'b', relClass: 'mentions' } as FLink],
    }
    const result = mergeSubgraph(existing, incoming)
    expect(result.nodes).toHaveLength(2)
    expect(result.links).toHaveLength(1)
    expect(result.addedNodeIds).toEqual([])
    // existing objects preserved
    expect(result.nodes.find((n) => n.id === 'a')).toBe(a)
    expect(result.nodes.find((n) => n.id === 'b')).toBe(b)
  })

  it('seeds an orphan new node (no link to an existing node) near the graph centroid', () => {
    const a = fnode('a', 'session', 100, 100)
    const b = fnode('b', 'concept', 200, 200)
    const existing = { nodes: [a, b], links: [] as FLink[] }
    const incoming = { nodes: [fnode('z', 'concept')], links: [] as FLink[] }
    const result = mergeSubgraph(existing, incoming)
    const z = result.nodes.find((n) => n.id === 'z')!
    // centroid of (100,100),(200,200) = (150,150); seeded within jitter of it
    expect(Math.abs((z.x as number) - 150)).toBeLessThanOrEqual(ANCHOR_JITTER)
    expect(Math.abs((z.y as number) - 150)).toBeLessThanOrEqual(ANCHOR_JITTER)
    expect(result.anchorId).toBeNull() // no existing endpoint to anchor to
  })

  it('normalizes post-sim object endpoints (source/target may be node objects) to ids', () => {
    const a = fnode('a', 'session', 0, 0)
    const b = fnode('b', 'concept', 10, 0)
    // after the sim runs, react-force-graph replaces source/target with objects
    const existing = {
      nodes: [a, b],
      links: [{ source: a, target: b, relClass: 'mentions' } as unknown as FLink],
    }
    const incoming = {
      nodes: [fnode('c', 'concept')],
      links: [{ source: 'a', target: 'c', relClass: 'cooccur' } as FLink],
    }
    const result = mergeSubgraph(existing, incoming)
    // c anchors to a even though the a-b link stored objects, not ids
    expect(result.anchorId).toBe('a')
    expect(result.nodes.find((n) => n.id === 'a')!.degree).toBe(2)
  })
})
