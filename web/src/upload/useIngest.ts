// Upload/ingest state machine for a single lecture.
//
// The backend runs ONE opaque request (`POST /ingest-text`) whose LLM extraction
// takes seconds up to ~50s on a cold Render start. We cannot observe its internal
// phases, so instead of a dead spinner we surface *plausible* staged copy while
// that single request is in flight:
//   'extracting'  — set immediately on submit (개념 추출)
//   'linking'     — timed advance after a few seconds elapsed (그래프 연결)
//   'growing'     — set on the ACTUAL resolve, held long enough for the Growth
//                   Ring (900ms, spec §6) to play, then → 'done'
// On resolve we also call `onIngested(project, title)` with the project the
// lecture actually landed in — normally the current project, but in "new project"
// mode `submit` is given an explicit target slug (a brand-new group_id) so the
// caller can navigate there. Failures set 'error' and surface the backend's
// 413/429 message verbatim; everything is caught so submit NEVER throws uncaught.
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, ingestText } from '../api/client'

export type IngestStage = 'idle' | 'extracting' | 'linking' | 'growing' | 'done' | 'error'

export type UseIngest = {
  stage: IngestStage
  error: string | null
  // `target` overrides the destination project (used by "new project" mode to
  // ingest into a fresh slug); when omitted the lecture lands in `project`.
  submit: (title: string, text: string, target?: string) => void
  reset: () => void
}

// Timed advance 'extracting' → 'linking' (only if still in flight). Kept modest
// so it feels responsive but doesn't lie about "linking" before extraction could
// plausibly be done.
const LINKING_AFTER_MS = 3500
// Hold 'growing' so the Growth Ring (spec §6, 900ms) has room to play before we
// declare 'done'.
const GROWING_HOLD_MS = 900

const GENERIC_ERROR = '업로드에 실패했어요. 잠시 후 다시 시도해 주세요.'

export function useIngest(project: string, onIngested: (project: string, title: string) => void): UseIngest {
  const [stage, setStage] = useState<IngestStage>('idle')
  const [error, setError] = useState<string | null>(null)

  // Latest callback without resubscribing `submit` (keeps its identity stable).
  const onIngestedRef = useRef(onIngested)
  onIngestedRef.current = onIngested

  // Guard state-after-unmount and one-request-at-a-time.
  const aliveRef = useRef(true)
  const busyRef = useRef(false)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  const clearTimers = useCallback(() => {
    for (const t of timersRef.current) clearTimeout(t)
    timersRef.current = []
  }, [])

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      for (const t of timersRef.current) clearTimeout(t)
      timersRef.current = []
    }
  }, [])

  const reset = useCallback(() => {
    clearTimers()
    setStage('idle')
    setError(null)
  }, [clearTimers])

  const submit = useCallback(
    (title: string, text: string, target?: string) => {
      // Ignore re-submits while a request is in flight.
      if (busyRef.current) return
      busyRef.current = true

      // Destination project: an explicit `target` (new-project slug) or the
      // current project (adding a lecture to the open graph).
      const dest = target ?? project

      clearTimers()
      setError(null)
      setStage('extracting')

      // Plausible intermediate phase — only fires if the request is still open.
      timersRef.current.push(
        setTimeout(() => {
          if (!aliveRef.current) return
          setStage((s) => (s === 'extracting' ? 'linking' : s))
        }, LINKING_AFTER_MS),
      )

      const run = async () => {
        try {
          await ingestText(dest, title, text)
          if (!aliveRef.current) return
          clearTimers()
          setStage('growing')
          // Refetch/grow (same project) or navigate (new project) — must never
          // break the ingest UX if it throws.
          try {
            onIngestedRef.current(dest, title)
          } catch {
            /* graph refresh failure is not the upload's failure */
          }
          timersRef.current.push(
            setTimeout(() => {
              if (!aliveRef.current) return
              setStage('done')
            }, GROWING_HOLD_MS),
          )
        } catch (e) {
          if (!aliveRef.current) return
          clearTimers()
          // Known caps carry a useful backend message; show it verbatim.
          // 413 = 강의가 너무 김, 429 = 요청이 너무 잦음.
          const msg = e instanceof ApiError && (e.status === 413 || e.status === 429) ? e.message : GENERIC_ERROR
          setError(msg)
          setStage('error')
        } finally {
          busyRef.current = false
        }
      }

      // Fire-and-forget: `run` owns its own try/catch, so no unhandled rejection.
      void run()
    },
    [project, clearTimers],
  )

  return { stage, error, submit, reset }
}
