import { describe, expect, it, vi } from 'vitest'

describe('apiAddress', () => {
  it('makes a relative /api absolute on the site', async () => {
    vi.resetModules()
    vi.doMock('../config', () => ({ API_URL: '/api' }))
    const { apiAddress } = await import('./apiUrl')
    expect(apiAddress('https://getstudyspot.me')).toBe('https://getstudyspot.me/api')
  })

  it('keeps a full address as it is', async () => {
    vi.resetModules()
    vi.doMock('../config', () => ({ API_URL: 'http://localhost:8000' }))
    const { apiAddress } = await import('./apiUrl')
    expect(apiAddress('http://localhost:5173')).toBe('http://localhost:8000')
  })
})
