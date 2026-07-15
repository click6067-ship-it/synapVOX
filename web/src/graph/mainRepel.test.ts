import { describe, it, expect } from 'vitest'
import { makeMainRepel, MAIN_SEPARATION, type SimNode } from './mainRepel'

function hub(id: string, x: number, y: number, extra: Partial<SimNode> = {}): SimNode {
  return { id, type: 'main', label: id, bridge: false, degree: 0, neighbors: new Set(), x, y, vx: 0, vy: 0, ...extra }
}

// Apply the force once and return the nodes (mutated with vx/vy).
function tick(nodes: SimNode[], alpha = 1): SimNode[] {
  const force = makeMainRepel() as unknown as ((a: number) => void) & { initialize: (n: SimNode[]) => void }
  force.initialize(nodes)
  force(alpha)
  return nodes
}

describe('makeMainRepel', () => {
  it('pushes two free hubs apart when closer than MAIN_SEPARATION', () => {
    const a = hub('A', 0, 0)
    const b = hub('B', 100, 0) // 100 << 1300 → should repel
    tick([a, b])
    expect(a.vx).toBeLessThan(0) // A pushed toward -x (away from B)
    expect(b.vx).toBeGreaterThan(0) // B pushed toward +x (away from A)
  })

  it('does NOT move a free hub when its counterpart is being dragged/pinned (fx set)', () => {
    // A is held by the user near B; B must stay put (the reported bug).
    const a = hub('A', 90, 0, { fx: 90, fy: 0 })
    const b = hub('B', 100, 0)
    tick([a, b])
    expect(a.vx).toBe(0)
    expect(a.vy).toBe(0)
    expect(b.vx).toBe(0) // B is NOT shoved away by the held hub
    expect(b.vy).toBe(0)
  })

  it('does nothing when hubs are already beyond MAIN_SEPARATION', () => {
    const a = hub('A', 0, 0)
    const b = hub('B', MAIN_SEPARATION + 10, 0)
    tick([a, b])
    expect(a.vx).toBe(0)
    expect(b.vx).toBe(0)
  })

  it('ignores non-main nodes entirely', () => {
    const concept = hub('c', 0, 0)
    concept.type = 'concept'
    const session = hub('s', 50, 0)
    session.type = 'session'
    tick([concept, session])
    expect(concept.vx).toBe(0)
    expect(session.vx).toBe(0)
  })
})
