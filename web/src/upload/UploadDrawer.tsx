// UploadDrawer — "＋Add lecture" panel. A student pastes a lecture's text; on
// submit we run the single ingest request and show calm, staged cold-start copy
// (extraction → linking → growing) rather than a dead spinner, then keep the
// drawer open with a "새 세션 보기" action so they can jump to the freshly grown
// graph. Archive Graph Studio aesthetic: paper chrome, ink borders, --r-1, no
// celebratory animation (spec §6 — the graph's Growth Ring is the moment).
import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { useIngest } from './useIngest'
import type { IngestStage } from './useIngest'
import './upload.css'

// Backend cap: 50,000 chars per lecture (spec §7). We block client-side so a
// too-long paste never round-trips to a 413.
const MAX_CHARS = 50000

// Copy for the in-flight (busy) phases only. Terminal stages render their own UI.
const STAGE_COPY: Partial<Record<IngestStage, string>> = {
  extracting: '강의에서 개념을 추출하고 있어요',
  linking: '개념들을 그래프에 연결하고 있어요',
  growing: '새 강의가 그래프로 자라나고 있어요',
}

// Calm 3-step progress rail — matches the staged stages, no spinner.
const STEPS: { key: 'extracting' | 'linking' | 'growing'; short: string }[] = [
  { key: 'extracting', short: '추출' },
  { key: 'linking', short: '연결' },
  { key: 'growing', short: '성장' },
]

export function UploadDrawer(props: {
  project: string
  open: boolean
  onClose: () => void
  onIngested: (title: string) => void
}): JSX.Element | null {
  const { project, open, onClose, onIngested } = props
  const { stage, error, submit, reset } = useIngest(project, onIngested)

  const [title, setTitle] = useState('')
  const [text, setText] = useState('')

  const busy = stage === 'extracting' || stage === 'linking' || stage === 'growing'
  const done = stage === 'done'
  const over = text.length > MAX_CHARS
  const canSubmit = !busy && title.trim().length > 0 && text.trim().length > 0 && !over

  // Reopening after a completed upload starts fresh. In-progress / error text is
  // preserved across a manual close so a retry keeps the student's paste.
  useEffect(() => {
    if (open && stage === 'done') {
      setTitle('')
      setText('')
      reset()
    }
    // Intentionally keyed on `open` only — we react to the drawer opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  const handleSubmit = (e: { preventDefault: () => void }) => {
    e.preventDefault()
    if (!canSubmit) return
    submit(title.trim(), text)
  }

  // Done → "새 세션 보기": clear the form, reset the machine, hand off to close.
  const handleView = () => {
    setTitle('')
    setText('')
    reset()
    onClose()
  }

  const stepIndex = STEPS.findIndex((s) => s.key === stage)

  return (
    <div className="upload" role="dialog" aria-modal="true" aria-label="강의 추가">
      {/* Backdrop — dismiss when idle; during an in-flight ingest it stays put. */}
      <div className="upload__backdrop" onClick={busy ? undefined : onClose} aria-hidden="true" />

      <aside className="upload__panel">
        <header className="upload__head">
          <h2 className="upload__title">강의 추가</h2>
          <button type="button" className="upload__close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </header>

        <form className="upload__form" onSubmit={handleSubmit}>
          <label className="upload__label" htmlFor="upload-title">
            제목
          </label>
          <input
            id="upload-title"
            className="upload__input"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 3주차 — 세포 호흡"
            disabled={busy || done}
            autoComplete="off"
          />

          <div className="upload__labelrow">
            <label className="upload__label" htmlFor="upload-text">
              강의 노트
            </label>
            <span className={`upload__counter${over ? ' upload__counter--over' : ''}`}>
              {text.length.toLocaleString('en-US')} / 50,000
            </span>
          </div>
          <textarea
            id="upload-text"
            className="upload__textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="강의 내용을 여기에 붙여넣으세요…"
            disabled={busy || done}
            spellCheck={false}
          />
          {over && <p className="upload__hint">5만 자 이하로 줄여 주세요.</p>}

          {busy && (
            <div className="upload__progress" role="status" aria-live="polite">
              <div className="upload__rail" aria-hidden="true">
                {STEPS.map((s, i) => (
                  <div
                    key={s.key}
                    className={[
                      'upload__step',
                      stepIndex >= i ? 'is-reached' : '',
                      s.key === stage ? 'is-current' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <span className="upload__dot" />
                    <span className="upload__steplabel">{s.short}</span>
                  </div>
                ))}
              </div>
              <p className="upload__stagecopy">{STAGE_COPY[stage]}</p>
              <p className="upload__reassure">서버를 깨우는 중일 수 있어요. 추출에 최대 1분까지 걸릴 수 있어요.</p>
            </div>
          )}

          {stage === 'error' && error && (
            <p className="upload__error" role="alert">
              {error}
            </p>
          )}

          {done && (
            <p className="upload__donecopy" role="status">
              새 강의가 그래프에 흡수됐어요.
            </p>
          )}

          <footer className="upload__foot">
            {done ? (
              <button type="button" className="upload__cta" onClick={handleView}>
                새 세션 보기
              </button>
            ) : (
              <button type="submit" className="upload__cta" disabled={!canSubmit}>
                {busy ? '추가하는 중…' : '그래프에 추가'}
              </button>
            )}
          </footer>
        </form>
      </aside>
    </div>
  )
}
