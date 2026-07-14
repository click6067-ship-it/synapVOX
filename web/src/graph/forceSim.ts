// Pure physics for a live force-directed graph. No DOM/React dependency —
// safe to unit test and to run inside a canvas render loop.

export type SimNode = {
  id: string;
  type: 'session' | 'concept';
  x: number;
  y: number;
  vx: number;
  vy: number;
  px: number | null;
  py: number | null;
};

export type SimLink = { a: number; b: number };

export type Sim = {
  nodes: SimNode[];
  idx: Record<string, number>;
  links: SimLink[];
  alpha: number;
};

// Physics constants (tuned for a ~960x560 canvas of session/concept nodes).
const GRAVITY = 0.01; // pull toward center per step
const GRAVITY_CY = 280; // target y for center gravity (fixed, not H/2)
const REPULSE_STRENGTH = 620; // numerator of 1/d^2 repulsion
const REPULSE_MAX_D2 = 24000; // only repel nearby nodes (perf + locality)
const SPRING_REST = 74; // resting length for linked nodes
const SPRING_K = 0.035; // spring stiffness
const DAMPING = 0.86; // velocity damping per step
const ALPHA_DECAY = 0.985; // alpha *= this, each step

/** Build a fresh simulation state from node/link inputs. */
export function initSim(nodes: SimNode[], links: SimLink[]): Sim {
  const idx: Record<string, number> = {};
  for (let i = 0; i < nodes.length; i++) {
    idx[nodes[i].id] = i;
  }
  return { nodes, idx, links, alpha: 1 };
}

/** Advance the simulation by one physics frame, mutating sim.nodes in place. */
export function stepSim(sim: Sim, W: number, H: number): void {
  const { nodes, links } = sim;
  const n = nodes.length;
  const cx = W / 2;
  const cy = GRAVITY_CY;

  // 1) center gravity — pulls every node toward (cx, cy).
  for (let i = 0; i < n; i++) {
    const node = nodes[i];
    node.vx += (cx - node.x) * GRAVITY;
    node.vy += (cy - node.y) * GRAVITY;
  }

  // 2) nearby repulsion — pairwise, only within REPULSE_MAX_D2.
  for (let i = 0; i < n; i++) {
    const a = nodes[i];
    for (let j = i + 1; j < n; j++) {
      const b = nodes[j];
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      let d2 = dx * dx + dy * dy;
      if (d2 >= REPULSE_MAX_D2) continue;
      if (d2 === 0) {
        // Exact overlap: nudge apart along an arbitrary axis to avoid /0.
        dx = 0.01;
        dy = 0;
        d2 = dx * dx;
      }
      const dist = Math.sqrt(d2);
      const force = REPULSE_STRENGTH / d2;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }
  }

  // 3) springs — pull linked nodes toward SPRING_REST separation.
  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    const a = nodes[link.a];
    const b = nodes[link.b];
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy) || 0.0001;
    const force = (dist - SPRING_REST) * SPRING_K;
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;
    a.vx += fx;
    a.vy += fy;
    b.vx -= fx;
    b.vy -= fy;
  }

  // 4) integrate — damping, pin, position update, clamp to bounds.
  for (let i = 0; i < n; i++) {
    const node = nodes[i];
    if (node.px != null && node.py != null) {
      node.x = node.px;
      node.y = node.py;
      node.vx = 0;
      node.vy = 0;
      continue;
    }
    node.vx *= DAMPING;
    node.vy *= DAMPING;
    node.x += node.vx;
    node.y += node.vy;
    if (node.x < 0) node.x = 0;
    else if (node.x > W) node.x = W;
    if (node.y < 0) node.y = 0;
    else if (node.y > H) node.y = H;
  }

  sim.alpha *= ALPHA_DECAY;
}
