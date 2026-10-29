import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, api, demoLogin, emailStart, getAccessToken, logout, onSessionChange, refreshSession, resetSessionForTests } from './client'

const ME = { id: 1, email: 'demo@x', display_name: 'סטודנט', role: 'student', institution_slug: 'braude' }

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function tokenResponse(token: string): Response {
  return json(200, { access_token: token, token_type: 'bearer', expires_in: 900, user: ME })
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  resetSessionForTests()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function calledPaths(): string[] {
  return fetchMock.mock.calls.map(([url]) => new URL(String(url)).pathname)
}

describe('api', () => {
  it('returns the parsed body of a public request without credentials', async () => {
    fetchMock.mockResolvedValueOnce(json(200, [{ code: 'M' }]))
    await expect(api('/institutions/braude/buildings')).resolves.toEqual([{ code: 'M' }])
    const [, init] = fetchMock.mock.calls[0]
    expect(init.credentials).toBe('omit')
    expect(init.headers.Authorization).toBeUndefined()
  })

  it('turns the server error code into an ApiError', async () => {
    fetchMock.mockResolvedValueOnce(json(404, { detail: 'place_not_found' }))
    const error = await api('/places/99').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 404, code: 'place_not_found' })
  })

  it('reports a validation error with one code', async () => {
    fetchMock.mockResolvedValueOnce(json(422, { detail: [{ loc: ['body'], msg: 'bad' }] }))
    await expect(api('/x')).rejects.toMatchObject({ status: 422, code: 'validation_error' })
  })

  it('reports a network failure with one code', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(api('/x')).rejects.toMatchObject({ status: 0, code: 'network_error' })
  })
})

describe('session', () => {
  it('sends the refresh cookie only to /auth and keeps the token in memory', async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse('t1'))
    await expect(refreshSession()).resolves.toEqual(ME)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/auth\/refresh$/)
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('include')
    expect(getAccessToken()).toBe('t1')
  })

  it('adds the access token to signed-in requests', async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse('t1')).mockResolvedValueOnce(json(200, ME))
    await refreshSession()
    await api('/me', { auth: true })
    const [, init] = fetchMock.mock.calls[1]
    expect(init.headers.Authorization).toBe('Bearer t1')
  })

  it('refreshes once and retries when the access token has expired', async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse('old'))
      .mockResolvedValueOnce(json(401, { detail: 'token_expired' }))
      .mockResolvedValueOnce(tokenResponse('new'))
      .mockResolvedValueOnce(json(200, ME))
    await refreshSession()
    await expect(api('/me', { auth: true })).resolves.toEqual(ME)
    expect(calledPaths()).toEqual(['/auth/refresh', '/me', '/auth/refresh', '/me'])
    expect(fetchMock.mock.calls[3][1].headers.Authorization).toBe('Bearer new')
  })

  it('gives up after one failed refresh', async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse('old'))
      .mockResolvedValueOnce(json(401, { detail: 'invalid_token' }))
      .mockResolvedValueOnce(json(401, { detail: 'invalid_session' }))
    await refreshSession()
    await expect(api('/me', { auth: true })).rejects.toMatchObject({ status: 401 })
    expect(getAccessToken()).toBeNull()
  })

  it('shares one refresh between requests made at the same time', async () => {
    // The server rotates the cookie on every refresh; two refreshes at once
    // would make the second look like a stolen cookie.
    fetchMock.mockResolvedValueOnce(tokenResponse('t1'))
    const [a, b] = await Promise.all([refreshSession(), refreshSession()])
    expect(a).toEqual(ME)
    expect(b).toEqual(ME)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('tells listeners who signed in and out', async () => {
    const seen: unknown[] = []
    onSessionChange((user) => seen.push(user))
    fetchMock.mockResolvedValueOnce(tokenResponse('t1')).mockResolvedValueOnce(new Response(null, { status: 204 }))
    await refreshSession()
    await logout()
    expect(seen).toEqual([ME, null])
    expect(getAccessToken()).toBeNull()
  })

  it('waits and tries again when another tab has just refreshed', async () => {
    // The other tab already got the new cookie; the browser shares it.
    fetchMock
      .mockResolvedValueOnce(json(401, { detail: 'session_rotated' }))
      .mockResolvedValueOnce(tokenResponse('t2'))
    await expect(refreshSession()).resolves.toEqual(ME)
    expect(getAccessToken()).toBe('t2')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('a server error during refresh does not sign the user out', async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse('t1')).mockResolvedValueOnce(json(502, { detail: 'bad gateway' }))
    await refreshSession()
    await expect(refreshSession()).rejects.toMatchObject({ status: 502 })
    expect(getAccessToken()).toBe('t1')
  })

  it('a late refresh failure does not undo a sign-in that happened meanwhile', async () => {
    let answerRefresh: (r: Response) => void = () => {}
    fetchMock
      .mockReturnValueOnce(new Promise<Response>((resolve) => (answerRefresh = resolve)))
      .mockResolvedValueOnce(tokenResponse('demo'))
    const pending = refreshSession() // no cookie yet: will be refused
    await demoLogin('student')
    answerRefresh(json(401, { detail: 'invalid_session' }))
    await expect(pending).resolves.toEqual(ME)
    expect(getAccessToken()).toBe('demo')
  })

  it('a missing session is signed out, not an error', async () => {
    fetchMock.mockResolvedValueOnce(json(401, { detail: 'invalid_session' }))
    await expect(refreshSession()).resolves.toBeNull()
  })

  it('demo sign-in posts the persona with credentials', async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse('demo'))
    await expect(demoLogin('admin')).resolves.toEqual(ME)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/auth\/demo\/login$/)
    expect(JSON.parse(init.body)).toEqual({ persona: 'admin' })
    expect(init.credentials).toBe('include')
    expect(getAccessToken()).toBe('demo')
  })
})

