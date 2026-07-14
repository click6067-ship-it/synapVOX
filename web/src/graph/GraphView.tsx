// GraphView — the hero. react-force-graph-2d (canvas + d3-force) tuned for
// Obsidian-style *living elasticity*: a well-behaved spring system that settles
// calmly (~1.5–2s) yet stays alive on interaction — dragging a node pulls its
// neighbors like springs and releasing lets it re-settle. NOT a hard freeze.
//
// The old jank was bad spring constants + an unbounded render loop. The fix is
// GOOD d3-force tuning + a *bounded* cooldownTicks (stops the render loop only
// AFTER it has calmed, to save idle CPU) — never cooldownTicks=0, never a
// permanent fx/fy pin. Drag auto-reheats the simulation (library behavior);
// force-graph's default autoPauseRedraw pauses the idle redraw loop and revives
// it on pointer interaction, so "calm at rest" never means "dead frozen frame".

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import ForceGraph2D, {
  type ForceGraphMethods,
  type NodeObject,
  type LinkObject,
} from 'react-force-graph-2d'
import { getGraph, ApiError } from '../api/client'
import { mapGraph } from './mapGraph'
import { buildForceData, type FNode, type FLink } from './buildForceData'
import { loadPositions, savePositions } from './positionCache'
import { nodeRadius, nodeCoreColor, linkColor } from './render'

const CANVAS_BG = '#07120F' // literal hex — canvas ctx can't read a CSS var
const COLD_START_MS = 6000 // Render free tier can cold-start ~50s; reassure after this

type GraphData = { nodes: FNode[]; links: FLink[] }
type FGRef = ForceGraphMethods<NodeObject<FNode>, LinkObject<FNode, FLink>>

/** Imperative handle. Task 9 fills `growWith` (incremental session merge). Kept
 * as a clean seam now so callers can hold a ref without a later signature break. */
export type GraphViewHandle = {
  growWith?: (subgraph: GraphData) => void
}

export type GraphViewProps = {
  project: string
  reloadKey?: number // bump → refetch
  onSelectNode?: (n: FNode) => void
  onGraphMeta?: (m: { nodes: number; edges: number; settled: boolean }) => void
  askExpansionIds?: Set<string> | null // temp RAG highlight (wired in Task 12)
}

type Status = 'loading' | 'error' | 'ready'

