import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import type { ScreenView } from '../api/screen'
import { ScreenPage } from './ScreenPage'

const api = vi.hoisted(() => ({ getScreen: vi.fn() }))
vi.mock('../api/screen', () => api)

const CODE = 'p18.v1.w29345678.' + 'A'.repeat(43)
const open: ScreenView = { place_name: 'ספרייה', building_code: 'EF', code: CODE, seconds_left: 42, occupied: 34, capacity: 80 }

function show(hash = '#t=screen-token-0123456789') {
  return render(
    <MemoryRouter initialEntries={[`/screen${hash}`]}>
      <ScreenPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  api.getScreen.mockResolvedValue(open)
})

describe('the screen by the door', () => {
  it('shows the QR code of this minute, the place and how many seats are free', async () => {
    show()
    expect(await screen.findByRole('img', { name: /קוד QR לכניסה לספרייה/ })).toBeInTheDocument()
    expect(api.getScreen).toHaveBeenCalledWith('screen-token-0123456789')
    expect(screen.getByRole('heading', { name: 'ספרייה' })).toBeInTheDocument()
    expect(screen.getByText(/פנויים מתוך 80/)).toHaveTextContent('46 פנויים מתוך 80')
    expect(screen.getByText(/^קוד חדש בעוד 4[12] שניות$/)).toBeInTheDocument() // a second may pass
  })

  it('the countdown bar keeps the timing it got with its code, while the seconds tick', async () => {
    vi.useFakeTimers()
    try {
      api.getScreen.mockResolvedValue({ ...open, seconds_left: 40 })
      show()
      await act(() => vi.advanceTimersByTimeAsync(0))
      const bar = screen.getByTestId('bar')
      // 60 s for a whole minute, started 20 s in: empty exactly when the code changes.
      expect(bar.style.animationDuration).toBe('60s')
      expect(bar.style.animationDelay).toBe('-20s')
      await act(() => vi.advanceTimersByTimeAsync(5_000))
      expect(screen.getByTestId('bar').style.animationDelay).toBe('-20s')
      expect(screen.getByText('קוד חדש בעוד 35 שניות')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('a link cut short when copied is refused at once, not loading forever', async () => {
    api.getScreen.mockRejectedValue(new ApiError(422, 'validation_error'))
    show('#t=short')
    expect(await screen.findByRole('alert')).toHaveTextContent('מבקשים קישור חדש')
    expect(api.getScreen).toHaveBeenCalledTimes(1)
  })

  it('says when the place is closed, with no code', async () => {
    api.getScreen.mockResolvedValue({ ...open, code: null })
    show()
    expect(await screen.findByText('המקום סגור עכשיו.')).toBeInTheDocument()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('an unknown link asks for a new one, and stops asking', async () => {
    api.getScreen.mockRejectedValue(new ApiError(404, 'screen_not_found'))
    show()
    expect(await screen.findByRole('alert')).toHaveTextContent('מבקשים קישור חדש')
    expect(api.getScreen).toHaveBeenCalledTimes(1)
  })

  it('without a link in the address, says so and asks nothing', () => {
    show('')
    expect(screen.getByRole('alert')).toHaveTextContent('לא בתוקף')
    expect(api.getScreen).not.toHaveBeenCalled()
  })

  it('when the network drops, keeps the code it has for a while, and says it is trying again', async () => {
    vi.useFakeTimers()
    try {
      api.getScreen.mockResolvedValueOnce({ ...open, seconds_left: 10 }).mockRejectedValue(new ApiError(0, 'network_error'))
      show()
      await act(() => vi.advanceTimersByTimeAsync(0))
      expect(screen.getByRole('img', { name: /קוד QR/ })).toBeInTheDocument()
      await act(() => vi.advanceTimersByTimeAsync(10_300)) // asks again just after the minute: fails
      expect(screen.getByRole('status')).toHaveTextContent('אין חיבור לשרת')
      expect(screen.getByRole('img', { name: /קוד QR/ })).toBeInTheDocument() // the server still takes it
      await act(() => vi.advanceTimersByTimeAsync(40_000)) // past the last minute too
      expect(screen.queryByRole('img', { name: /קוד QR/ })).toBeNull()
      expect(screen.getByText(/הקוד יחזור כשהחיבור יחזור/)).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('without a network from the start, shows no code at all', async () => {
    api.getScreen.mockRejectedValue(new ApiError(0, 'network_error'))
    show()
    // Nothing came yet: still the loading line, not an old code.
    expect(await screen.findByRole('status')).toHaveTextContent('טוען')
  })
})
