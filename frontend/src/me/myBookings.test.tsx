import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { myBookings } from '../api/student'
import { MyBookingsProvider, useMyBookings } from './myBookings'

vi.mock('../api/student', () => ({ myBookings: vi.fn(() => Promise.resolve([])) }))

function Reader({ name }: { name: string }) {
  const bookings = useMyBookings()
  return <p>{bookings.data ? `${name}: ${bookings.data.length}` : `${name}: loading`}</p>
}

afterEach(() => vi.mocked(myBookings).mockClear())

describe('my bookings, shared', () => {
  it('asks the server once for the header and the page together', async () => {
    render(
      <MyBookingsProvider userId={7}>
        <Reader name="header" />
        <Reader name="page" />
      </MyBookingsProvider>,
    )
    expect(await screen.findByText('header: 0')).toBeInTheDocument()
    expect(screen.getByText('page: 0')).toBeInTheDocument()
    expect(myBookings).toHaveBeenCalledTimes(1)
  })

  it('asks nothing for a visitor who is not signed in', () => {
    render(
      <MyBookingsProvider userId={null}>
        <p>hello</p>
      </MyBookingsProvider>,
    )
    expect(myBookings).not.toHaveBeenCalled()
  })

  it('a page shown on its own (a test, or no header) loads its own', async () => {
    render(<Reader name="alone" />)
    expect(await screen.findByText('alone: 0')).toBeInTheDocument()
    expect(myBookings).toHaveBeenCalledTimes(1)
  })
})
