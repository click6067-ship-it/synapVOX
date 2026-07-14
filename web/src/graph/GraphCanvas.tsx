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
  // Called after the graph finishes loading (with the loaded nodes) so a parent
  // can derive e.g. the session list. Kept in a ref so its identity never
  // re-triggers the load effect.
  onGraphLoad?: (nodes: GraphNode[]) => void
  // Bump to force a re-fetch of the graph (e.g. after ingesting new text).
  reloadKey?: number | string
  // Externally-driven neighbor highlight (e.g. hovering/clicking a source in the
  // left panel). Applied imperatively — it does NOT re-run the physics sim.
  highlightId?: string | null
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

export default function GraphCanvas({ project, filter, onSelectNode, onGraphLoad, reloadKey, highlightId }: Props) {
  const [graph, setGraph] = useState<{ nodes: GraphNode[]; links: GraphLink[] } | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Graph-area status so the canvas shows a distinct loading / cold-start /
  // error / empty state instead of a blank SVG. `coldStart` flips on after a
  // few seconds still loading (Render free-tier wakes in ~50s).
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading')
  const [coldStart, setColdStart] = useState(false)
  const [retryTick, setRetryTick] = useState(0)

  // Latest onGraphLoad without it being a load-effect dependency (a new callback
  // identity from a parent re-render must not re-fetch the graph).
  const onGraphLoadRef = useRef(onGraphLoad)
  useEffect(() => {
    onGraphLoadRef.current = onGraphLoad
  }, [onGraphLoad])

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

  // --- neighbor-highlight (imperative, no re-render) ---
  // id -> Set of directly-connected neighbor ids, precomputed on graph load so
  // hover/highlight is O(neighbors), not O(links). Degree drives the tooltip.
  const adjacencyRef = useRef<Map<string, Set<string>>>(new Map())
  // Which node the pointer is currently over (transient), the clicked/selected
  // node (sticky), and the externally-driven highlight (source panel). The
  // effective highlight = hover ?? external ?? selected. All refs so toggling
  // them never triggers a React re-render of the node/edge lists.
  const hoverIdRef = useRef<string | null>(null)
  const selectedIdRef = useRef<string | null>(null)
  const highlightIdRef = useRef<string | null>(null)
  // Floating tooltip elements (updated imperatively on hover).
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const tipRef = useRef<HTMLDivElement | null>(null)
  const tipLabelRef = useRef<HTMLSpanElement | null>(null)
  const tipMetaRef = useRef<HTMLSpanElement | null>(null)

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

  // --- imperative neighbor-highlight (never re-renders the node/edge lists) ---
  // Effective focus = hover (transient) ?? external highlight (source panel) ??
  // selected (clicked, sticky). Toggles `.hl`/`.dim` classes directly on the DOM
  // elements held in nodeElRef/edgeElRef. Re-applied after every structural
  // render (see layout effect) because React overwrites className on the nodes
  // whose className prop actually changed (e.g. the newly-selected one).
  const applyHighlight = useCallback(() => {
    const focus = hoverIdRef.current ?? highlightIdRef.current ?? selectedIdRef.current
    const svg = svgRef.current
    if (!focus) {
      svg?.classList.remove('is-highlighting')
      nodeElRef.current.forEach((el) => el.classList.remove('hl', 'dim'))
      edgeElRef.current.forEach((edge) => edge.el.classList.remove('hl', 'dim'))
      return
    }
    const neighbors = adjacencyRef.current.get(focus)
    const active = new Set<string>([focus])
    if (neighbors) neighbors.forEach((id) => active.add(id))
    svg?.classList.add('is-highlighting')
    nodeElRef.current.forEach((el, id) => {
      if (active.has(id)) {
        el.classList.add('hl')
        el.classList.remove('dim')
      } else {
        el.classList.add('dim')
        el.classList.remove('hl')
      }
    })
    edgeElRef.current.forEach((edge) => {
      // Highlight edges incident to the focused node; dim the rest.
      if (edge.from === focus || edge.to === focus) {
        edge.el.classList.add('hl')
        edge.el.classList.remove('dim')
      } else {
        edge.el.classList.add('dim')
        edge.el.classList.remove('hl')
      }
    })
  }, [])

  // --- floating tooltip (imperative; positioned relative to the wrapper) ---
  const showTooltip = useCallback((node: GraphNode, clientX: number, clientY: number) => {
    const tip = tipRef.current
    if (!tip) return
    const deg = adjacencyRef.current.get(node.id)?.size ?? 0
    if (tipLabelRef.current) tipLabelRef.current.textContent = node.label
    if (tipMetaRef.current) {
      if (node.type === 'session') {
        tipMetaRef.current.textContent = `강의 세션 · 개념 ${deg}개`
      } else {
        tipMetaRef.current.textContent = `${node.bridge ? '브리지 개념' : '개념'} · 연결 ${deg}`
      }
    }
    tip.classList.add('is-on')
    moveTooltip(clientX, clientY)
  }, [])

  const moveTooltip = (clientX: number, clientY: number) => {
    const tip = tipRef.current
    const wrap = wrapperRef.current
    if (!tip || !wrap) return
    const r = wrap.getBoundingClientRect()
    let x = clientX - r.left + 14
    let y = clientY - r.top + 14
    // keep the tooltip inside the wrapper
    x = Math.min(x, r.width - tip.offsetWidth - 8)
    y = Math.min(y, r.height - tip.offsetHeight - 8)
    tip.style.transform = `translate(${Math.max(6, x)}px, ${Math.max(6, y)}px)`
  }

  const hideTooltip = useCallback(() => {
    tipRef.current?.classList.remove('is-on')
  }, [])

  // --- load graph on project change ---
  useEffect(() => {
    let cancelled = false
    nodeElRef.current.clear()
    edgeElRef.current.clear()
    nodeRefCacheRef.current.clear()
    edgeRefCacheRef.current.clear()
    adjacencyRef.current = new Map()
    hoverIdRef.current = null
    selectedIdRef.current = null
    setGraph(null)
    setSelectedId(null)
    setStatus('loading')
    setColdStart(false)
    // Render free-tier can take ~50s to wake; after 6s still loading, reassure.
    const coldTimer = setTimeout(() => {
      if (!cancelled) setColdStart(true)
    }, 6000)

    getGraph(project)
      .then((raw) => {
        if (cancelled) return
        const g = mapGraph(raw)
        // Precompute adjacency (id -> neighbor ids) + a node lookup for tooltips.
        const adj = new Map<string, Set<string>>()
        const addAdj = (a: string, b: string) => {
          ;(adj.get(a) ?? adj.set(a, new Set()).get(a)!).add(b)
        }
        for (const l of g.links) {
          addAdj(l.from, l.to)
          addAdj(l.to, l.from)
        }
        adjacencyRef.current = adj
        const simNodes = buildSimNodes(g)
        const idx: Record<string, number> = {}
        simNodes.forEach((n, i) => (idx[n.id] = i))
        const simLinks = g.links
          .filter((l) => idx[l.from] !== undefined && idx[l.to] !== undefined)
          .map((l) => ({ a: idx[l.from], b: idx[l.to] }))
        simRef.current = { sim: initSim(simNodes, simLinks), raf: null, drag: null }
        // 워밍업: 화면 밖에서 미리 퍼뜨리고 정착시켜, 화면엔 (거의) 정착된 상태로 뜨게 한다.
        // → 로드 시 오래 출렁이지 않고 짧은 마무리 정착만 보인 뒤 멈춘다.
        const warm = simRef.current.sim
        for (let i = 0; i < 220; i++) stepSim(warm, W, H)
        clearTimeout(coldTimer)
        setGraph(g)
        setStatus('ready')
        ensureLoop()
        onGraphLoadRef.current?.(g.nodes)
      })
      .catch(() => {
        if (!cancelled) {
          // Error is NOT an empty graph — keep them distinct so a cold/broken
          // backend shows a retry, not a misleading "no concepts yet".
          clearTimeout(coldTimer)
          setGraph(null)
          setStatus('error')
          onGraphLoadRef.current?.([])
        }
      })

    return () => {
      cancelled = true
      clearTimeout(coldTimer)
      const s = simRef.current
      if (s && s.raf != null) cancelAnimationFrame(s.raf)
      simRef.current = null
    }
  }, [project, reloadKey, retryTick, ensureLoop])

  // Place elements after any structural render (graph load, filter toggle).
  // Also re-apply the stage transform here — a structural React re-render
  // doesn't touch the stage <g> itself, but this keeps pan/zoom correct even
  // if that ever changes (e.g. a future key change remounts the stage).
  useLayoutEffect(() => {
    syncPositions()
    applyViewport()
    // Keep the sticky-highlight refs in sync with React state/props, then
    // re-apply the highlight — a structural render (select/filter) overwrites
    // className on the changed nodes, wiping their imperative .hl/.dim classes.
    selectedIdRef.current = selectedId
    highlightIdRef.current = highlightId ?? null
    applyHighlight()
  }, [graph, filter, selectedId, highlightId, syncPositions, applyViewport, applyHighlight])

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
    hideTooltip()
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
      selectedIdRef.current = node.id
      setSelectedId(node.id)
      onSelectNode?.(node)
    }
  }

  // --- node hover: imperative neighbor highlight + floating tooltip ---
  const onNodeEnter = (e: RPointerEvent<SVGGElement>, node: GraphNode) => {
    if (simRef.current?.drag) return // don't fight an in-progress drag
    hoverIdRef.current = node.id
    applyHighlight()
    showTooltip(node, e.clientX, e.clientY)
  }
  const onNodeHoverMove = (e: RPointerEvent<SVGGElement>) => {
    if (simRef.current?.drag) return
    moveTooltip(e.clientX, e.clientY)
  }
  const onNodeLeave = () => {
    hoverIdRef.current = null
    applyHighlight()
    hideTooltip()
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
    if (p && !p.moved) {
      selectedIdRef.current = null
      setSelectedId(null)
    }
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
    <div className="graph-stage" ref={wrapperRef}>
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
                className={`node node-${node.type}${node.type === 'concept' && node.bridge ? ' node-bridge' : ''}${selected ? ' selected' : ''}`}
                onPointerDown={(e) => onNodeDown(e, node)}
                onPointerMove={(e) => {
                  onNodeMove(e, node)
                  onNodeHoverMove(e)
                }}
                onPointerUp={(e) => onNodeUp(e, node)}
                onPointerEnter={(e) => onNodeEnter(e, node)}
                onPointerLeave={onNodeLeave}
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
      <div className="graph-tooltip" ref={tipRef} aria-hidden="true">
        <span className="graph-tooltip-label" ref={tipLabelRef} />
        <span className="graph-tooltip-meta" ref={tipMetaRef} />
      </div>

      {status === 'loading' && (
        <div className="graph-overlay" role="status" aria-live="polite">
          <span className="graph-spinner" aria-hidden="true" />
          <p className="graph-overlay-title">지식 그래프를 불러오는 중…</p>
          {coldStart && <p className="graph-overlay-sub">서버를 깨우고 있어요. 처음이면 최대 50초 걸릴 수 있어요.</p>}
        </div>
      )}
      {status === 'error' && (
        <div className="graph-overlay" role="alert">
          <p className="graph-overlay-title">그래프를 불러오지 못했습니다.</p>
          <p className="graph-overlay-sub">서버가 잠들어 있거나 일시적인 문제일 수 있어요.</p>
          <button type="button" className="graph-overlay-retry" onClick={() => setRetryTick((t) => t + 1)}>
            다시 시도
          </button>
        </div>
      )}
      {status === 'ready' && graph?.nodes.length === 0 && (
        <div className="graph-overlay" role="status">
          <p className="graph-overlay-title">아직 개념이 없어요.</p>
          <p className="graph-overlay-sub">‘＋ 텍스트로 추가’로 강의·노트를 넣으면 개념 그래프가 그려져요.</p>
        </div>
      )}
    </div>
  )
}
