// GraphStats — the archive's running tally, pinned to the sidebar foot.
// `sessions · concepts · edges` in JetBrains Mono (spec §4 HUD idiom). Latin
// lowercase units, matching the canvas HUD ("150 concepts · 240 edges"), so the
// mono line stays crisp (JetBrains Mono carries no Hangul). Collapsed → a tight
// vertical s/c/e stack of just the numbers.
import type { JSX } from 'react'
import './sidebar.css'

export type GraphStatsData = { sessions: number; concepts: number; edges: number }

export function GraphStats(props: { stats: GraphStatsData; collapsed: boolean }): JSX.Element {
  const { stats, collapsed } = props

  if (collapsed) {
    return (
      <dl
        className="graphstats graphstats--collapsed"
        aria-label={`${stats.sessions} sessions, ${stats.concepts} concepts, ${stats.edges} edges`}
      >
        <div className="graphstats__pair">
          <dt className="graphstats__unit">s</dt>
          <dd className="graphstats__n">{stats.sessions}</dd>
        </div>
        <div className="graphstats__pair">
          <dt className="graphstats__unit">c</dt>
          <dd className="graphstats__n">{stats.concepts}</dd>
        </div>
        <div className="graphstats__pair">
          <dt className="graphstats__unit">e</dt>
          <dd className="graphstats__n">{stats.edges}</dd>
        </div>
      </dl>
    )
  }

  return (
    <p className="graphstats" aria-label={`${stats.sessions} sessions, ${stats.concepts} concepts, ${stats.edges} edges`}>
      <span className="graphstats__n">{stats.sessions}</span> sessions
      <span className="graphstats__sep"> · </span>
      <span className="graphstats__n">{stats.concepts}</span> concepts
      <span className="graphstats__sep"> · </span>
      <span className="graphstats__n">{stats.edges}</span> edges
    </p>
  )
}
