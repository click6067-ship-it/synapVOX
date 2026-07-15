// TopWorkbench — the dashboard header band. The one unmistakable primary action
// on entry is `강의 추가`; `질문하기` (secondary) and, in a focused project,
// `그래프로 보기` (tertiary) sit beside it. Archive look: mono eyebrow, Fraunces
// title, mono subtitle, flat ink CTA — no rounded card, no shadow.
import type { JSX } from 'react'

export default function TopWorkbench(props: {
  title: string
  subtitle?: string
  eyebrow?: string
  onAddLecture(): void
  onQuestion(): void
  onOpenGraph?(): void
}): JSX.Element {
  const { title, subtitle, eyebrow, onAddLecture, onQuestion, onOpenGraph } = props
  return (
    <header className="workbench">
      {eyebrow ? <p className="workbench__eyebrow">{eyebrow}</p> : null}
      <h1 className="workbench__title">{title}</h1>
      {subtitle ? <p className="workbench__subtitle">{subtitle}</p> : null}
      <div className="workbench__actions">
        <button type="button" className="workbench__cta" onClick={onAddLecture}>
          <span aria-hidden="true" className="workbench__cta-mark">＋</span>
          강의 추가
        </button>
        <button type="button" className="workbench__secondary" onClick={onQuestion}>
          질문하기
        </button>
        {onOpenGraph ? (
          <button type="button" className="workbench__graphlink" onClick={onOpenGraph}>
            그래프로 보기 →
          </button>
        ) : null}
      </div>
    </header>
  )
}