describe('email sign-in code', () => {
  const SALT = '0123456789abcdef0123456789abcdef'
  const challenge = (bits: number) => json(200, { salt: SALT, expires: 1_900_000_000, bits, signature: 'f'.repeat(64) })

  it('asks for no work when the server wants none', async () => {
    fetchMock.mockResolvedValueOnce(challenge(0)).mockResolvedValueOnce(json(202, { expires_in: 600 }))
    await expect(emailStart('a@b.c')).resolves.toEqual({ expires_in: 600 })
    expect(calledPaths()).toEqual(['/auth/email/challenge', '/auth/email/start'])
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ email: 'a@b.c' })
  })

  it('does the work the server asked for, and sends the answer with the request', async () => {
    fetchMock.mockResolvedValueOnce(challenge(6)).mockResolvedValueOnce(json(202, { expires_in: 600 }))
    await emailStart('a@b.c')
    const body = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(body.email).toBe('a@b.c')
    expect(body.pow).toMatchObject({ salt: SALT, bits: 6, expires: 1_900_000_000, signature: 'f'.repeat(64) })
    expect(Number.isInteger(body.pow.nonce)).toBe(true)
  })

  it('asks again with a fresh puzzle when the first one expired or was already used', async () => {
    fetchMock
      .mockResolvedValueOnce(challenge(4))
      .mockResolvedValueOnce(json(400, { detail: 'pow_expired' }))
      .mockResolvedValueOnce(challenge(4))
      .mockResolvedValueOnce(json(202, { expires_in: 600 }))
    await expect(emailStart('a@b.c')).resolves.toEqual({ expires_in: 600 })
    expect(calledPaths()).toEqual(['/auth/email/challenge', '/auth/email/start', '/auth/email/challenge', '/auth/email/start'])
  })

  it('gives up after one retry', async () => {
    fetchMock
      .mockResolvedValueOnce(challenge(4))
      .mockResolvedValueOnce(json(400, { detail: 'pow_used' }))
      .mockResolvedValueOnce(challenge(4))
      .mockResolvedValueOnce(json(400, { detail: 'pow_used' }))
    await expect(emailStart('a@b.c')).rejects.toMatchObject({ code: 'pow_used' })
  })

  it('passes on any other refusal without asking again', async () => {
    fetchMock.mockResolvedValueOnce(challenge(0)).mockResolvedValueOnce(json(403, { detail: 'email_domain_not_supported' }))
    await expect(emailStart('a@b.c')).rejects.toMatchObject({ code: 'email_domain_not_supported' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
