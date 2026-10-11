// "The campus today": the chart for all places, and how today compares.

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { CampusToday } from '../../api/types'
import { CampusLoad } from './CampusLoad'

// 10:20 in Jerusalem (UTC+3 in October).
const NOW = new Date('2026-10-11T07:20:00Z')

function today(overrides: Partial<CampusToday> = {}): CampusToday {
  return {
    weekday: 6, capacity: 250, occupied: 120, weeks: 8, simulated: true,
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

  it('a closed day says so', () => {
    render(<CampusLoad data={today({ slots: [] })} timeZone="Asia/Jerusalem" now={NOW} />)
    expect(screen.getByText('הקמפוס סגור היום.')).toBeInTheDocument()
  })
})
