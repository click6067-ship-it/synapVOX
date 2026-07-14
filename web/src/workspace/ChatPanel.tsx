// Right column: RAG chat over the project's graph. Submitting a question appends
// the user message + a pending "…" assistant placeholder, calls ask(project, q),
// then swaps the placeholder for the answer (or a fallback on failure).
import { useEffect, useRef, useState } from 'react'
import { ApiError, ask } from '../api/client'

type Props = {
  project: string
  // Reserved: highlight cited nodes in the graph once /ask returns node refs.
  // The current backend returns only answer text, so this is not wired yet.
  onFocusNodes?: (ids: string[]) => void
}

type Role = 'user' | 'assistant'
type Message = { id: number; role: Role; text: string; pending?: boolean }

const GREETING: Message = {
  id: 0,
  role: 'assistant',
  text: '이 프로젝트의 지식 그래프에 대해 무엇이든 물어보세요. 여러 강의를 가로질러 근거를 찾아 답해 드릴게요.',
}

function IconSend() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M4 12h14M12 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ChatPanel({ project }: Props) {
  const [messages, setMessages] = useState<Message[]>([GREETING])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const nextId = useRef(1)
  const logRef = useRef<HTMLDivElement>(null)

  // Keep the log pinned to the latest message.
  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  const submit = async () => {
    const q = draft.trim()
    if (!q || busy) return
    setBusy(true)
    setDraft('')
    const userId = nextId.current++
    const pendingId = nextId.current++
    setMessages((m) => [
      ...m,
      { id: userId, role: 'user', text: q },
      { id: pendingId, role: 'assistant', text: '…', pending: true },
    ])

    try {
      const { answer } = await ask(project, q)
      const text = answer?.trim() || '관련한 근거를 찾지 못했어요. 다른 방식으로 질문해 보시겠어요?'
      setMessages((m) => m.map((msg) => (msg.id === pendingId ? { ...msg, text, pending: false } : msg)))
    } catch (e) {
      // 알려진 한도(질문이 너무 김 413 / 요청이 너무 잦음 429)는 백엔드 메시지를 그대로,
      // 그 외는 일반 재시도 안내. (Home·Workspace의 에러 전파와 동일한 규약)
      const text =
        e instanceof ApiError && (e.status === 413 || e.status === 429)
          ? e.message
          : '답변을 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.'
      setMessages((m) => m.map((msg) => (msg.id === pendingId ? { ...msg, text, pending: false } : msg)))
    } finally {
      setBusy(false)
    }
  }

  const handleSubmit = (e: { preventDefault: () => void }) => {
    e.preventDefault()
    submit()
  }

  return (
    <div className="chat-panel">
      <div className="chat-head">
        <h2 className="chat-title">AI 질문</h2>
        <span className="chat-sub">그래프 기반 답변</span>
      </div>

      <div className="chat-log" ref={logRef}>
        {messages.map((msg) => (
          <div key={msg.id} className={`chat-msg chat-msg--${msg.role}`}>
            <div className={`chat-bubble${msg.pending ? ' chat-bubble--pending' : ''}`}>{msg.text}</div>
          </div>
        ))}
      </div>

      <form className="chat-input" onSubmit={handleSubmit}>
        <input
          className="chat-input-field"
          type="text"
          placeholder="질문을 입력하세요…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={busy}
          aria-label="질문"
        />
        <button type="submit" className="chat-input-send" disabled={busy || draft.trim().length === 0} aria-label="보내기">
          <IconSend />
        </button>
      </form>
    </div>
  )
}

export default ChatPanel
