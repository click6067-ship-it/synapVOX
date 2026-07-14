// Live force-directed graph. The physics loop (rAF) mutates SVG attributes
// imperatively via refs so it never triggers a React re-render — React only
// re-renders on structural changes (graph load, filter, selection, pan/zoom).

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as RPointerEvent } from 'react'
import { getGraph } from '../api/client'
import { initSim, stepSim, type Sim, type SimNode } from './forceSim'
import { mapGraph, type GraphLink, type GraphNode, type RelClass } from './mapGraph'
import './graph.css'

const W = 980
const H = 580

export type FilterState = {
  mentions: boolean
  cooccur: boolean
  next: boolean
  semantic: boolean // continues | expands
  coreOnly: boolean // hide non-bridge concepts
}

type Props = {
  project: string
  filter: FilterState
  onSelectNode?: (n: GraphNode) => void
}

type Viewport = { x: number; y: number; scale: number }
type SimState = { sim: Sim; raf: number | null; drag: string | null }

/** Seed initial positions: sessions along a row, concepts near mentioners. */
function buildSimNodes(g: { nodes: GraphNode[]; links: GraphLink[] }): SimNode[] {
  const sessions = g.nodes
    .filter((n) => n.type === 'session')
    .slice()
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
  const Ns = sessions.length
  const sessionX: Record<string, number> = {}
  sessions.forEach((n, i) => {
    const t = Ns > 1 ? i / (Ns - 1) : 0.5
    sessionX[n.id] = W * (0.12 + 0.76 * t)
  })

  const mentByConcept: Record<string, string[]> = {}
  for (const l of g.links) {
    if (l.relClass !== 'mentions') continue
    const sEnd = sessionX[l.from] !== undefined ? l.from : sessionX[l.to] !== undefined ? l.to : null
    if (sEnd === null) continue
    const cEnd = sEnd === l.from ? l.to : l.from
    ;(mentByConcept[cEnd] ??= []).push(sEnd)
  }

  return g.nodes.map((n): SimNode => {
    if (n.type === 'session') {
      return { id: n.id, type: 'session', x: sessionX[n.id] ?? W / 2, y: H / 2, vx: 0, vy: 0, px: null, py: null }
    }
    const ms = mentByConcept[n.id]
    let cx = W / 2
    if (ms && ms.length) cx = ms.reduce((s, id) => s + (sessionX[id] ?? W / 2), 0) / ms.length
    const x = cx + (Math.random() * 2 - 1) * 70
    const y = H / 2 + (Math.random() * 2 - 1) * 200
    return { id: n.id, type: 'concept', x, y, vx: 0, vy: 0, px: null, py: null }
  })
}

function markerFor(rc: RelClass): string | undefined {
  if (rc === 'next' || rc === 'continues' || rc === 'expands') return `url(#arrow-${rc})`
  return undefined
}

