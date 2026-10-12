// "The campus today": the chart for all places, and how today compares.

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { CampusToday } from '../../api/types'
import { place } from '../../test/fixtures'
import { CampusLoad } from './CampusLoad'

// 10:20 in Jerusalem (UTC+3 in October).
const NOW = new Date('2026-10-11T07:20:00Z')

function today(overrides: Partial<CampusToday> = {}): CampusToday {
  return {
    weekday: 6, capacity: 250, occupied: 120, free_now: 130, weeks: 8, simulated: true,
    slots: [
      { start: '09:00:00', usual: 60, today: 70 },
      { start: '10:00:00', usual: 80, today: 110 },
      { start: '10:15:00', usual: 80, today: 120 },
      { start: '11:00:00', usual: 100, today: null },
    ],
    places: [],
    ...overrides,
  }
}

describe('CampusLoad', () => {
  it('says how now compares with usual, with the chart', () => {
    render(<CampusLoad data={today()} timeZone="Asia/Jerusalem" now={NOW} />)
    expect(screen.getByRole('heading', { name: 'העומס היום בקמפוס' })).toBeInTheDocument()
    expect(screen.getByText(/עכשיו 120 אנשים בקמפוס/)).toBeInTheDocument()
    expect(screen.getByText(/עמוס מהרגיל/)).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'העומס לפי שעה' })).toBeInTheDocument()
    expect(screen.getByText(/ההיסטוריה והנוכחות כאן מדומות/)).toBeInTheDocument()
  })

  it('without a forecast yet, today only and no comparison', () => {
    render(<CampusLoad data={today({ weeks: 0, simulated: false, slots: [{ start: '10:00:00', usual: null, today: 3 }] })} timeZone="Asia/Jerusalem" now={NOW} />)
    expect(screen.queryByText(/מהרגיל/)).not.toBeInTheDocument()
    expect(screen.getByText(/עוד אין חיזוי/)).toBeInTheDocument()
  })

  it('the hour under way follows the data when it is ahead of the clock', () => {
    // 10:20 by the clock, but the data already counts 11:00 (a refresh at 11:00:10).
    render(<CampusLoad data={today({ slots: [{ start: '10:00:00', usual: 80, today: 110 }, { start: '11:00:00', usual: 100, today: 90 }] })} timeZone="Asia/Jerusalem" now={NOW} />)
    const items = screen.getAllByRole('listitem').map((li) => li.textContent)
    expect(items[1]).toBe('11:00: בדרך כלל שקט, בערך 100 אנשים, עכשיו 120')
  })

  it('a closed day says so', () => {
    render(<CampusLoad data={today({ slots: [] })} timeZone="Asia/Jerusalem" now={NOW} />)
    expect(screen.getByText('הקמפוס סגור היום.')).toBeInTheDocument()
  })

  it('shows four tiles: free now, open now, rooms to book, and today against usual', () => {
    const places = [
      place({ id: 1, kind: 'computer_lab', available: 20 }),
      place({ id: 2, kind: 'group_room', available: 0, free_now: true }),
      place({ id: 3, kind: 'library', is_open: false }),
    ]
    render(<CampusLoad data={today()} places={places} timeZone="Asia/Jerusalem" now={NOW} />)
    const tiles = screen.getByRole('list', { name: 'הקמפוס עכשיו' })
    expect(tiles).toHaveTextContent('20מקומות פנויים עכשיו')
    expect(tiles).toHaveTextContent('2 מתוך 3פתוחים עכשיו')
    expect(tiles).toHaveTextContent('1חדרים פנויים להזמנה')
    expect(tiles).toHaveTextContent('עמוס מהרגילבשעה הזו')
  })

  it('without a forecast, the last tile says so', () => {
    render(<CampusLoad data={today({ weeks: 0 })} places={[place()]} timeZone="Asia/Jerusalem" now={NOW} />)
    expect(screen.getByRole('list', { name: 'הקמפוס עכשיו' })).toHaveTextContent('עוד איןחיזוי')
  })

  it('on a closed day the last tile says closed, like the line', () => {
    render(<CampusLoad data={today({ slots: [] })} places={[place({ is_open: false })]} timeZone="Asia/Jerusalem" now={NOW} />)
    expect(screen.getByText('הקמפוס סגור היום.')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'הקמפוס עכשיו' })).toHaveTextContent('סגורהיום')
  })
})
