// "My area": the timetable, and the places it suggests between classes.

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetSessionForTests } from '../api/client'
import type { BetweenClasses, ClassSlot, Suggestion } from '../api/types'
import { AuthProvider } from '../auth/AuthContext'
import { InstitutionProvider } from '../institution'
import { building, jsonResponse } from '../test/fixtures'
import { ToastProvider } from '../ui'
import { MyPage } from './MyPage'

let ME = { id: 1, email: 'noa@gmail.com', display_name: 'נועה', role: 'student', institution_slug: 'braude', is_demo: false }
const INSTITUTION = {
  slug: 'braude', name: 'מכללת בראודה', timezone: 'Asia/Jerusalem',
  booking_rules: { slot_minutes: 15, max_minutes: 120, days_ahead: 4, horizon_minutes: 5760, max_upcoming: 2, arrive_early_minutes: 10, no_show_after_minutes: 15 },
}
const DATA: ClassSlot = { id: 1, weekday: 6, starts: '08:30:00', ends: '10:00:00', building_code: 'M', place_text: null, title: 'מבני נתונים' }
const MATH: ClassSlot = { id: 2, weekday: 6, starts: '11:30:00', ends: '13:00:00', building_code: 'EF', place_text: null, title: null }

function suggestion(overrides: Partial<Suggestion> = {}): Suggestion {
  return {
    place_id: 5, name: 'ספרייה', kind: 'library', building_code: 'EF', walk_there: 2, walk_after: 1,
    sit_from: '2026-10-11T07:02:00Z', sit_until: '2026-10-11T08:29:00Z', sit_minutes: 87,
    bookable: false, capacity: 40, available: 12, usual: null, ...overrides,
  }
}

let classes: ClassSlot[]
let between: BetweenClasses
let asked: (string | null)[] = []
let otherDay: BetweenClasses | null // what another weekday's request answers
let sent: { method: string; path: string; body: unknown }[]

beforeEach(() => {
  // Sunday 10:05 in Israel, like the fixtures: the tests do not depend on today.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-11T07:05:00Z'))
  resetSessionForTests()
  ME = { ...ME, is_demo: false }
  classes = [DATA, MATH]
  between = {
    weekday: 6,
    date: '2026-10-11',
    routed_walks: false,
    gaps: [{
      starts: '10:00:00', ends: '11:30:00', from_building: 'M', to_building: 'EF', from_listed: true, to_listed: true, now: true,
      suggestions: [
        suggestion(),
        suggestion({ place_id: 3, name: 'EM107', kind: 'group_room', building_code: 'EM', walk_there: 3, walk_after: 2, sit_minutes: 80, bookable: true, available: null }),
        suggestion({ place_id: 6, name: 'מתחם לימוד', kind: 'open_area', available: null, usual: 30, capacity: 50, sit_minutes: 70 }),
      ],
    }],
  }
  sent = []
  asked = []
  otherDay = null
  vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => {
    const path = new URL(url).pathname
    const method = init.method ?? 'GET'
    if (method !== 'GET' && !path.startsWith('/auth/')) sent.push({ method, path, body: init.body ? JSON.parse(String(init.body)) : null })
    if (path === '/auth/refresh')
      return Promise.resolve(jsonResponse({ access_token: 't', token_type: 'bearer', expires_in: 900, user: ME }))
    if (path === '/institutions/braude') return Promise.resolve(jsonResponse(INSTITUTION))
    if (path === '/institutions/braude/buildings')
      return Promise.resolve(jsonResponse([building({ code: 'M' }), building({ id: 2, code: 'EF' }), building({ id: 3, code: 'NG', status: 'under_construction' })]))
    if (path === '/institutions/braude/places') return Promise.resolve(jsonResponse([]))
    if (path === '/me/bookings') return Promise.resolve(jsonResponse([]))
    if (path === '/me/check-in') return Promise.resolve(jsonResponse(null))
    if (path === '/me/between-classes') {
      // Another weekday asked for: that day's gaps (the fixture's, renumbered).
      const day = new URL(url).searchParams.get('weekday')
      asked.push(day)
      return Promise.resolve(jsonResponse(day === null ? between : { ...(otherDay ?? between), weekday: Number(day), date: '2026-10-18' }))
    }
    if (path === '/me/classes' && method === 'DELETE') {
      const removed = classes.length
      classes = []
      return Promise.resolve(jsonResponse({ removed }))
    }
    if (path === '/me/classes' && method === 'POST') {
      const body = JSON.parse(String(init.body))
      if (body.starts === '09:00') return Promise.resolve(jsonResponse({ detail: 'class_overlaps' }, 409))
      const created = { id: 9, ...body, starts: `${body.starts}:00`, ends: `${body.ends}:00` }
      classes = [...classes, created]
      return Promise.resolve(jsonResponse(created, 201))
    }
    if (path === '/me/classes') return Promise.resolve(jsonResponse(classes))
    if (path === '/me/classes/1' && method === 'DELETE') {
      classes = classes.filter((c) => c.id !== 1)
      return Promise.resolve(new Response(null, { status: 204 }))
    }
    return Promise.resolve(jsonResponse({ detail: 'unknown' }, 404))
  }))
})