export default function GraphCanvas({ project, filter, onSelectNode }: Props) {
  const [graph, setGraph] = useState<{ nodes: GraphNode[]; links: GraphLink[] } | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const svgRef = useRef<SVGSVGElement | null>(null)
  // Outer stage <g> that carries the pan/zoom transform. Mutated imperatively
  // (setAttribute) from viewportRef — never via React state — so pan/wheel
  // ticks don't trigger a component re-render.
  const stageRef = useRef<SVGGElement | null>(null)
  const nodeElRef = useRef<Map<string, SVGGElement>>(new Map())
  const edgeElRef = useRef<Map<string, { el: SVGLineElement; from: string; to: string }>>(new Map())
  // Memoized per-id ref-callback caches so occasional structural re-renders
  // (select/filter) don't detach/reattach every node/edge DOM ref — the ref
  // callback identity for a given id/key stays stable across renders.
  const nodeRefCacheRef = useRef<Map<string, (el: SVGGElement | null) => void>>(new Map())
  const edgeRefCacheRef = useRef<Map<string, (el: SVGLineElement | null) => void>>(new Map())
  const simRef = useRef<SimState | null>(null)
  // Source of truth for pan/zoom — a ref, not React state, so updating it
  // never triggers a re-render (and thus never re-attaches node/edge refs).
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, scale: 1 })
  const dragRef = useRef<{ id: string; moved: boolean; sx: number; sy: number } | null>(null)
  const panRef = useRef<{ vbX: number; vbY: number; vx: number; vy: number; moved: boolean } | null>(null)

  // Imperatively push viewportRef.current onto the stage <g>'s transform.
  const applyViewport = useCallback(() => {
    const stage = stageRef.current
    if (!stage) return
    const v = viewportRef.current
    stage.setAttribute('transform', `translate(${v.x} ${v.y}) scale(${v.scale})`)
  }, [])

  // --- physics loop (imperative; no setState per frame) ---
  const runStep = useCallback(() => {
    const s = simRef.current
    if (!s) return
    stepSim(s.sim, W, H)
    const { nodes, idx } = s.sim
    for (const nd of nodes) {
      const el = nodeElRef.current.get(nd.id)
      if (el) el.setAttribute('transform', `translate(${nd.x} ${nd.y})`)
    }
    edgeElRef.current.forEach((edge) => {
      const a = nodes[idx[edge.from]]
      const b = nodes[idx[edge.to]]
      if (!a || !b) return
      edge.el.setAttribute('x1', `${a.x}`)
      edge.el.setAttribute('y1', `${a.y}`)
      edge.el.setAttribute('x2', `${b.x}`)
      edge.el.setAttribute('y2', `${b.y}`)
    })
    if (s.sim.alpha > 0.02 || s.drag) {
      s.raf = requestAnimationFrame(runStep)
    } else {
      s.raf = null
    }
  }, [])

  const ensureLoop = useCallback(() => {
    const s = simRef.current
    if (s && s.raf == null) s.raf = requestAnimationFrame(runStep)
  }, [runStep])

  // One-shot position sync (no physics step) so freshly-mounted elements from a
  // filter/graph change are placed even when the loop is idle (alpha settled).
  const syncPositions = useCallback(() => {
    const s = simRef.current
    if (!s) return
    const { nodes, idx } = s.sim
    for (const nd of nodes) {
      const el = nodeElRef.current.get(nd.id)
      if (el) el.setAttribute('transform', `translate(${nd.x} ${nd.y})`)
    }
    edgeElRef.current.forEach((edge) => {
      const a = nodes[idx[edge.from]]
      const b = nodes[idx[edge.to]]
      if (!a || !b) return
      edge.el.setAttribute('x1', `${a.x}`)
      edge.el.setAttribute('y1', `${a.y}`)
      edge.el.setAttribute('x2', `${b.x}`)
      edge.el.setAttribute('y2', `${b.y}`)
    })
  }, [])

  // --- load graph on project change ---
  useEffect(() => {
    let cancelled = false
    nodeElRef.current.clear()
    edgeElRef.current.clear()
    nodeRefCacheRef.current.clear()
    edgeRefCacheRef.current.clear()
    setGraph(null)
    setSelectedId(null)

    getGraph(project)
      .then((raw) => {
        if (cancelled) return
        const g = mapGraph(raw)
        const simNodes = buildSimNodes(g)
        const idx: Record<string, number> = {}
        simNodes.forEach((n, i) => (idx[n.id] = i))
        const simLinks = g.links
          .filter((l) => idx[l.from] !== undefined && idx[l.to] !== undefined)
          .map((l) => ({ a: idx[l.from], b: idx[l.to] }))
        simRef.current = { sim: initSim(simNodes, simLinks), raf: null, drag: null }
        setGraph(g)
        ensureLoop()
      })
      .catch(() => {
        if (!cancelled) setGraph({ nodes: [], links: [] })
      })

    return () => {
      cancelled = true
      const s = simRef.current
      if (s && s.raf != null) cancelAnimationFrame(s.raf)
      simRef.current = null
    }
  }, [project, ensureLoop])

  // Place elements after any structural render (graph load, filter toggle).
  // Also re-apply the stage transform here — a structural React re-render
  // doesn't touch the stage <g> itself, but this keeps pan/zoom correct even
  // if that ever changes (e.g. a future key change remounts the stage).
  useLayoutEffect(() => {
    syncPositions()
    applyViewport()
  }, [graph, filter, syncPositions, applyViewport])

  // Native, non-passive wheel listener so preventDefault works (zoom to cursor).
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const ctm = svg.getScreenCTM()
      if (!ctm) return
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
      const v = viewportRef.current
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
      const scale = Math.min(2.2, Math.max(0.4, v.scale * factor))
      const gx = (p.x - v.x) / v.scale
      const gy = (p.y - v.y) / v.scale
      viewportRef.current = { x: p.x - gx * scale, y: p.y - gy * scale, scale }
      applyViewport()
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [applyViewport])

  // --- coordinate helpers ---
  const screenToViewBox = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current
    const ctm = svg?.getScreenCTM()
    if (!svg || !ctm) return { x: 0, y: 0 }
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse())
    return { x: p.x, y: p.y }
  }, [])

  const pointerToGraph = useCallback(
    (clientX: number, clientY: number) => {
      const vb = screenToViewBox(clientX, clientY)
      const v = viewportRef.current
      return { x: (vb.x - v.x) / v.scale, y: (vb.y - v.y) / v.scale }
    },
    [screenToViewBox],
  )

  // --- node drag / select ---
  const onNodeDown = (e: RPointerEvent<SVGGElement>, node: GraphNode) => {
    e.stopPropagation()
    const s = simRef.current
    if (!s) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const gp = pointerToGraph(e.clientX, e.clientY)
    const sn = s.sim.nodes[s.sim.idx[node.id]]
    if (sn) {
      sn.px = gp.x
      sn.py = gp.y
    }
    s.drag = node.id
    s.sim.alpha = Math.max(s.sim.alpha, 0.6)
    dragRef.current = { id: node.id, moved: false, sx: e.clientX, sy: e.clientY }
    ensureLoop()
  }

  const onNodeMove = (e: RPointerEvent<SVGGElement>, node: GraphNode) => {
    const s = simRef.current
    if (!s || s.drag !== node.id) return
    const gp = pointerToGraph(e.clientX, e.clientY)
    const sn = s.sim.nodes[s.sim.idx[node.id]]
    if (sn) {
      sn.px = gp.x
      sn.py = gp.y
    }
    s.sim.alpha = Math.max(s.sim.alpha, 0.3)
    const d = dragRef.current
    if (d && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 4) d.moved = true
    ensureLoop()
  }

  const onNodeUp = (e: RPointerEvent<SVGGElement>, node: GraphNode) => {
    const s = simRef.current
    const d = dragRef.current
    dragRef.current = null
    if (s) {
      const sn = s.sim.nodes[s.sim.idx[node.id]]
      if (sn) {
        sn.px = null
        sn.py = null
      }
      s.drag = null
      s.sim.alpha = Math.max(s.sim.alpha, 0.3)
      ensureLoop()
    }
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId)
    } catch {
      /* not captured */
    }
    if (d && !d.moved) {
      setSelectedId(node.id)
      onSelectNode?.(node)
    }
  }

  // --- background pan / deselect ---
  const onBgDown = (e: RPointerEvent<SVGSVGElement>) => {
    const vb = screenToViewBox(e.clientX, e.clientY)
    const v = viewportRef.current
    panRef.current = { vbX: vb.x, vbY: vb.y, vx: v.x, vy: v.y, moved: false }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  const onBgMove = (e: RPointerEvent<SVGSVGElement>) => {
    const p = panRef.current
    if (!p) return
    const vb = screenToViewBox(e.clientX, e.clientY)
    if (Math.hypot(vb.x - p.vbX, vb.y - p.vbY) > 2) p.moved = true
    const v = viewportRef.current
    viewportRef.current = { ...v, x: p.vx + (vb.x - p.vbX), y: p.vy + (vb.y - p.vbY) }
    applyViewport()
  }

  const onBgUp = (e: RPointerEvent<SVGSVGElement>) => {
    const p = panRef.current
    panRef.current = null
    if (p && !p.moved) setSelectedId(null)
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId)
    } catch {
      /* not captured */
    }
  }

  // --- visibility (filter) ---
  const relVisible = (rc: RelClass): boolean => {
    if (rc === 'mentions') return filter.mentions
    if (rc === 'cooccur') return filter.cooccur
    if (rc === 'next') return filter.next
    return filter.semantic // continues | expands
  }

  const hiddenIds = useMemo(() => {
    const set = new Set<string>()
    if (filter.coreOnly && graph) {
      for (const n of graph.nodes) if (n.type === 'concept' && !n.bridge) set.add(n.id)
    }
    return set
  }, [filter.coreOnly, graph])

  // Memoized: returns the SAME callback instance for a given id/key across
  // renders, so React doesn't see a "new ref" and detach/reattach the DOM
  // node on every re-render triggered by selection/filter changes.
  const getNodeRef = (id: string) => {
    let fn = nodeRefCacheRef.current.get(id)
    if (!fn) {
      fn = (el: SVGGElement | null) => {
        if (el) nodeElRef.current.set(id, el)
        else nodeElRef.current.delete(id)
      }
      nodeRefCacheRef.current.set(id, fn)
    }
    return fn
  }
  const getEdgeRef = (key: string, from: string, to: string) => {
    let fn = edgeRefCacheRef.current.get(key)
    if (!fn) {
      fn = (el: SVGLineElement | null) => {
        if (el) edgeElRef.current.set(key, { el, from, to })
        else edgeElRef.current.delete(key)
      }
      edgeRefCacheRef.current.set(key, fn)
    }
    return fn
  }

  return (
    <svg
      ref={svgRef}
      className="graph-canvas"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      onPointerDown={onBgDown}
      onPointerMove={onBgMove}
      onPointerUp={onBgUp}
      onPointerLeave={onBgUp}
      role="img"
      aria-label="knowledge graph"
    >
      <defs>
        {(['next', 'continues', 'expands'] as const).map((rc) => (
          <marker
            key={rc}
            id={`arrow-${rc}`}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" className={`marker marker-${rc}`} />
          </marker>
        ))}
      </defs>

      <g ref={stageRef}>
        <g className="edge-layer">
          {graph?.links.map((link) => {
            if (!relVisible(link.relClass)) return null
            if (filter.coreOnly && (hiddenIds.has(link.from) || hiddenIds.has(link.to))) return null
            const key = `${link.from}-${link.to}-${link.rel}`
            return (
              <line
                key={key}
                ref={getEdgeRef(key, link.from, link.to)}
                className={`edge edge-${link.relClass}`}
                markerEnd={markerFor(link.relClass)}
              />
            )
          })}
        </g>

        <g className="node-layer">
          {graph?.nodes.map((node) => {
            if (filter.coreOnly && node.type === 'concept' && !node.bridge) return null
            const selected = node.id === selectedId
            const showLabel = node.type === 'concept' && (node.bridge || selected)
            return (
              <g
                key={node.id}
                ref={getNodeRef(node.id)}
                className={`node node-${node.type}${selected ? ' selected' : ''}`}
                onPointerDown={(e) => onNodeDown(e, node)}
                onPointerMove={(e) => onNodeMove(e, node)}
                onPointerUp={(e) => onNodeUp(e, node)}
              >
                {node.type === 'session' ? (
                  <>
                    <rect className="node-session-box" x={-13} y={-9} width={26} height={18} rx={4} />
                    <text className="node-seq" textAnchor="middle" dominantBaseline="central">
                      {node.seq ?? ''}
                    </text>
                  </>
                ) : (
                  <>
                    <circle className="node-concept-dot" r={node.r} />
                    {showLabel && (
                      <text className="node-label" x={node.r + 4} y={4}>
                        {node.label}
                      </text>
                    )}
                  </>
                )}
              </g>
            )
          })}
        </g>
      </g>
    </svg>
  )
}
