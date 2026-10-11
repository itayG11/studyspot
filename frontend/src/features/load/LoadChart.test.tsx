// The load chart: usually and today, hour by hour, and the hour under way.

import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LoadChart } from './LoadChart'

const HOURS = [
  { hour: 9, usual: 20, today: 10 },
  { hour: 10, usual: 40, today: 45 },
  { hour: 11, usual: 30, today: null },
]

describe('LoadChart', () => {
  it('has a legend for both bars, and the live mark for today', () => {
    render(<LoadChart hours={HOURS} limit={50} currentHour={10} live={44} simulated={false} />)
    expect(screen.getByText('בדרך כלל')).toBeInTheDocument()
    expect(screen.getByText('היום')).toBeInTheDocument()
    expect(screen.getByText('חי')).toBeInTheDocument()
  })

  it('reads each hour aloud: usually, today so far, and now', () => {
    render(<LoadChart hours={HOURS} limit={50} currentHour={10} live={44} simulated />)
    const list = screen.getByRole('list', { name: 'העומס לפי שעה' })
    const items = within(list).getAllByRole('listitem').map((li) => li.textContent)
    expect(items).toEqual([
      '09:00: בדרך כלל שקט, בערך 20 אנשים, היום 10',
      '10:00: בדרך כלל בינוני, בערך 40 אנשים, עכשיו 44',
      '11:00: בדרך כלל בינוני, בערך 30 אנשים',
    ])
    expect(screen.getByText(/נוכחות מדומה/)).toBeInTheDocument()
  })

  it('without a forecast, only today', () => {
    render(<LoadChart hours={[{ hour: 9, usual: null, today: 3 }]} limit={10} currentHour={null} live={null} simulated={false} />)
    const list = screen.getByRole('list', { name: 'העומס לפי שעה' })
    expect(within(list).getByRole('listitem').textContent).toBe('09:00: היום 3')
    expect(screen.queryByText('חי')).not.toBeInTheDocument()
  })
})
