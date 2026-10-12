import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { Booking } from '../api/types'
import { ToastProvider } from '../ui/Toast'
import { BookingsDrawer } from './BookingsDrawer'

const ROOM: Booking = {
  id: 7, place_id: 3, place_name: 'EM107', building_code: 'EM', seat_id: null, seat_label: null,
  starts_at: '2026-10-13T08:00:00Z', ends_at: '2026-10-13T09:00:00Z', status: 'booked', source: 'advance',
}
const LAB: Booking = { ...ROOM, id: 8, place_name: 'M206', seat_id: 1, seat_label: 'A1', status: 'checked_in' }

function renderDrawer(onCancel = vi.fn(() => Promise.resolve()), onClose = vi.fn()) {
  render(
    <MemoryRouter>
      <ToastProvider>
        <BookingsDrawer open bookings={[ROOM, LAB]} timeZone="Asia/Jerusalem" onClose={onClose} onCancel={onCancel} />
      </ToastProvider>
    </MemoryRouter>,
  )
  return { onCancel, onClose }
}

describe('BookingsDrawer', () => {
  it('lists the bookings ahead, with the day and the hours in the campus time', () => {
    renderDrawer()
    const drawer = screen.getByRole('dialog', { name: 'ההזמנות הקרובות' })
    expect(within(drawer).getByText('EM107')).toBeInTheDocument()
    expect(within(drawer).getByText('M206, תא A1')).toBeInTheDocument()
    expect(within(drawer).getAllByText(/11:00–12:00/)).toHaveLength(2)
    expect(within(drawer).getByRole('link', { name: 'לכל ההזמנות באזור שלי' })).toHaveAttribute('href', '/me')
  })

  it('cancels after asking once, and only a booking not yet started', async () => {
    const { onCancel } = renderDrawer()
    const room = screen.getByRole('listitem', { name: /EM107/ })
    await userEvent.click(within(room).getByRole('button', { name: 'לבטל' }))
    await userEvent.click(within(room).getByRole('button', { name: 'כן, לבטל' }))
    expect(onCancel).toHaveBeenCalledWith(7)
    const lab = screen.getByRole('listitem', { name: /M206/ })
    expect(within(lab).queryByRole('button', { name: 'לבטל' })).not.toBeInTheDocument()
  })

  it('says why a cancel failed', async () => {
    renderDrawer(vi.fn(() => Promise.reject(new Error('boom'))))
    const room = screen.getByRole('listitem', { name: /EM107/ })
    await userEvent.click(within(room).getByRole('button', { name: 'לבטל' }))
    await userEvent.click(within(room).getByRole('button', { name: 'כן, לבטל' }))
    expect(await within(room).findByRole('alert')).toBeInTheDocument()
  })
})
