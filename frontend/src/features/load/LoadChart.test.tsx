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
  it('names every colour in the legend, with its threshold, and the live mark', () => {
    render(<LoadChart hours={HOURS} limit={50} currentHour={10} live={44} simulated={false} />)
    expect(screen.getByText('אפור: בדרך כלל')).toBeInTheDocument()
    expect(screen.getByText('היום: שקט, פחות מ-50% מהמקומות')).toBeInTheDocument()
    expect(screen.getByText('היום: בינוני, 50% עד 85% מהמקומות')).toBeInTheDocument()
    expect(screen.getByText(/^היום: .*, 85% ומעלה מהמקומות$/)).toBeInTheDocument()
    expect(screen.getByText(/למטה: השעה/)).toBeInTheDocument()
    expect(screen.getByText('חי')).toBeInTheDocument()
  })

  it('gives every column its number above and its hour below, not every other one', () => {
    const { container } = render(<LoadChart hours={HOURS} limit={50} currentHour={10} live={44} simulated={false} />)
    const columns = [...container.querySelectorAll('[title]')]
    expect(columns).toHaveLength(3)
    // Today's number where there is one (now: the live count), else the usual.
    expect(columns.map((c) => c.firstElementChild?.textContent)).toEqual(['10', '44', '30'])
    expect(columns.map((c) => c.lastElementChild?.firstElementChild?.textContent)).toEqual(['09:00', '10:00', '11:00'])
  })

  it('another day: no "today" in the legend, the usual bars coloured by level', () => {
    const { container } = render(
      <LoadChart hours={HOURS.map((h) => ({ ...h, today: null }))} limit={50} currentHour={null} live={null} simulated={false} />,
    )
    expect(screen.queryByText('אפור: בדרך כלל')).not.toBeInTheDocument()
    expect(screen.getByText('בדרך כלל: שקט, פחות מ-50% מהמקומות')).toBeInTheDocument()
    expect([...container.querySelectorAll('[title]')].map((c) => c.firstElementChild?.textContent)).toEqual(['20', '40', '30'])
  })

  it('a group room counts how much of the hour it is booked, in percent', () => {
    const { container } = render(
      <LoadChart hours={[{ hour: 9, usual: 0.4, today: null }]} limit={1} currentHour={null} live={null} simulated={false} kind="group_room" />,
    )
    expect(container.querySelector('[title]')?.firstElementChild?.textContent).toBe('40%')
    expect(screen.getAllByText(/מהזמן/, { selector: 'span' })).toHaveLength(3)
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
