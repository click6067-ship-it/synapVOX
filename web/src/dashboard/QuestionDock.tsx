// QuestionDock — ask this project a question and read the answer in place.
// Reuses useAsk (RAG) + AnswerDrawer (근거 세션 first, then answer). Exposes an
// imperative handle so the focused dashboard can drive it from elsewhere:
// `focus()` (질문하기 button) and `ask(q)` (a concept's "이 개념 질문"). When an
// answer is present, `그래프에서 근거 보기` deep-links into the graph mode.
import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import type { JSX, Ref } from 'react'
import { useAsk } from '../ask/useAsk'
import { AnswerDrawer } from '../ask/AnswerDrawer'

export type QuestionDockHandle = { focus(): void; ask(q: string): void }

// useAsk streams a graph-highlight expansion set; the dashboard has no live
// graph to highlight, so we discard it.
const ignoreExpansion = () => {}

function QuestionDockInner(
  props: { project: string; onOpenGraph(): void },
  ref: Ref<QuestionDockHandle>,
): JSX.Element {
  const { project, onOpenGraph } = props
  const [q, setQ] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const ask = useAsk(project, ignoreExpansion)

  const submit = (query: string) => {
    if (!query.trim()) return
    ask.ask(query)
    rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  useImperativeHandle(
    ref,
    () => ({
      focus() {
        rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        inputRef.current?.focus()
      },
      ask(query: string) {
        setQ(query)
        submit(query)
      },
    }),
    [ask],
  )

  const hasAnswer = Boolean(ask.answer) || ask.busy || Boolean(ask.error)

  return (
    <section className="qdock" aria-label="질문" ref={rootRef}>
      <h2 className="qdock__label">이 프로젝트에 질문하기</h2>
      <form
        className="qdock__form"
        onSubmit={(e) => {
          e.preventDefault()
          submit(q)
        }}
      >
        <input
          ref={inputRef}
          className="qdock__input"
          type="text"
          value={q}
          placeholder="예) 역전파가 왜 필요한가요?"
          onChange={(e) => setQ(e.target.value)}
          disabled={ask.busy}
        />
        <button type="submit" className="qdock__send" disabled={ask.busy || !q.trim()}>
          {ask.busy ? '찾는 중…' : '질문'}
        </button>
      </form>

      {hasAnswer ? (
        <div className="qdock__answer">
          <AnswerDrawer answer={ask.answer} busy={ask.busy} error={ask.error} onClose={ask.clear} />
          {ask.answer ? (
            <button type="button" className="qdock__graphlink" onClick={onOpenGraph}>
              그래프에서 근거 보기 →
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

const QuestionDock = forwardRef(QuestionDockInner)
export default QuestionDock
