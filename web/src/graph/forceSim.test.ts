import { describe, it, expect } from 'vitest';
import { initSim, stepSim } from './forceSim';

describe('forceSim', () => {
  it('반발로 겹친 노드가 벌어진다', () => {
    const sim = initSim(
      [
        { id: 'a', type: 'concept', x: 100, y: 100, vx: 0, vy: 0, px: null, py: null },
        { id: 'b', type: 'concept', x: 101, y: 100, vx: 0, vy: 0, px: null, py: null },
      ],
      [],
    );
    const d0 = Math.hypot(sim.nodes[0].x - sim.nodes[1].x, sim.nodes[0].y - sim.nodes[1].y);
    for (let i = 0; i < 10; i++) stepSim(sim, 960, 560);
    const d1 = Math.hypot(sim.nodes[0].x - sim.nodes[1].x, sim.nodes[0].y - sim.nodes[1].y);
    expect(d1).toBeGreaterThan(d0);
  });

  it('스프링으로 링크된 노드가 서로 가까워진다', () => {
    const sim = initSim(
      [
        { id: 'a', type: 'session', x: 0, y: 280, vx: 0, vy: 0, px: null, py: null },
        { id: 'b', type: 'concept', x: 500, y: 280, vx: 0, vy: 0, px: null, py: null },
      ],
      [{ a: 0, b: 1 }],
    );
    const d0 = Math.hypot(sim.nodes[0].x - sim.nodes[1].x, sim.nodes[0].y - sim.nodes[1].y);
    for (let i = 0; i < 30; i++) stepSim(sim, 960, 560);
    const d1 = Math.hypot(sim.nodes[0].x - sim.nodes[1].x, sim.nodes[0].y - sim.nodes[1].y);
    expect(d1).toBeLessThan(d0);
  });

  it('px/py가 지정된 노드는 고정된다(핀)', () => {
    const sim = initSim(
      [
        { id: 'pinned', type: 'session', x: 400, y: 200, vx: 0, vy: 0, px: 400, py: 200 },
        { id: 'free', type: 'concept', x: 405, y: 200, vx: 0, vy: 0, px: null, py: null },
      ],
      [],
    );
    for (let i = 0; i < 20; i++) stepSim(sim, 960, 560);
    expect(sim.nodes[0].x).toBe(400);
    expect(sim.nodes[0].y).toBe(200);
    expect(sim.nodes[0].vx).toBe(0);
    expect(sim.nodes[0].vy).toBe(0);
  });

  it('alpha는 스텝마다 감쇠한다', () => {
    const sim = initSim(
      [{ id: 'a', type: 'concept', x: 100, y: 100, vx: 0, vy: 0, px: null, py: null }],
      [],
    );
    const a0 = sim.alpha;
    stepSim(sim, 960, 560);
    expect(sim.alpha).toBeLessThan(a0);
    expect(sim.alpha).toBeCloseTo(a0 * 0.985, 10);
  });

  it('경계를 벗어나지 않는다(clamp)', () => {
    const sim = initSim(
      [{ id: 'a', type: 'concept', x: 1, y: 1, vx: -50, vy: -50, px: null, py: null }],
      [],
    );
    for (let i = 0; i < 5; i++) stepSim(sim, 960, 560);
    expect(sim.nodes[0].x).toBeGreaterThanOrEqual(0);
    expect(sim.nodes[0].y).toBeGreaterThanOrEqual(0);
    expect(sim.nodes[0].x).toBeLessThanOrEqual(960);
    expect(sim.nodes[0].y).toBeLessThanOrEqual(560);
  });
});
