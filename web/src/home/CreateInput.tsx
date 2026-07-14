// The main entry point (Daglo-style: no separate hero, THIS is the page).
// A big paste-target for lecture/meeting text + a title + a send button.
// Controlled from Home so an ActionTiles sample-load can prefill it.
import type { KeyboardEvent, Ref } from 'react'

type Props = {
  title: string
  text: string
  onTitleChange: (v: string) => void
  onTextChange: (v: string) => void
  onSubmit: () => void
  submitting: boolean
  error: string | null
  textareaRef?: Ref<HTMLTextAreaElement>
}

function IconSend() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M4 12h14M12 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CreateInput({ title, text, onTitleChange, onTextChange, onSubmit, submitting, error, textareaRef }: Props) {
  const disabled = submitting || text.trim().length === 0

  const handleSubmit = (e: { preventDefault: () => void }) => {
    e.preventDefault()
    if (!disabled) onSubmit()
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !disabled) {
      e.preventDefault()
      onSubmit()
    }
  }

  return (
    <form className="create-input" onSubmit={handleSubmit}>
      <textarea
        ref={textareaRef}
        className="create-input-text"
        placeholder="강의·노트를 붙여넣으면 개념을 뽑아 지식 그래프로 이어 드려요. 여러 강의는 워크스페이스에서 계속 추가할 수 있어요."
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={submitting}
        rows={8}
        aria-label="강의·노트 본문"
      />
      <div className="create-input-row">
        <input
          className="create-input-title"
          type="text"
          placeholder="제목 (예: 8장 광합성)"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          disabled={submitting}
          aria-label="제목"
        />
        <button type="submit" className="create-input-submit" disabled={disabled}>
          {submitting ? (
            <>
              <span className="create-input-spinner" aria-hidden="true" />
              만드는 중…
            </>
          ) : (
            <>
              <IconSend />
              그래프 만들기
            </>
          )}
        </button>
      </div>
      {error && (
        <p className="create-input-error" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}

export default CreateInput