afterEach(() => {
  vi.useRealTimers() // a test may have frozen the clock
  vi.unstubAllGlobals()
  localStorage.clear()
})

function renderMe() {
  const router = createMemoryRouter([{ path: '/me', element: <MyPage /> }, { path: '*', element: <p>דף אחר</p> }], { initialEntries: ['/me'] })
  render(
    <AuthProvider>
      <InstitutionProvider slug="braude">
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </InstitutionProvider>
    </AuthProvider>,
  )
  return router
}

const betweenSection = () => screen.findByRole('region', { name: 'בין שיעורים היום' })
const weekSection = () => screen.findByRole('region', { name: 'מערכת השעות' })

describe('between classes', () => {
  it('shows the gap under way and its suggestions, each with why', async () => {
    renderMe()
    const gap = await within(await betweenSection()).findByRole('article', { name: 'הפסקה 10:00–11:30' })
    expect(within(gap).getByText('עכשיו')).toBeInTheDocument()
    expect(within(gap).getByText(/מבניין M לבניין EF/)).toBeInTheDocument()
    const items = within(gap).getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent('ספרייה')
    expect(items[0]).toHaveTextContent('בניין EF · 2 דקות הליכה')
    expect(items[0]).toHaveTextContent('87 דקות לשבת')
    expect(items[0]).toHaveTextContent('12 מקומות פנויים עכשיו')
    expect(items[1]).toHaveTextContent('החדר פנוי, אפשר להזמין')
    expect(items[2]).toHaveTextContent('בדרך כלל בינוני')
    expect(within(items[0]).getByRole('link', { name: 'ספרייה' })).toHaveAttribute('href', '/braude/spaces/5')
  })

  it('says walking times are an estimate, unless the campus has routed ones, which are credited', async () => {
    renderMe()
    const section = await betweenSection()
    expect(await within(section).findByText(/הערכה לפי המפה/)).toBeInTheDocument()
    expect(within(section).queryByText(/openrouteservice/i)).not.toBeInTheDocument()
  })

  it('credits OpenRouteService when the walking times come from it', async () => {
    between = { ...between, routed_walks: true }
    renderMe()
    const section = await betweenSection()
    expect(await within(section).findByText(/לפי מסלולי הליכה/)).toBeInTheDocument()
    expect(within(section).getByText(/© openrouteservice.org by HeiGIT \| Map data © OpenStreetMap contributors/)).toBeInTheDocument()
  })

  it('without a timetable, says how to start', async () => {
    classes = []
    between = { weekday: 6, date: '2026-10-11', routed_walks: false, gaps: [] }
    renderMe()
    expect(await within(await betweenSection()).findByText(/הוסף את השיעורים שלך/)).toBeInTheDocument()
  })

  it('a day without gaps says so', async () => {
    classes = [DATA]
    between = { weekday: 6, date: '2026-10-11', routed_walks: false, gaps: [] }
    renderMe()
    expect(await within(await betweenSection()).findByText(/אין היום הפסקות/)).toBeInTheDocument()
  })

  it('a gap that is over says so, instead of "no gaps today"', async () => {
    // Today has a gap, 10:00–11:30, but the server no longer lists it.
    between = { weekday: 6, date: '2026-10-11', routed_walks: false, gaps: [] }
    renderMe()
    const section = await betweenSection()
    expect(await within(section).findByText(/ההפסקה של היום כבר נגמרה/)).toBeInTheDocument()
    expect(within(section).getByText('10:00–11:30')).toBeInTheDocument()
    expect(within(section).queryByText(/אין היום הפסקות/)).not.toBeInTheDocument()
  })

  it('a gap with nowhere fitting says so', async () => {
    between = { weekday: 6, date: '2026-10-11', routed_walks: false, gaps: [{ ...between.gaps[0], suggestions: [] }] }
    renderMe()
    expect(await within(await betweenSection()).findByText(/אין מקום פתוח ופנוי/)).toBeInTheDocument()
  })

  it('tells the demo visitor the timetable is a shared sample', async () => {
    ME = { ...ME, is_demo: true }
    renderMe()
    expect(await within(await weekSection()).findByText(/לדוגמה, ומשותפת לכל המבקרים/)).toBeInTheDocument()
  })
})

