import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Heat, OverstaySettings, ReportItem } from '../api/types'
import { Overstay } from './Overstay'

const api = vi.hoisted(() => ({ getOverstay: vi.fn(), saveOverstay: vi.fn(), getReports: vi.fn(), resolveReport: vi.fn(), getHeat: vi.fn() }))
vi.mock('../api/admin', () => api)
vi.mock('../institution', () => ({ useInstitution: () => ({ slug: 'braude', timezone: 'Asia/Jerusalem' }) }))

const SETTINGS: OverstaySettings = { policy: 'reports', grace_minutes: 5, break_minutes: 20, locked: false, open_reports: 2 }
const REPORT: ReportItem = {
  id: 7, place_id: 3, place_name: 'EM107', building_code: 'EM', seat_label: null,
  created_at: '2026-10-13T09:00:00Z', status: 'open', resolution: null,
}
const HEAT: Heat = {
  days: 30,
  cells: [
    { place_id: 3, place_name: 'EM107', weekday: 1, hour: 12, count: 6 },
    { place_id: 3, place_name: 'EM107', weekday: 3, hour: 13, count: 2 },
  ],
  recommendations: [{ place_id: 3, place_name: 'EM107', count: 4, kind: 'shorten_booking' }],
}

function show() {
  return render(<MemoryRouter><Overstay /></MemoryRouter>)
}

beforeEach(() => {
  vi.clearAllMocks()
  api.getOverstay.mockResolvedValue(SETTINGS)
  api.getReports.mockResolvedValue([REPORT])
  api.getHeat.mockResolvedValue(HEAT)
  api.saveOverstay.mockImplementation(async (_slug: string, change: object) => ({ ...SETTINGS, ...change }))
  api.resolveReport.mockResolvedValue({ ...REPORT, status: 'resolved', resolution: 'handled' })
})

describe('Overstay', () => {
  it('says what each level switches on, and which one is chosen', async () => {
    show()
    const levels = await screen.findByRole('group', { name: 'מה פעיל' })
    expect(within(levels).getByRole('button', { name: 'תזכורות ודיווחים' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/סטודנט שמצא את המקום תפוס יכול לדווח/)).toBeInTheDocument()
  })

  it('changes the level and saves the minutes', async () => {
    const user = userEvent.setup()
    show()
    await user.click(await screen.findByRole('button', { name: 'תזכורות' }))
    expect(api.saveOverstay).toHaveBeenCalledWith('braude', { policy: 'reminders' })
    const grace = screen.getByLabelText(/זמן המתנה אחרי הסיום/)
    await user.clear(grace)
    await user.type(grace, '3')
    await user.click(screen.getByRole('button', { name: 'לשמור' }))
    expect(api.saveOverstay).toHaveBeenLastCalledWith('braude', { grace_minutes: 3, break_minutes: 20 })
  })

  it('is read-only on the demo campus', async () => {
    api.getOverstay.mockResolvedValue({ ...SETTINGS, locked: true })
    show()
    expect(await screen.findByText(/בקמפוס ההדגמה אי אפשר לשנות/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'לשמור' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'תזכורות' })).toBeDisabled()
  })

  it('shows when the reports come, as numbers a screen reader reads, busiest first', async () => {
    show()
    const table = await screen.findByRole('table', { name: 'הזמנים עם הכי הרבה דיווחים' })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent('EM107')
    expect(rows[0]).toHaveTextContent('שלישי')
    expect(rows[0]).toHaveTextContent('12:00')
    expect(rows[0]).toHaveTextContent('6')
    expect(rows[1]).toHaveTextContent('חמישי')
  })

  it('writes advice for a place with a pattern, in words', async () => {
    show()
    const advice = await screen.findByRole('list', { name: 'מה אפשר לעשות' })
    expect(within(advice).getByText(/EM107.*4 דיווחים בשבוע/)).toBeInTheDocument()
    expect(within(advice).getByText(/לקצר את משך ההזמנה/)).toBeInTheDocument()
  })

  it('says so when there is nothing yet', async () => {
    api.getHeat.mockResolvedValue({ days: 30, cells: [], recommendations: [] })
    api.getReports.mockResolvedValue([])
    show()
    expect(await screen.findByText('אין עדיין דיווחים ב-30 הימים האחרונים.')).toBeInTheDocument()
    expect(screen.getByText('אין דיווחים פתוחים.')).toBeInTheDocument()
  })

  it('closes a report as handled or as found empty, and it leaves the list', async () => {
    const user = userEvent.setup()
    api.getReports.mockResolvedValueOnce([REPORT]).mockResolvedValue([])
    show()
    const list = await screen.findByRole('list', { name: 'דיווחים פתוחים' })
    expect(within(list).getByText(/EM107/)).toBeInTheDocument()
    expect(list).not.toHaveTextContent(/סטודנט|מדווח/) // no one is named
    await user.click(within(list).getByRole('button', { name: 'לא היה אף אחד' }))
    expect(api.resolveReport).toHaveBeenCalledWith(7, 'nobody_there')
    expect(await screen.findByText('אין דיווחים פתוחים.')).toBeInTheDocument()
  })

  it('does not offer the reports when the level has no reports', async () => {
    api.getOverstay.mockResolvedValue({ ...SETTINGS, policy: 'reminders', open_reports: 0 })
    show()
    expect(await screen.findByText(/כדי שסטודנטים יוכלו לדווח/)).toBeInTheDocument()
  })
})