export const GraphView = forwardRef<GraphViewHandle, GraphViewProps>(function GraphView(props, ref) {
  const { project, reloadKey, onGraphMeta, onSelectNode } = props

  const wrapRef = useRef<HTMLDivElement | null>(null)
  const fgRef = useRef<FGRef | undefined>(undefined)
  const didFitRef = useRef(false)

  const [dims, setDims] = useState({ w: 0, h: 0 })
  const [status, setStatus] = useState<Status>('loading')
  const [coldStart, setColdStart] = useState(false)
  const [errMsg, setErrMsg] = useState('')
  const [data, setData] = useState<GraphData | null>(null)

  // Task 9 seam — nothing exposed yet (growWith is optional / undefined).
  useImperativeHandle(ref, () => ({}), [])

  // ── Measure parent (ForceGraph2D needs explicit width/height) ─────────────
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => setDims({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ── Fetch → map → force data; seed cached x,y (NEVER fx/fy) ────────────────
  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setColdStart(false)
    setErrMsg('')
    didFitRef.current = false

    const coldTimer = setTimeout(() => {
      if (!cancelled) setColdStart(true)
    }, COLD_START_MS)

    getGraph(project)
      .then((raw) => {
        if (cancelled) return
        const built = buildForceData(mapGraph(raw))
        // P2: seed initial positions only — a good starting layout so the graph
        // settles fast without an origin big-bang. Nodes stay FREE (no fx/fy).
        const cached = loadPositions(project)
        if (cached) {
          for (const n of built.nodes) {
            const p = cached[n.id]
            if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
              n.x = p.x
              n.y = p.y
            }
          }
        }
        setData(built)
        setStatus('ready')
        onGraphMeta?.({ nodes: built.nodes.length, edges: built.links.length, settled: false })
      })
      .catch((e: unknown) => {
        if (cancelled) return
        const msg = e instanceof ApiError ? e.message : '그래프를 불러오지 못했습니다.'
        setErrMsg(msg)
        setStatus('error')
      })
      .finally(() => clearTimeout(coldTimer))

    return () => {
      cancelled = true
      clearTimeout(coldTimer)
    }
  }, [project, reloadKey, onGraphMeta])

  // ── Tune d3-force like Obsidian, once per data load ───────────────────────
  // Runs after the graph mounts. Because ForceGraph2D only mounts once dims are
  // measured, we poll a few frames for fgRef instead of racing the child ref.
  useEffect(() => {
    if (!data || data.nodes.length === 0) return
    let raf = 0
    let tries = 0
    const apply = () => {
      const fg = fgRef.current
      if (!fg) {
        if (tries++ < 90) raf = requestAnimationFrame(apply)
        return
      }
      // d3Force returns a callable ForceFn (index-signature typed) — cast via
      // unknown to the d3 force accessors we actually call.
      const link = fg.d3Force('link') as unknown as { distance?: (d: number) => unknown } | undefined
      link?.distance?.(55)
      const charge = fg.d3Force('charge') as unknown as { strength?: (fn: (n: FNode) => number) => unknown } | undefined
      charge?.strength?.((n: FNode) => -30 - (n.degree ?? 0) * 8)
      const center = fg.d3Force('center') as unknown as { strength?: (s: number) => unknown } | undefined
      center?.strength?.(0.05)
      // Re-apply forces to the running sim (calm reheat — settles ~1.5–2s).
      fg.d3ReheatSimulation()
      // Dev-only test hook: exposes the graph instance + live node data so the
      // elasticity gate (headless) can grab a hub node and measure neighbor spring.
      if (import.meta.env.DEV) {
        ;(window as unknown as Record<string, unknown>).__svxfg = fg
        ;(window as unknown as Record<string, unknown>).__svxdata = data
      }
    }
    apply()
    return () => cancelAnimationFrame(raf)
  }, [data])

  // ── Draw helpers ──────────────────────────────────────────────────────────
  const drawNode = useCallback(
    (node: NodeObject<FNode>, ctx: CanvasRenderingContext2D, _globalScale: number) => {
      const degree = node.degree ?? 0
      const r = nodeRadius(degree, node.type)
      const color = nodeCoreColor(node.type, node.bridge ?? false)
      const x = node.x ?? 0
      const y = node.y ?? 0

      ctx.save()
      // Degree-based glow: hubs bloom more, capped so a super-hub doesn't flare.
      ctx.shadowBlur = Math.min(6 + degree * 1.5, 24)
      ctx.shadowColor = color
      ctx.beginPath()
      ctx.arc(x, y, r, 0, 2 * Math.PI)
      ctx.fillStyle = color
      ctx.fill()
      ctx.restore()

      // LOD labels: Task 8 (draw node.label here with zoom/degree-based opacity).
    },
    [],
  )

  const paintPointer = useCallback(
    (node: NodeObject<FNode>, color: string, ctx: CanvasRenderingContext2D) => {
      const r = nodeRadius(node.degree ?? 0, node.type)
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(node.x ?? 0, node.y ?? 0, r, 0, 2 * Math.PI)
      ctx.fill()
    },
    [],
  )

  // ── Interaction ─────────────────────────────────────────────────────────
  // Task 7 seam: build highlight/dim sets from _node.neighbors here.
  const handleNodeHover = useCallback((_node: NodeObject<FNode> | null) => {}, [])

  const handleNodeClick = useCallback(
    (node: NodeObject<FNode>) => {
      onSelectNode?.(node as FNode)
    },
    [onSelectNode],
  )

  // Elastic release: clear the drag pin so the node re-settles with its springs
  // (during the drag force-graph sets fx/fy to follow the cursor — we undo it).
  const handleDragEnd = useCallback((node: NodeObject<FNode>) => {
    node.fx = undefined
    node.fy = undefined
  }, [])

  // ── Settle: fires when the engine calms (bounded by cooldownTicks) ─────────
  const handleEngineStop = useCallback(() => {
    if (!data) return
    savePositions(project, data.nodes) // P2 cache for next load
    onGraphMeta?.({ nodes: data.nodes.length, edges: data.links.length, settled: true })
    const fg = fgRef.current
    if (fg && !didFitRef.current) {
      didFitRef.current = true
      fg.zoomToFit(400, 40)
    }
    // NOTE: intentionally NOT calling pauseAnimation() — force-graph's default
    // autoPauseRedraw already halts the idle redraw loop and revives it on
    // pointer interaction, which keeps drag elastic. A manual pauseAnimation()
    // risks a dead frame that a drag can't revive.
  }, [data, project, onGraphMeta])

  const showGraph = status === 'ready' && !!data && data.nodes.length > 0 && dims.w > 0 && dims.h > 0
  const isEmpty = status === 'ready' && !!data && data.nodes.length === 0

  return (
    <div
      ref={wrapRef}
      style={{ position: 'relative', width: '100%', height: '100%', background: CANVAS_BG, overflow: 'hidden' }}
    >
      {showGraph && data && (
        <ForceGraph2D<FNode, FLink>
          ref={fgRef}
          graphData={data}
          width={dims.w}
          height={dims.h}
          backgroundColor={CANVAS_BG}
          cooldownTicks={200}
          d3VelocityDecay={0.4}
          d3AlphaDecay={0.03}
          enableNodeDrag
          onNodeDragEnd={handleDragEnd}
          nodeCanvasObject={drawNode}
          nodePointerAreaPaint={paintPointer}
          linkColor={(l: LinkObject<FNode, FLink>) => linkColor(l.relClass)}
          linkWidth={(l: LinkObject<FNode, FLink>) =>
            l.relClass === 'next' || l.relClass === 'continues' ? 1.6 : l.relClass === 'mentions' ? 0.6 : 1
          }
          linkLineDash={(l: LinkObject<FNode, FLink>) => (l.relClass === 'mentions' ? [4, 3] : null)}
          onNodeHover={handleNodeHover}
          onNodeClick={handleNodeClick}
          onEngineStop={handleEngineStop}
        />
      )}

      {(status === 'loading' || status === 'error' || isEmpty) && (
        <Overlay>
          {status === 'loading' && (
            <>
              <div style={overlayTitle}>그래프 불러오는 중…</div>
              {coldStart && (
                <div style={overlaySub}>
                  서버를 깨우는 중입니다. 콜드 스타트 시 최대 50초까지 걸릴 수 있어요.
                </div>
              )}
            </>
          )}
          {status === 'error' && (
            <>
              <div style={overlayTitle}>그래프를 불러오지 못했어요</div>
              <div style={overlaySub}>{errMsg}</div>
            </>
          )}
          {isEmpty && (
            <>
              <div style={overlayTitle}>아직 그래프가 비어 있어요</div>
              <div style={overlaySub}>강의를 추가하면 개념 그래프가 자라납니다.</div>
            </>
          )}
        </Overlay>
      )}
    </div>
  )
})

// ── Canvas-filling overlay (loading / error / empty) ─────────────────────────
function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        textAlign: 'center',
        padding: 24,
        pointerEvents: 'none',
      }}
    >
      {children}
    </div>
  )
}

const overlayTitle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 20,
  color: '#F4F0E7',
}
const overlaySub: React.CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 14,
  color: '#9aa39c',
  maxWidth: 360,
}

export default GraphView
