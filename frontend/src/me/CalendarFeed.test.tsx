import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { CalendarFeedCard } from './CalendarFeed'

const api = vi.hoisted(() => ({ calendarFeed: vi.fn(), createCalendarFeed: vi.fn(), revokeCalendarFeed: vi.fn() }))
vi.mock('../api/student', () => api)
vi.mock('../institution', () => ({ useInstitution: () => ({ timezone: 'Asia/Jerusalem' }) }))
const auth = vi.hoisted(() => ({ user: { is_demo: false } as { is_demo: boolean } | null }))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => auth }))

const URL_ = 'https://getstudyspot.me/api/calendar.ics?t=secret-token-123'
const none = { active: false, url: null, created_at: null, last_read_at: null }
const active = { active: true, url: null, created_at: '2026-10-19T08:00:00Z', last_read_at: null }

beforeEach(() => {
  vi.clearAllMocks()
  auth.user = { is_demo: false }
  api.createCalendarFeed.mockResolvedValue({ ...active, url: URL_ })
  api.revokeCalendarFeed.mockResolvedValue(undefined)
})

describe('CalendarFeedCard', () => {
  it('makes a link and shows the ways to subscribe, once', async () => {
    api.calendarFeed.mockResolvedValueOnce(none).mockResolvedValue(active)
    render(<CalendarFeedCard />)
    await userEvent.click(await screen.findByRole('button', { name: 'ליצור קישור ליומן' }))
    const google = await screen.findByRole('link', { name: /יומן Google/ })
    expect(new URL(google.getAttribute('href')!).searchParams.get('cid')).toBe(
      'webcal://getstudyspot.me/api/calendar.ics?t=secret-token-123',
    )
    expect(google).toHaveTextContent('אנדרואיד')
    expect(screen.getByRole('link', { name: /יומן של אפל/ })).not.toHaveAttribute('target')
    expect(screen.getByRole('link', { name: /יומן של אפל/ })).toHaveAttribute('href', 'webcal://getstudyspot.me/api/calendar.ics?t=secret-token-123')
    expect(screen.getByText(URL_)).toBeInTheDocument()
    expect(screen.getByText(/מי שיש לו את הקישור/)).toBeInTheDocument()
    expect(screen.getByText('הקישור מוכן. בוחרים לפי היומן שבו אתה משתמש:')).toHaveFocus()
  })

  it('copies the address', async () => {
    api.calendarFeed.mockResolvedValue(none)
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    render(<CalendarFeedCard />)
    await user.click(await screen.findByRole('button', { name: 'ליצור קישור ליומן' }))
    await user.click(await screen.findByRole('button', { name: 'העתקת הכתובת' }))
    expect(writeText).toHaveBeenCalledWith(URL_)
    expect(await screen.findByText('הכתובת הועתקה')).toBeInTheDocument()
  })

  it('an active link: when it was last read, and no address', async () => {
    api.calendarFeed.mockResolvedValue({ ...active, last_read_at: '2026-10-19T09:30:00Z' })
    render(<CalendarFeedCard />)
    expect(await screen.findByText(/היומן קרא אותו לאחרונה/)).toHaveTextContent('12:30')
    expect(screen.queryByText(/calendar\.ics/)).not.toBeInTheDocument()
  })

  it('not read yet says so', async () => {
    api.calendarFeed.mockResolvedValue(active)
    render(<CalendarFeedCard />)
    expect(await screen.findByText(/עוד לא קרא/)).toBeInTheDocument()
  })

  it('removes the link after asking', async () => {
    api.calendarFeed.mockResolvedValueOnce(active).mockResolvedValue(none)
    render(<CalendarFeedCard />)
    await userEvent.click(await screen.findByRole('button', { name: 'לבטל את הקישור' }))
    expect(api.revokeCalendarFeed).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'כן, לבטל' }))
    expect(api.revokeCalendarFeed).toHaveBeenCalled()
    expect(await screen.findByRole('button', { name: 'ליצור קישור ליומן' })).toBeInTheDocument()
  })

  it('a new link after asking, since it ends the old one', async () => {
    api.calendarFeed.mockResolvedValue(active)
    render(<CalendarFeedCard />)
    await userEvent.click(await screen.findByRole('button', { name: 'קישור חדש' }))
    await userEvent.click(screen.getByRole('button', { name: 'כן, קישור חדש' }))
    expect(api.createCalendarFeed).toHaveBeenCalled()
    expect(await screen.findByText(URL_)).toBeInTheDocument()
  })

  it('shows the error when making fails', async () => {
    api.calendarFeed.mockResolvedValue(none)
    api.createCalendarFeed.mockRejectedValue(new ApiError(403, 'calendar_demo_account'))
    render(<CalendarFeedCard />)
    await userEvent.click(await screen.findByRole('button', { name: 'ליצור קישור ליומן' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('nothing for the shared demo account', () => {
    auth.user = { is_demo: true }
    const { container } = render(<CalendarFeedCard />)
    expect(container).toBeEmptyDOMElement()
    expect(api.calendarFeed).not.toHaveBeenCalled()
  })
})
