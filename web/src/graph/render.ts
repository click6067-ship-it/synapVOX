// Pure draw helpers for the force graph — node sizing, node core colors, and
// link colors. No DOM/canvas/React here so they stay unit-testable; the actual
// canvas painting lives in GraphView.tsx and calls these.
//
// Palette (spec §3, exact hexes):
//   --node-core  #D8FF6A  (concept core, lime)
//   --session-red #C84E3A (session core, vermilion)
//   --rule-blue  #2F6F86  (links / focus / selection)

import type { RelClass } from './mapGraph'

const CONCEPT_BASE = 4
const SESSION_BASE = 5 // sessions read slightly heavier than concepts
const DEGREE_SCALE = 1.8

/** Node radius in graph units. `base + sqrt(degree) * scale` — sqrt keeps hubs
 * visibly bigger without letting a single super-hub dwarf everything (linear
 * would). Strictly monotonic increasing in degree. */
export function nodeRadius(degree: number, type: 'session' | 'concept'): number {
  const base = type === 'session' ? SESSION_BASE : CONCEPT_BASE
  const d = Number.isFinite(degree) && degree > 0 ? degree : 0
  return base + Math.sqrt(d) * DEGREE_SCALE
}

/** Solid fill color for a node's core. `bridge` is accepted for future halo
 * emphasis (bridge concepts get a warmer halo in the draw layer) but does NOT
 * change the core hue — the core stays the canonical lime/vermilion. */
export function nodeCoreColor(type: 'session' | 'concept', _bridge: boolean): string {
  return type === 'concept' ? '#D8FF6A' : '#C84E3A'
}

// rule-blue variants. Structural/cooccurrence edges use the flat base; the
// sequential NEXT/CONTINUES spine is slightly brighter (stronger); loose
// SESSION_MENTIONS_CONCEPT edges are translucent (dimmer) — and drawn dashed
// in GraphView via linkLineDash.
const RULE_BLUE = '#2F6F86'
const RULE_BLUE_STRONG = '#4E90A8'
const MENTIONS_DIM = 'rgba(47, 111, 134, 0.38)'

/** Link stroke color by relation class. */
export function linkColor(relClass: RelClass): string {
  switch (relClass) {
    case 'mentions':
      return MENTIONS_DIM
    case 'next':
    case 'continues':
      return RULE_BLUE_STRONG
    case 'cooccur':
    case 'expands':
    default:
      return RULE_BLUE
  }
}
