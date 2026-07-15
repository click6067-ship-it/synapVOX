// EmptyOnboarding — first-entry (or an empty project). One unmistakable action,
// `첫 강의 추가`, then a plain 3-step explanation of what happens, then a way to
// look without committing: `샘플로 보기` opens a seeded sample project. Archive
// look, generous whitespace — the primary action should read as the only thing
// to do here.
import type { JSX } from 'react'
import { projectLabel } from '../graph/projectMeta'

// The seeded demo projects (P-BIO/P-LIFE/P-ML) — labels via projectLabel.
const SAMPLES = ['P-BIO', 'P-LIFE', 'P-ML']

const STEPS = [
  '강의 텍스트 붙여넣기',
  '단원·개념 자동 정리',
  '질문하거나 그래프로 보기',
]

export default function EmptyOnboarding(props: {
  onAddLecture(): void
  onSelectProject(project: string): void
}): JSX.Element {
  const { onAddLecture, onSelectProject } = props
  return (
    <section className="onboard" aria-label="시작하기">
      <div className="onboard__inner">
        <p className="onboard__eyebrow">SYNAPVOX · 아카이브</p>
        <h1 className="onboard__title">강의를 붙여넣으면, 지식이 정리됩니다</h1>

        <button type="button" className="onboard__cta" onClick={onAddLecture}>
          <span aria-hidden="true" className="onboard__cta-mark">＋</span>
          첫 강의 추가
        </button>

        <ol className="onboard__steps">
          {STEPS.map((label, i) => (
            <li key={label} className="onboard__step">
              <span className="onboard__step-num">{i + 1}</span>
              <span className="onboard__step-label">{label}</span>
            </li>
          ))}
        </ol>

        <div className="onboard__samples">
          <span className="onboard__samples-label">샘플로 보기</span>
          <ul className="onboard__sample-list">
            {SAMPLES.map((s) => (
              <li key={s}>
                <button type="button" className="onboard__sample" onClick={() => onSelectProject(s)}>
                  {projectLabel(s)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