describe('the timetable', () => {
  it('shows the week as a grid: each class at its day, and the break between them', async () => {
    renderMe()
    const week = await weekSection()
    const sunday = await within(week).findByRole('list', { name: 'יום ראשון' })
    expect(within(sunday).getByRole('button', { name: 'מבני נתונים, יום ראשון 08:30 עד 10:00, בניין M' })).toBeInTheDocument()
    expect(within(sunday).getByRole('button', { name: 'שיעור, יום ראשון 11:30 עד 13:00, בניין EF' })).toBeInTheDocument()
    expect(within(sunday).getByRole('button', { name: 'הפסקה של 90 דקות, יום ראשון 10:00 עד 11:30' })).toBeInTheDocument()
  })

  it('a break today shows where to go in it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-11T07:05:00Z')) // Sunday 10:05 in Jerusalem
    const user = userEvent.setup()
    renderMe()
    const week = await weekSection()
    await user.click(await within(week).findByRole('button', { name: /^הפסקה של 90 דקות/ }))
    const details = within(week).getByRole('region', { name: 'פרטי ההפסקה' })
    expect(within(details).getByRole('link', { name: 'ספרייה' })).toBeInTheDocument()
  })

  it('an empty hour picked fills the form with its day and half hour, and keeps what was typed', async () => {
    const user = userEvent.setup()
    renderMe()
    const week = await weekSection()
    const monday = await within(week).findByRole('list', { name: 'יום שני' })
    await user.type(within(week).getByLabelText(/שם הקורס/), 'אלגוריתמים')
    // The day's column runs 08:00–20:00 over 600px: a click at 300px is 14:00.
    const column = monday.parentElement as HTMLElement
    column.getBoundingClientRect = () => ({ top: 0, height: 600, left: 0, right: 100, bottom: 600, width: 100, x: 0, y: 0, toJSON: () => ({}) })
    fireEvent.click(column, { clientY: 310 })
    expect(within(week).getByLabelText('יום')).toHaveValue('0')
    expect(within(week).getByLabelText('מתחיל')).toHaveValue('14:00')
    expect(within(week).getByLabelText(/שם הקורס/)).toHaveValue('אלגוריתמים')
    expect(within(week).getByLabelText('נגמר')).toHaveFocus()
  })

  it('a break on another day shows its own places, and leads to that day in "between classes"', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-12T07:05:00Z')) // Monday: the Sunday break is another day
    otherDay = between
    between = { weekday: 0, date: '2026-10-12', routed_walks: false, gaps: [] }
    const scrolled = vi.fn()
    Element.prototype.scrollIntoView = scrolled
    const user = userEvent.setup()
    renderMe()
    const week = await weekSection()
    await user.click(await within(week).findByRole('button', { name: /^הפסקה של 90 דקות/ }))
    const details = within(week).getByRole('region', { name: 'פרטי ההפסקה' })
    // Sunday's places, asked for that day, by the forecast.
    expect(await within(details).findByRole('link', { name: /ספרייה/ })).toBeInTheDocument()
    expect(asked).toContain('6')
    await user.click(within(details).getByRole('button', { name: 'בין שיעורים ביום ראשון' }))
    // JumpTo scrolls on the next animation frame, once the new day is drawn:
    // checked at once, a busy machine fails this before the frame comes.
    await waitFor(() => expect(scrolled).toHaveBeenCalled())
    const section = await screen.findByRole('region', { name: 'בין שיעורים, יום ראשון' })
    await waitFor(() => expect(section).toHaveFocus())
    expect(within(section).getByRole('button', { name: 'ראשון', pressed: true })).toBeInTheDocument()
    expect(await within(section).findByRole('link', { name: /ספרייה/ })).toBeInTheDocument()
  })

  it('"between classes" can show another day of the week', async () => {
    const user = userEvent.setup()
    classes = [DATA, MATH, { ...DATA, id: 3, weekday: 1 }, { ...MATH, id: 4, weekday: 1 }]
    renderMe()
    const section = await betweenSection()
    await user.click(await within(section).findByRole('button', { name: 'שלישי' }))
    expect(await screen.findByRole('region', { name: 'בין שיעורים, יום שלישי' })).toBeInTheDocument()
    expect(asked).toContain('1')
  })

  it('a class picked shows its details', async () => {
    const user = userEvent.setup()
    renderMe()
    const week = await weekSection()
    await user.click(await within(week).findByRole('button', { name: /^מבני נתונים, יום ראשון/ }))
    const details = within(week).getByRole('region', { name: 'פרטי השיעור' })
    expect(details).toHaveTextContent('יום ראשון · 08:30–10:00 · בניין M')
  })

  it('adds a class, and the suggestions are asked for again', async () => {
    const user = userEvent.setup()
    renderMe()
    const week = await weekSection()
    await within(week).findByRole('list', { name: 'יום ראשון' })
    const asked = () => (fetch as unknown as { mock: { calls: [string][] } }).mock.calls.filter(([u]) => u.endsWith('/me/between-classes')).length
    const before = asked()
    await user.selectOptions(within(week).getByLabelText('יום'), 'יום שני')
    await user.type(within(week).getByLabelText('מתחיל'), '14:00')
    await user.type(within(week).getByLabelText('נגמר'), '15:30')
    await user.selectOptions(within(week).getByLabelText('בניין'), 'EF')
    await user.type(within(week).getByLabelText(/שם הקורס/), 'אלגוריתמים')
    await user.click(within(week).getByRole('button', { name: 'הוספת שיעור' }))
    await waitFor(() => expect(sent.at(-1)).toEqual({
      method: 'POST', path: '/me/classes',
      body: { weekday: 0, starts: '14:00', ends: '15:30', building_code: 'EF', title: 'אלגוריתמים' },
    }))
    const monday = await within(week).findByRole('list', { name: 'יום שני' })
    expect(await within(monday).findByRole('button', { name: 'אלגוריתמים, יום שני 14:00 עד 15:30, בניין EF' })).toBeInTheDocument()
    await waitFor(() => expect(asked()).toBeGreaterThan(before))
  })

  it('a class in a place not on the list is added in words, and shown so', async () => {
    const user = userEvent.setup()
    renderMe()
    const week = await weekSection()
    await within(week).findByRole('option', { name: 'EF' })
    await user.type(within(week).getByLabelText('מתחיל'), '14:00')
    await user.type(within(week).getByLabelText('נגמר'), '15:30')
    await user.selectOptions(within(week).getByLabelText('בניין'), 'מקום שלא ברשימה')
    await user.type(within(week).getByLabelText('שם המקום'), 'אולם ספורט')
    await user.click(within(week).getByRole('button', { name: 'הוספת שיעור' }))
    await waitFor(() => expect(sent.at(-1)).toEqual({
      method: 'POST', path: '/me/classes',
      body: { weekday: 6, starts: '14:00', ends: '15:30', place_text: 'אולם ספורט', title: null },
    }))
    const sunday = await within(week).findByRole('list', { name: 'יום ראשון' })
    await user.click(await within(sunday).findByRole('button', { name: 'שיעור, יום ראשון 14:00 עד 15:30, אולם ספורט' }))
    expect(await screen.findByText(/עוד לא במפה של המוסד/)).toBeInTheDocument()
  })

  it('the whole timetable can be removed at once, after asking', async () => {
    const user = userEvent.setup()
    renderMe()
    const week = await weekSection()
    await within(week).findByRole('list', { name: 'יום ראשון' })
    await user.click(within(week).getByRole('button', { name: 'מחיקת כל המערכת' }))
    expect(sent.some((r) => r.method === 'DELETE')).toBe(false) // only asked, not yet sent
    await user.click(within(week).getByRole('button', { name: 'כן, למחוק את כל השיעורים' }))
    await waitFor(() => expect(sent.at(-1)).toMatchObject({ method: 'DELETE', path: '/me/classes' }))
    await waitFor(() => expect(within(week).queryByRole('button', { name: /^מבני נתונים,/ })).not.toBeInTheDocument())
  })

  it('the whole week shows at once, a phone too (no day tabs), in a scrollable region', async () => {
    renderMe()
    const week = await weekSection()
    for (const day of ['יום ראשון', 'יום שני', 'יום שלישי', 'יום רביעי', 'יום חמישי', 'יום שישי']) {
      expect(await within(week).findByRole('list', { name: day })).toBeInTheDocument()
    }
    expect(within(week).queryByRole('group', { name: 'יום בשבוע' })).not.toBeInTheDocument()
    expect(within(week).getByRole('region', { name: /אפשר לגלול לצדדים/ })).toHaveAttribute('tabindex', '0')
  })

  it('a building under construction is not offered', async () => {
    renderMe()
    const select = within(await weekSection()).getByLabelText('בניין')
    await within(select).findByRole('option', { name: 'EF' })
    expect(within(select).queryByRole('option', { name: 'NG' })).not.toBeInTheDocument()
  })

  it('says why a class is refused', async () => {
    const user = userEvent.setup()
    renderMe()
    const week = await weekSection()
    await within(week).findByRole('option', { name: 'M' })
    await user.type(within(week).getByLabelText('מתחיל'), '09:00')
    await user.type(within(week).getByLabelText('נגמר'), '09:45')
    await user.click(within(week).getByRole('button', { name: 'הוספת שיעור' }))
    expect(await within(week).findByRole('alert')).toHaveTextContent('חופף לשיעור אחר')
  })

  it('removes a class after asking', async () => {
    const user = userEvent.setup()
    renderMe()
    const week = await weekSection()
    await user.click(await within(week).findByRole('button', { name: /^מבני נתונים, יום ראשון/ }))
    const details = within(week).getByRole('region', { name: 'פרטי השיעור' })
    await user.click(within(details).getByRole('button', { name: 'הסרה' }))
    expect(sent).toEqual([])
    await user.click(within(details).getByRole('button', { name: 'כן, להסיר' }))
    await waitFor(() => expect(sent).toEqual([{ method: 'DELETE', path: '/me/classes/1', body: null }]))
    await waitFor(() => expect(screen.queryByText(/מבני נתונים/)).not.toBeInTheDocument())
  })

  it('one minute is said in proper Hebrew', async () => {
    between = { weekday: 6, date: '2026-10-11', routed_walks: false, gaps: [{ ...between.gaps[0], suggestions: [suggestion({ walk_there: 1 })] }] }
    renderMe()
    expect(await within(await betweenSection()).findByText(/דקת הליכה אחת/)).toBeInTheDocument()
  })

  it('a free room with no bookings left is not offered as bookable', async () => {
    between = { weekday: 6, date: '2026-10-11', routed_walks: false, gaps: [{ ...between.gaps[0], suggestions: [suggestion({ name: 'EM107', kind: 'group_room', bookable: false, available: null })] }] }
    renderMe()
    const section = await betweenSection()
    expect(await within(section).findByText(/החדר פנוי/)).toBeInTheDocument()
    expect(within(section).queryByText(/אפשר להזמין/)).not.toBeInTheDocument()
  })

  it('the suggestions still show when the timetable fails to load', async () => {
    const real = fetch as unknown as (url: string, init: RequestInit) => Promise<Response>
    vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) =>
      new URL(url).pathname === '/me/classes' && (init.method ?? 'GET') === 'GET'
        ? Promise.resolve(jsonResponse({ detail: 'unknown_error' }, 500))
        : real(url, init),
    ))
    renderMe()
    expect(await within(await betweenSection()).findByRole('article', { name: 'הפסקה 10:00–11:30' })).toBeInTheDocument()
  })
})
