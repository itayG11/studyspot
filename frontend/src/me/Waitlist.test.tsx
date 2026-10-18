import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Waitlist } from './Waitlist'

const api = vi.hoisted(() => ({ myWaitlist: vi.fn(), leaveWaitlist: vi.fn(() => Promise.resolve()) }))
vi.mock('../api/student', () => api)
vi.mock('../institution', () => ({ useInstitution: () => ({ slug: 'braude', timezone: 'Asia/Jerusalem' }) }))

const ENTRY = {
  id: 4, place_id: 3, place_name: 'EM107', starts_at: '2026-10-12T11:00:00Z', ends_at: '2026-10-12T13:00:00Z', notified: false,
}

beforeEach(() => vi.clearAllMocks())

describe('Waitlist', () => {
  it('lists what the student waits for, in the institution time', async () => {
    api.myWaitlist.mockResolvedValue([ENTRY, { ...ENTRY, id: 5, notified: true }])
    render(<Waitlist />)
    expect(await screen.findByRole('heading', { name: 'ממתין שיתפנה' })).toBeInTheDocument()
    expect(screen.getAllByText('14:00–16:00')).toHaveLength(2)
    expect(screen.getByText(/התפנה, כדאי להזמין/)).toBeInTheDocument()
  })

  it('removes one after asking', async () => {
    api.myWaitlist.mockResolvedValueOnce([ENTRY]).mockResolvedValue([])
    render(<Waitlist />)
    await userEvent.click(await screen.findByRole('button', { name: 'להסיר' }))
    await userEvent.click(screen.getByRole('button', { name: 'כן, להסיר' }))
    expect(api.leaveWaitlist).toHaveBeenCalledWith(4)
    await vi.waitFor(() => expect(screen.queryByRole('heading')).not.toBeInTheDocument())
  })

  it('shows nothing when there is nothing to wait for', async () => {
    api.myWaitlist.mockResolvedValue([])
    const { container } = render(<Waitlist />)
    await vi.waitFor(() => expect(api.myWaitlist).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })
})
