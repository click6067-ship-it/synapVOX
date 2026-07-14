// Workspace = the 3-column project view: sources (left) · live graph (center) ·
// RAG chat (right). GraphCanvas owns graph loading + physics; it hands the loaded
// nodes up (onGraphLoad) so we can list sessions and re-fetches when reloadKey
// bumps (after ingesting text).
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import GraphCanvas, { type FilterState } from '../graph/GraphCanvas'
import type { GraphNode } from '../graph/mapGraph'
import { ingestText } from '../api/client'
import SourcesPanel from './SourcesPanel'
import ChatPanel from './ChatPanel'
import './workspace.css'

const DEFAULT_FILTER: FilterState = {
  mentions: true,
  cooccur: false,
  next: true,
  semantic: true,
  coreOnly: false,
}

const FILTER_CHIPS: { key: keyof FilterState; label: string }[] = [
  { key: 'mentions', label: '개념 근거' },
  { key: 'cooccur', label: '동시출현' },
  { key: 'next', label: '다음 세션' },
  { key: 'semantic', label: '연속·확장' },
  { key: 'coreOnly', label: '핵심 개념만' },
]

function Workspace() {
  const { projectId } = useParams()
  const project = projectId ?? ''

  const [filter, setFilter] = useState<FilterState>(DEFAULT_FILTER)
  const [sessions, setSessions] = useState<GraphNode[]>([])
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  // "텍스트로 추가" inline composer
  const [addOpen, setAddOpen] = useState(false)
  const [addTitle, setAddTitle] = useState('')
  const [addText, setAddText] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const toggle = (key: keyof FilterState) => setFilter((f) => ({ ...f, [key]: !f[key] }))

  const handleSelectSource = (id: string) => {
    const node = sessions.find((s) => s.id === id)
    if (node) setSelectedNode(node)
  }

  const handleAdd = async () => {
    if (!addText.trim() || adding) return
    setAdding(true)
    setAddError(null)
    const title = addTitle.trim() || addText.trim().slice(0, 40)
    try {
      await ingestText(project, title, addText)
      setAddTitle('')
      setAddText('')
      setAddOpen(false)
      setReloadKey((k) => k + 1) // re-fetch the graph so the new session appears
    } catch {
      setAddError('추가하지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="workspace">
      <aside className="ws-col ws-col--left">
        <SourcesPanel sessions={sessions} onSelectSource={handleSelectSource} selectedId={selectedNode?.id ?? null} />
      </aside>

      <section className="ws-col ws-col--center">
        <div className="ws-toolbar">
          <div className="ws-filters" role="group" aria-label="그래프 필터">
            {FILTER_CHIPS.map((c) => (
              <button
                key={c.key}
                type="button"
                className={`ws-chip${filter[c.key] ? ' ws-chip--on' : ''}`}
                aria-pressed={filter[c.key]}
                onClick={() => toggle(c.key)}
              >
                {c.label}
              </button>
            ))}
          </div>
          <button type="button" className="ws-add-btn" onClick={() => setAddOpen((o) => !o)} aria-expanded={addOpen}>
            <span aria-hidden="true">＋</span> 텍스트로 추가
          </button>
        </div>

        {addOpen && (
          <div className="ws-add-form">
            <input
              className="ws-add-title"
              type="text"
              placeholder="제목 (예: 9장 역전파)"
              value={addTitle}
              onChange={(e) => setAddTitle(e.target.value)}
              disabled={adding}
              aria-label="추가할 강의 제목"
            />
            <textarea
              className="ws-add-text"
              placeholder="강의·노트 본문을 붙여넣으세요…"
              value={addText}
              onChange={(e) => setAddText(e.target.value)}
              disabled={adding}
              rows={4}
              aria-label="추가할 강의 본문"
            />
            <div className="ws-add-actions">
              {addError && <span className="ws-add-error" role="alert">{addError}</span>}
              <button type="button" className="ws-add-cancel" onClick={() => setAddOpen(false)} disabled={adding}>
                취소
              </button>
              <button type="button" className="ws-add-submit" onClick={handleAdd} disabled={adding || addText.trim().length === 0}>
                {adding ? '추가 중…' : '그래프에 추가'}
              </button>
            </div>
          </div>
        )}

        <div className="ws-graph">
          <GraphCanvas
            project={project}
            filter={filter}
            reloadKey={reloadKey}
            onGraphLoad={(nodes) => setSessions(nodes.filter((n) => n.type === 'session'))}
            onSelectNode={setSelectedNode}
          />
        </div>

        {selectedNode && (
          <div className={`ws-detail ws-detail--${selectedNode.type}`}>
            <div className="ws-detail-head">
              <span className="ws-detail-kind">{selectedNode.type === 'session' ? '강의 세션' : '개념'}</span>
              <button type="button" className="ws-detail-close" onClick={() => setSelectedNode(null)} aria-label="상세 닫기">
                ✕
              </button>
            </div>
            <p className="ws-detail-label">{selectedNode.label}</p>
            <p className="ws-detail-summary">
              {selectedNode.type === 'session'
                ? `${selectedNode.seq != null ? `${selectedNode.seq}번째 강의 · ` : ''}이 강의가 다루는 개념들이 그래프에 연결돼 있어요.`
                : selectedNode.bridge
                  ? '여러 강의에 걸쳐 등장하는 핵심 개념(브리지)입니다.'
                  : '한 강의에서 등장한 개념입니다.'}
            </p>
          </div>
        )}
      </section>

      <aside className="ws-col ws-col--right">
        <ChatPanel project={project} />
      </aside>
    </div>
  )
}

export default Workspace
