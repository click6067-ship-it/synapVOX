// QuestionRail — the far-right "질문하기" sidebar (persistent, mirrors the left
// spine). Presentational: AppLayout owns the RAG state (useAsk) so the same ask
// also highlights the graph in graph mode; this rail just renders the input +
// answer and focuses itself when the left nav / a concept requests it.
import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { AnswerDrawer } from './AnswerDrawer'
import type { AskResult } from '../api/types'
import { projectLabel } from '../graph/projectMeta'
import './qrail.css'

export function QuestionRail(props: {
  project: string
  answer: AskResult | null
  busy: boolean
  error: string | null
  onAsk(q: string): void
  onClear(): void
  focusNonce: number
  note?: string // e.g. multi-project graph → "질문은 이 과목 기준"
}): JSX.Element {
  const { project, answer, busy, error, onAsk, onClear, focusNonce, note } = props
  const [q, setQ] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Left-nav 질문하기 / a concept's "이 개념 질문" bump focusNonce → focus the input.
  useEffect(() => {
    if (focusNonce) inputRef.current?.focus()
  }, [focusNonce])

  const enabled = Boolean(project)
  const hasAnswer = Boolean(answer) || busy || Boolean(error)

  return (
    <aside className="qrail" aria-label="질문하기">
      <header className="qrail__head">
        <span className="qrail__title">질문하기</span>
        {enabled ? <span className="qrail__scope">{projectLabel(project)}</span> : null}
      </header>

      {enabled ? (
        <>
          <form
            className="qrail__form"
            onSubmit={(e) => {
              e.preventDefault()
              if (!q.trim() || busy) return
              onAsk(q)
              setQ('') // answer shows below; a stale query in the box is noise
            }}
          >
            <input
              ref={inputRef}
              className="qrail__input"
              type="text"
              value={q}
              placeholder="예) 역전파가 왜 필요한가요?"
              onChange={(e) => setQ(e.target.value)}
              disabled={busy}
            />
            <button type="submit" className="qrail__send" disabled={busy || !q.trim()}>
              {busy ? '찾는 중…' : '질문'}
            </button>
          </form>

          {note ? <p className="qrail__note">{note}</p> : null}

          <div className="qrail__body">
            {hasAnswer ? (
              <AnswerDrawer answer={answer} busy={busy} error={error} onClose={onClear} />
            ) : (
              <p className="qrail__hint">
                이 과목의 강의들을 근거로 답합니다. 그래프 모드에선 근거 개념이 하이라이트돼요.
              </p>
            )}
          </div>
        </>
      ) : (
        <p className="qrail__empty">왼쪽에서 과목을 열면 그 과목에 질문할 수 있어요.</p>
      )}
    </aside>
  )
}
