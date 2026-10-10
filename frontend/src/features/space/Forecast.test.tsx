import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Forecast } from '../../api/types'
import { jsonResponse, place } from '../../test/fixtures'
import { PlaceForecast } from './Forecast'

// Sunday 10:05 in Jerusalem (UTC+3 in October).
const NOW = new Date('2026-10-11T07:05:00Z')
const AREA = place({ id: 9, kind: 'open_area', name: 'מתחם לימוד', capacity: 50, occupied: 50, available: 0, bookable: false, counted: true })

function forecast(overrides: Partial<Forecast> = {}): Forecast {
  const slots = [['09:00', 10], ['09:15', 10], ['09:30', 12], ['09:45', 12], ['10:00', 30], ['10:15', 30], ['10:30', 44], ['10:45', 46]]
  return {
    weekday: 6, capacity: 50, weeks: 6, simulated: false, closed: false, frees_at: '10:30:00',
    slots: slots.map(([start, people]) => ({ start: `${start}:00`, people: people as number })),
    ...overrides,
  }
}

let answer: (weekday: number) => Forecast
let asked: number[]

beforeEach(() => {
  asked = []
  answer = () => forecast()
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    const weekday = Number(new URL(url).searchParams.get('weekday'))
    asked.push(weekday)
    return Promise.resolve(jsonResponse(answer(weekday)))
  }))
})

afterEach(() => vi.unstubAllGlobals())

const show = (p = AREA, now = NOW) => render(<PlaceForecast place={p} timeZone="Asia/Jerusalem" now={now} />)

describe('PlaceForecast', () => {
  it('opens on today, and compares now with the usual', async () => {
    show()
    expect(await screen.findByText('עכשיו 50 מתוך 50. בדרך כלל בשעה הזו: 30.')).toBeInTheDocument()
    expect(asked).toEqual([6])
    expect(screen.getByRole('button', { name: 'יום ראשון' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('a full place says when it usually frees up', async () => {
    show()
    // 10:05: 10:00 is under way; 10:15 usually has 30 of 50.
    expect(await screen.findByText('בדרך כלל מתפנה ב-10:15.')).toBeInTheDocument()
  })

  it('lists each hour in words for screen readers', async () => {
    show()
    const list = await screen.findByRole('list', { name: 'העומס לפי שעה' })
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '09:00: שקט, בערך 11 אנשים',
      '10:00: בינוני, בערך 38 אנשים',
    ])
  })

  it('another day has no "now"', async () => {
    const user = userEvent.setup()
    show()
    await screen.findByText(/בדרך כלל בשעה הזו/)
    answer = (weekday) => forecast(weekday === 0 ? { weekday: 0, weeks: 5 } : {})
    await user.click(screen.getByRole('button', { name: 'יום שני' }))
    expect(asked).toContain(0)
    // Monday's own answer is on screen, not the loading state in between.
    expect(await screen.findByText(/לפי 5 השבועות/)).toBeInTheDocument()
    expect(screen.queryByText(/בדרך כלל בשעה הזו/)).not.toBeInTheDocument()
    expect(screen.queryByText(/מתפנה/)).not.toBeInTheDocument()
  })

  it('says when there is too little history, instead of a made-up chart', async () => {
    answer = () => forecast({ weeks: 1, slots: [], frees_at: null })
    show()
    expect(await screen.findByText(/עוד אין מספיק נתונים/)).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'העומס לפי שעה' })).not.toBeInTheDocument()
  })

  it('a closed day says so', async () => {
    answer = () => forecast({ closed: true, slots: [], frees_at: null })
    show()
    expect(await screen.findByText('סגור ביום הזה.')).toBeInTheDocument()
  })

  it('labels a simulated history', async () => {
    answer = () => forecast({ simulated: true })
    show()
    expect(await screen.findByText(/נתוני דמו/)).toBeInTheDocument()
  })

  it('a group room speaks of the room, not of people', async () => {
    const room = place({ id: 3, kind: 'group_room', name: 'EM107', capacity: 6, occupied: 0, available: 6, free_now: true })
    answer = () => forecast({ capacity: 6, frees_at: null, slots: [{ start: '10:00:00', people: 0.9 }] })
    show(room)
    expect(await screen.findByText('בדרך כלל בשעה הזו: בדרך כלל תפוס.')).toBeInTheDocument()
  })

  it('"usually frees up" moves on with the clock, from the same answer', async () => {
    show(AREA, new Date('2026-10-11T07:35:00Z')) // 10:35: 10:30 is under way
    expect(await screen.findByText(/בדרך כלל בשעה הזו: 44/)).toBeInTheDocument()
    expect(screen.queryByText(/מתפנה ב-10:30/)).not.toBeInTheDocument()
  })
})
