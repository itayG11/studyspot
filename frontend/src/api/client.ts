// Every request to the server goes through this file.
//
// How signing in works from the site's side:
// - The server keeps the session in an HttpOnly cookie that page scripts
//   cannot read. It is sent only to /auth/*.
// - POST /auth/refresh trades the cookie for an access token that lives
//   15 minutes. The token is kept here, in a variable, and never in
//   localStorage, so a malicious script cannot read it from storage.
// - After a page reload the variable is empty, and one refresh restores it.

import { API_URL } from '../config'
import type { DemoPersona, Me, TokenResponse } from './types'

// A refusal from the server, with its stable English code
// (for example "place_not_found"). src/i18n/errors.ts turns it into Hebrew.
export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string) {
    super(code)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

type Listener = (user: Me | null) => void

let accessToken: string | null = null
let refreshing: Promise<Me | null> | null = null
const listeners = new Set<Listener>()

export function getAccessToken(): string | null {
  return accessToken
}

// The AuthContext listens here, so every page sees sign-in and sign-out.
export function onSessionChange(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function setSession(token: string | null, user: Me | null): void {
  accessToken = token
  for (const listener of listeners) listener(user)
}

export function resetSessionForTests(): void {
  accessToken = null
  refreshing = null
  listeners.clear()
}

interface RequestOptions {
  method?: 'GET' | 'POST'
  body?: unknown
  auth?: boolean // send the access token; refresh it once if it expired
}

async function send<T>(path: string, options: RequestOptions): Promise<T> {
  const headers: Record<string, string> = {}
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  if (options.auth && accessToken) headers.Authorization = `Bearer ${accessToken}`

  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      // The session cookie belongs to /auth only; other requests use the token.
      credentials: path.startsWith('/auth/') ? 'include' : 'omit',
    })
  } catch {
    throw new ApiError(0, 'network_error')
  }

  if (response.status === 204) return undefined as T
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) throw new ApiError(response.status, errorCode(body))
  return body as T
}

function errorCode(body: unknown): string {
  const detail = (body as { detail?: unknown } | null)?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return 'validation_error' // FastAPI's 422 list
  return 'unknown_error'
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!options.auth) return send<T>(path, options)
  if (accessToken === null && (await refreshSession()) === null) {
    throw new ApiError(401, 'not_authenticated')
  }
  try {
    return await send<T>(path, options)
  } catch (error) {
    // The token expired (15 minutes) or the session ended: one refresh, one retry.
    if (!(error instanceof ApiError) || error.status !== 401) throw error
    if ((await refreshSession()) === null) throw error
    return send<T>(path, options)
  }
}

// One refresh at a time: the server replaces the cookie on every refresh,
// and a second refresh sent with the old cookie would look like theft.
export function refreshSession(): Promise<Me | null> {
  refreshing ??= doRefresh().finally(() => {
    refreshing = null
  })
  return refreshing
}

async function doRefresh(): Promise<Me | null> {
  try {
    const result = await send<TokenResponse>('/auth/refresh', { method: 'POST' })
    setSession(result.access_token, result.user)
    return result.user
  } catch (error) {
    if (!(error instanceof ApiError) || error.status === 0) throw error
    setSession(null, null) // no session, or it ended: signed out
    return null
  }
}

export async function demoLogin(persona: DemoPersona): Promise<Me> {
  const result = await send<TokenResponse>('/auth/demo/login', { method: 'POST', body: { persona } })
  setSession(result.access_token, result.user)
  return result.user
}

export async function logout(): Promise<void> {
  try {
    await send<void>('/auth/logout', { method: 'POST' })
  } finally {
    setSession(null, null)
  }
}

export async function logoutAll(): Promise<void> {
  await api<void>('/auth/logout-all', { method: 'POST', auth: true })
  setSession(null, null)
}

// A full-page visit: the server sends the browser on to Microsoft or Google.
export function providerLoginUrl(provider: string): string {
  return `${API_URL}/auth/${encodeURIComponent(provider)}/login`
}
