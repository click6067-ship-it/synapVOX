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
export function nodeRadius(degree: number, type: 'session' | 'concept' | 'main'): number {
  if (type === 'main') return 18 // the single project hub — always the biggest
  const base = type === 'session' ? SESSION_BASE : CONCEPT_BASE
  const d = Number.isFinite(degree) && degree > 0 ? degree : 0
  return base + Math.sqrt(d) * DEGREE_SCALE
}

/** Core/stroke color for a node. `main` = bright paper (the filled hub); session
 * = vermilion, concept = lime (these two are drawn HOLLOW — the color is the
 * outline). `bridge` accepted but does not change the hue. */
export function nodeCoreColor(type: 'session' | 'concept' | 'main', _bridge: boolean): string {
  if (type === 'main') return '#F4F0E7'
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
