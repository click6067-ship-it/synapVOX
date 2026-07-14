// Home = the main page (Daglo-style: no separate hero — the input+tiles+recent IS the page).
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError, ingestText, listProjects } from '../api/client'
import CreateInput from './CreateInput'
import ActionTiles from './ActionTiles'
import ProjectGrid from './ProjectGrid'
import { slugify } from './slug'
import './home.css'

// One real deep-learning lecture (from the project's existing sample set) so
// "딥러닝 샘플 불러오기" prefills something a user can read and send immediately,
// instead of a lorem-ipsum stand-in.
const SAMPLE_DL = {
  title: '신경망의 기초 — 퍼셉트론에서 다층 신경망까지',
  text: `오늘부터 딥러닝을 본격적으로 시작하겠습니다. 딥러닝은 인공 신경망이라는 모델을 여러 층으로 깊게 쌓아 데이터로부터 패턴을 학습하는 방법입니다. 가장 먼저 신경망의 가장 작은 단위인 뉴런에서 출발하겠습니다.

하나의 인공 뉴런은 여러 입력값을 받아 각각에 가중치를 곱하고, 이것들을 모두 더한 뒤 편향을 더합니다. 이렇게 계산된 값을 가중합이라고 부릅니다. 가중치는 그 입력이 얼마나 중요한지를 나타내는 숫자이고, 학습이란 결국 이 가중치를 좋은 값으로 조정하는 과정입니다.

가중합을 그대로 내보내면 신경망은 아무리 층을 쌓아도 결국 하나의 선형 함수에 지나지 않습니다. 그래서 가중합에 비선형 함수를 한 번 통과시키는데, 이것을 활성화 함수라고 합니다. 대표적으로 시그모이드, 하이퍼볼릭 탄젠트, 그리고 오늘날 가장 널리 쓰이는 렐루가 있습니다.

이런 뉴런을 여러 개 나란히 두면 하나의 층이 되고, 층을 여러 개 이어 붙이면 다층 신경망이 됩니다. 입력층으로 데이터가 들어오고, 중간의 은닉층들을 거치며 점점 더 추상적인 특징으로 바뀌고, 출력층에서 최종 예측이 나옵니다.`,
}

function Home() {
  const navigate = useNavigate()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const recentSectionRef = useRef<HTMLDivElement>(null)

  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const focusInput = () => {
    textareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    textareaRef.current?.focus()
  }

  const handleLoadSample = () => {
    setTitle(SAMPLE_DL.title)
    setText(SAMPLE_DL.text)
    setSubmitError(null)
    focusInput()
  }

  const handleViewGraph = async () => {
    try {
      const projects = await listProjects()
      // Defensive: an unexpected/error-shaped JSON body (e.g. a 404 route
      // mismatch) can resolve instead of reject — never assume it's an array.
      if (Array.isArray(projects) && projects.length > 0) {
        navigate(`/p/${projects[0].project}`)
        return
      }
    } catch {
      /* fall through to scrolling to the (error-state) recent-projects section */
    }
    recentSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleSubmit = async () => {
    if (!text.trim() || submitting) return
    setSubmitting(true)
    setSubmitError(null)
    const derivedTitle = title.trim() || text.trim().slice(0, 60)
    const slug = slugify(derivedTitle)
    try {
      await ingestText(slug, derivedTitle, text)
      navigate(`/p/${slug}`)
    } catch (e) {
      // Surface a known limit (text too long / project cap) verbatim; otherwise
      // a generic retry message. On failure we never navigate — the workspace
      // would be empty/broken — the input keeps its text so the user can retry.
      const msg =
        e instanceof ApiError && (e.status === 413 || e.status === 429)
          ? e.message
          : '그래프를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.'
      setSubmitError(msg)
      setSubmitting(false)
    }
  }

  return (
    <div className="home">
      <section className="home-hero">
        <p className="home-kicker">SYNAPVOX · KNOWLEDGE GRAPH</p>
        <h1 className="home-headline">
          노트를 붙이면,
          <br />
          <span className="home-headline-accent">지식이 세션을 가로질러 이어진다</span>
        </h1>
      </section>

      <CreateInput
        title={title}
        text={text}
        onTitleChange={setTitle}
        onTextChange={setText}
        onSubmit={handleSubmit}
        submitting={submitting}
        error={submitError}
        textareaRef={textareaRef}
      />

      <ActionTiles onAddText={focusInput} onLoadSample={handleLoadSample} onViewGraph={handleViewGraph} />

      <section className="home-recent" id="home-recent" ref={recentSectionRef}>
        <h2 className="home-section-title">최근 프로젝트</h2>
        <ProjectGrid />
      </section>
    </div>
  )
}

export default Home
