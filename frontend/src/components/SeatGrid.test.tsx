import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { seat } from '../test/fixtures'
import { seatDescription, seatState } from '../logic/seats'
import { SeatGrid } from './SeatGrid'

const TZ = 'Asia/Jerusalem'

describe('seatState', () => {
  it('a seat someone sits in is taken, even when closed', () => {
    expect(seatState(seat({ occupied: true, free_now: false }), true)).toBe('taken')
    expect(seatState(seat({ occupied: true, free_now: false }), false)).toBe('taken')
  })

  it('a free seat is free, a held one is held, and a closed lab is closed', () => {
    expect(seatState(seat(), true)).toBe('free')
    expect(seatState(seat({ free_now: false }), true)).toBe('held')
    expect(seatState(seat({ free_now: false }), false)).toBe('closed')
  })

  it('says until when a seat is free, in the institution time zone', () => {
    expect(seatDescription(seat({ free_until: '2026-10-11T09:00:00Z' }), true, TZ)).toBe('A1: פנוי עד 12:00')
    expect(seatDescription(seat(), true, TZ)).toBe('A1: פנוי')
  })
})

describe('SeatGrid', () => {
  it('places each seat in its row and column', () => {
    const seats = [seat(), seat({ id: 2, col: 2, label: 'A2', occupied: true, free_now: false }), seat({ id: 3, row: 2, label: 'B1' })]
    render(<SeatGrid seats={seats} rows={2} cols={2} placeOpen timeZone={TZ} />)
    const taken = screen.getByLabelText('A2: תפוס')
    expect(taken.style.gridColumn).toBe('2')
    expect(screen.getByLabelText('B1: פנוי').style.gridRow).toBe('2')
  })
})
