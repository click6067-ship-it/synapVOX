// Level-of-detail (LOD) label math for the force graph. Pure — unit-tested.
// Decides how opaque a node's label should be given the current zoom
// (`globalScale`) and how much of a hub the node is (degree / maxDegree).
//
// Spec §5 "Zoom LOD 라벨": 줌아웃 = 허브 top만 / 중간 = 허브 + 이웃 / 줌인 =
// 뷰포트 내 라벨. 페이드는 opacity만 — 라벨은 절대 움직이지 않으므로 fade
// in/out 이 레이아웃을 흔들지 않는다.
//
// Thresholds:
//   LOW_SCALE  0.7  — below this zoom, only hubs are labeled (base ramp = 0).
//   HIGH_SCALE 2.4  — at/above this zoom, every label has faded fully in.
//   HUB_FRAC   0.6  — degree >= 60% of maxDegree counts as a "top hub".
//   HUB_FLOOR  0.6  — the always-on visibility floor the biggest hubs keep
//                     even when fully zoomed out (top labels stay readable).
export const LOW_SCALE = 0.7
export const HIGH_SCALE = 2.4
export const HUB_FRACTION = 0.6
export const HUB_FLOOR = 0.6

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/**
 * Label opacity in [0,1].
 * - `hovered` (hovered or selected node) → always 1, regardless of zoom.
 * - Otherwise a base ramp fades every label 0→1 across LOW_SCALE..HIGH_SCALE,
 *   and top-degree hubs keep a zoom-independent visibility floor so the biggest
 *   labels remain shown when zoomed out. Monotonically non-decreasing in
 *   `globalScale`, so zooming in never hides a label that was visible.
 */
export function labelOpacity(
  globalScale: number,
  degree: number,
  maxDegree: number,
  hovered: boolean,
): number {
  if (hovered) return 1

  const md = maxDegree > 0 ? maxDegree : 1
  const hubFrac = clamp01(degree / md)
  const isHub = hubFrac >= HUB_FRACTION

  // Base zoom ramp: 0 at LOW_SCALE, 1 at HIGH_SCALE, applied to every node.
  const baseRamp = clamp01((globalScale - LOW_SCALE) / (HIGH_SCALE - LOW_SCALE))

  // Hub floor: the biggest hubs stay partially visible even below LOW_SCALE.
  const hubFloor = isHub ? hubFrac * HUB_FLOOR : 0

  return clamp01(Math.max(baseRamp, hubFloor))
}
