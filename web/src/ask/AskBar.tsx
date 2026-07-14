// 캔버스 위에 떠 있는 "그래프에 물어보기" 입력 바(하단). k(검색 개수)는 노출하지 않는다.
// Enter로 제출. 배치(캔버스 하단 좌측 고정)는 CSS(.askbar)가 담당 — 부모는 canvas
// zone(position:relative) 안에 렌더한다.
import { useState } from 'react'
import './ask.css'

function IconAsk() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        d="M4 12h14M12 6l6 6-6 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function AskBar(props: { onSubmit(q: string): void; busy: boolean }): React.JSX.Element {
  const { onSubmit, busy } = props
  const [draft, setDraft] = useState('')

  const submit = (e: { preventDefault: () => void }) => {
    e.preventDefault()
    const q = draft.trim()
    if (!q || busy) return
    onSubmit(q)
    setDraft('')
  }

  return (
    <form className="askbar" onSubmit={submit}>
      <input
        className="askbar__field"
        type="text"
        placeholder="그래프에 이 강의들에 대해 물어보세요"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        disabled={busy}
        aria-label="그래프에 질문"
      />
      <button
        type="submit"
        className="askbar__send"
        disabled={busy || draft.trim().length === 0}
        aria-label="질문 보내기"
      >
        <IconAsk />
      </button>
    </form>
  )
}
