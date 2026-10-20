import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import type { SharedStay } from '../api/share'
import { inPlace } from '../logic/share'
import { SharePage } from './SharePage'

const api = vi.hoisted(() => ({ getShare: vi.fn() }))
vi.mock('../api/share', () => api)

const TOKEN = 'c42.n1.' + 'A'.repeat(43)
const stay: SharedStay = {
  name: 'יעל',
  here_now: true,
  starts_at: '2026-10-19T07:00:00Z',
  until: '2026-10-19T09:30:00Z',
  place_id: 18,
  place_name: 'ספרייה',
  building_code: 'EF',
  building_name: 'הספרייה',
  slug: 'braude',
  timezone: 'Asia/Jerusalem',
}

function show() {
  return render(
    <MemoryRouter initialEntries={[`/s/${TOKEN}`]}>
      <Routes>
        <Route path="/s/:token" element={<SharePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('SharePage', () => {
  it('joins "ב" to Hebrew and adds a hyphen before anything else', () => {
    expect([inPlace('ספרייה'), inPlace('M206')]).toEqual(['בספרייה', 'ב-M206'])
  })

  it('says who, where and until when, with a link to the place', async () => {
    api.getShare.mockResolvedValue(stay)
    show()
    expect(await screen.findByRole('heading', { name: 'לומד/ת עכשיו בספרייה' })).toBeInTheDocument()
    expect(api.getShare).toHaveBeenCalledWith(TOKEN)
    expect(screen.getByText('יעל')).toBeInTheDocument()
    expect(screen.getByText('עד 12:30')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /לדף המקום/ })).toHaveAttribute('href', '/braude/spaces/18')
  })

  it('says when a booking starts, and no name when none was chosen', async () => {
    api.getShare.mockResolvedValue({ ...stay, name: null, here_now: false })
    show()
    expect(await screen.findByRole('heading', { name: 'ילמד/תלמד בספרייה' })).toBeInTheDocument()
    expect(screen.getByText('מ-10:00 עד 12:30')).toBeInTheDocument()
    expect(screen.queryByText('יעל')).not.toBeInTheDocument()
  })

  it('says the link has ended once the stay is over', async () => {
    api.getShare.mockRejectedValue(new ApiError(404, 'share_ended'))
    show()
    expect(await screen.findByRole('heading', { name: 'הקישור כבר לא פעיל' })).toBeInTheDocument()
  })
})
