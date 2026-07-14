import { describe, it, expect, vi, afterEach } from 'vitest'
import { getConcept, getSession, ApiError } from './client'

// Minimal Response stand-in for the two branches client code touches:
// `.ok`/`.status` (jsonOrThrow), `.headers.get` (req's edge-down check), `.json()`.
type MockRes = {
  ok: boolean
  status: number
  headers: { get: (k: string) => string | null }
  json: () => Promise<unknown>
}

function res(status: number, body: unknown): MockRes {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
  }
}

type FetchArgs = [input: string, init?: RequestInit]

function stubFetch(r: MockRes) {
  const fetchMock = vi.fn<(...args: FetchArgs) => Promise<MockRes>>().mockResolvedValue(r)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function headerOf(mock: ReturnType<typeof stubFetch>, i = 0): Record<string, string> {
  return (mock.mock.calls[i][1]?.headers ?? {}) as Record<string, string>
}

describe('client.getConcept', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('hits /concept/{id}?project={project} with X-API-Key and normalizes the body', async () => {
    const fetchMock = stubFetch(
      res(200, {
        concept_id: 'c1',
        label: 'Bridge',
        summary: 'a bridge concept',
        sessions: [
          { session_id: 's1', title: 'Lecture 1' },
          { session_id: 's2', title: 'Lecture 2' },
        ],
        // backend also returns `evidence` — must be dropped by the normalizer.
        evidence: [{ session_id: 's1', text: 'full text', seg_no: 0 }],
      }),
    )

    const out = await getConcept('P', 'c1')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toContain('/concept/c1?project=P')
    expect(headerOf(fetchMock)['X-API-Key']).toBe('demo-bio')

    // Normalized to plan's ConceptDetail: sessions[].session_id -> sid, no evidence key.
    expect(out).toEqual({
      concept_id: 'c1',
      label: 'Bridge',
      summary: 'a bridge concept',
      sessions: [
        { sid: 's1', title: 'Lecture 1' },
        { sid: 's2', title: 'Lecture 2' },
      ],
    })
  })

  it('url-encodes the id and project', async () => {
    const fetchMock = stubFetch(res(200, { concept_id: 'a b', label: 'x', summary: null, sessions: [] }))
    await getConcept('proj x', 'a b')
    expect(fetchMock.mock.calls[0][0]).toContain('/concept/a%20b?project=proj%20x')
  })

  it('throws ApiError on a non-2xx (404) carrying status + backend detail', async () => {
    stubFetch(res(404, { detail: 'unknown concept' }))
    await expect(getConcept('P', 'nope')).rejects.toBeInstanceOf(ApiError)
    await expect(getConcept('P', 'nope')).rejects.toMatchObject({ status: 404, message: 'unknown concept' })
  })
})

describe('client.getSession', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('hits /session/{id}?project={project} with X-API-Key and normalizes the body', async () => {
    const fetchMock = stubFetch(
      res(200, {
        session_id: 's1',
        title: 'Lecture 1',
        chapter: '',
        seq: 0,
        summary: 'preview...',
        concepts: [
          { concept_id: 'c1', label: 'Bridge' },
          { concept_id: 'c2', label: 'Solo' },
        ],
        segments: [{ seg_no: 1, speaker: null, text: 'the full lecture body' }],
      }),
    )

    const out = await getSession('P', 's1')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toContain('/session/s1?project=P')
    expect(headerOf(fetchMock)['X-API-Key']).toBe('demo-bio')

    // Normalized to plan's SessionDetail: concepts[].concept_id -> id, text from segment body.
    expect(out).toEqual({
      session_id: 's1',
      title: 'Lecture 1',
      text: 'the full lecture body',
      concepts: [
        { id: 'c1', label: 'Bridge' },
        { id: 'c2', label: 'Solo' },
      ],
    })
  })

  it('throws ApiError on a non-2xx (404) carrying status + backend detail', async () => {
    stubFetch(res(404, { detail: 'unknown session' }))
    await expect(getSession('P', 'nope')).rejects.toBeInstanceOf(ApiError)
    await expect(getSession('P', 'nope')).rejects.toMatchObject({ status: 404, message: 'unknown session' })
  })
})
