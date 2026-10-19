import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlaceCode } from '../api/types'
import { ScreenControls } from './ScreenControls'

const api = vi.hoisted(() => ({ setCheckInMode: vi.fn(), makeScreenLink: vi.fn(), removeScreenLink: vi.fn() }))
vi.mock('../api/admin', () => api)
vi.mock('../institution', () => ({ useInstitution: () => ({ timezone: 'Asia/Jerusalem' }) }))

const sign: PlaceCode = {
  place_id: 18, building_code: 'EF', place_name: 'ספרייה', code: 'p18.v1.' + 'A'.repeat(43),
  check_in_mode: 'sign', screen_active: false, screen_last_seen_at: null,
}
const onScreen: PlaceCode = { ...sign, check_in_mode: 'screen' }
const URL_ = 'https://getstudyspot.me/screen#t=secret-token-123'

beforeEach(() => vi.clearAllMocks())

describe('ScreenControls', () => {
  it('switches a place to a screen', async () => {
    api.setCheckInMode.mockResolvedValue(onScreen)
    const changed = vi.fn()
    render(<ScreenControls code={sign} onChanged={changed} />)
    await userEvent.click(screen.getByRole('button', { name: 'מסך' }))
    // Asked first: the printed sign stops at once.
    expect(screen.getByRole('alertdialog')).toHaveTextContent('השלט המודפס יפסיק לעבוד מיד')
    expect(api.setCheckInMode).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'כן, לעבור' }))
    expect(api.setCheckInMode).toHaveBeenCalledWith(18, 'screen')
    expect(changed).toHaveBeenCalledWith(onScreen)
  })

  it('a switch can be called off', async () => {
    render(<ScreenControls code={onScreen} onChanged={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'שלט מודפס' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('קישור המסך יבוטל')
    await userEvent.click(screen.getByRole('button', { name: 'ביטול' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(api.setCheckInMode).not.toHaveBeenCalled()
  })

  it('on a sign, offers no screen link', () => {
    render(<ScreenControls code={sign} onChanged={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'ליצור קישור למסך' })).toBeNull()
  })

  it('makes the link and shows it once', async () => {
    api.makeScreenLink.mockResolvedValue({ url: URL_, place: { ...onScreen, screen_active: true } })
    const changed = vi.fn()
    render(<ScreenControls code={onScreen} onChanged={changed} />)
    expect(screen.getByText(/השלט המודפס לא עובד/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'ליצור קישור למסך' }))
    expect(await screen.findByText(URL_)).toBeInTheDocument()
    expect(changed).toHaveBeenCalledWith({ ...onScreen, screen_active: true })
  })

  it('says when the screen was last seen, and removes the link after asking', async () => {
    api.removeScreenLink.mockResolvedValue(onScreen)
    const seen = { ...onScreen, screen_active: true, screen_last_seen_at: '2026-10-19T08:30:00Z' }
    render(<ScreenControls code={seen} onChanged={vi.fn()} />)
    expect(screen.getByText(/המסך נראה לאחרונה/)).toHaveTextContent('11:30')
    await userEvent.click(screen.getByRole('button', { name: 'לבטל את הקישור' }))
    await userEvent.click(screen.getByRole('button', { name: 'כן, לבטל' }))
    expect(api.removeScreenLink).toHaveBeenCalledWith(18)
  })
})
