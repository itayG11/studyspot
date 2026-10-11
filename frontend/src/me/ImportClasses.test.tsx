// Importing the timetable from the college's Excel export: preview, pick
// the missing buildings, then add, each class through the usual checks.

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetSessionForTests } from '../api/client'
import type { ImportRow } from '../api/types'
import { AuthProvider } from '../auth/AuthContext'
import { InstitutionProvider } from '../institution'
import { building, jsonResponse } from '../test/fixtures'
import { ImportClasses } from './ImportClasses'

const ME = { id: 1, email: 'noa@gmail.com', display_name: 'נועה', role: 'student', institution_slug: 'braude', is_demo: false }
const INSTITUTION = {
  slug: 'braude', name: 'מכללת בראודה', timezone: 'Asia/Jerusalem', live_simulated: false,
  booking_rules: { slot_minutes: 15, max_minutes: 120, days_ahead: 4, horizon_minutes: 5760, max_upcoming: 2, arrive_early_minutes: 10, no_show_after_minutes: 15 },
}
const ROWS: ImportRow[] = [
  { weekday: 6, starts: '08:30', ends: '10:30', building_code: 'M', building_text: 'M', title: 'מבני נתונים, תרגיל' },
  { weekday: 3, starts: '10:30', ends: '12:20', building_code: null, building_text: 'ספורט', title: 'אורח חיים בריא, הרצאה' },
]

let sent: { path: string; body: unknown; type: string | null }[]
let refuse: string | null

beforeEach(() => {
  resetSessionForTests()
  sent = []
  refuse = null
  vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => {
    const path = new URL(url).pathname
    const headers = (init.headers ?? {}) as Record<string, string>
    if (path === '/auth/refresh') return Promise.resolve(jsonResponse({ access_token: 't', token_type: 'bearer', expires_in: 900, user: ME }))
    if (path === '/institutions/braude') return Promise.resolve(jsonResponse(INSTITUTION))
    if (path === '/institutions/braude/buildings') return Promise.resolve(jsonResponse([building({ code: 'M' }), building({ id: 2, code: 'L' })]))
    if (path === '/me/classes/import') {
      sent.push({ path, body: init.body, type: headers['Content-Type'] ?? null })
      return Promise.resolve(jsonResponse(ROWS))
    }
    if (path === '/me/classes/bulk' && init.method === 'POST') {
      const body = JSON.parse(String(init.body)) as { starts: string }[]
      sent.push({ path, body, type: null })
      return Promise.resolve(jsonResponse(body.map((c) => ({ refused: refuse && c.starts === refuse ? 'class_overlaps' : null }))))
    }
    return Promise.resolve(jsonResponse({ detail: 'unknown' }, 404))
  }))
})

afterEach(() => vi.unstubAllGlobals())

function show(onAdded = vi.fn()) {
  render(
    <MemoryRouter>
      <AuthProvider>
        <InstitutionProvider slug="braude">
          <ImportClasses onAdded={onAdded} />
        </InstitutionProvider>
      </AuthProvider>
    </MemoryRouter>,
  )
  return onAdded
}

const xlsx = () => new File([new Uint8Array([0x50, 0x4b, 3, 4])], 'מערכת.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })

describe('ImportClasses', () => {
  it('sends the file as it is, and shows what it holds', async () => {
    const user = userEvent.setup()
    show()
    await user.upload(await screen.findByLabelText('ייבוא מקובץ הידיעון'), xlsx())
    expect(await screen.findByRole('checkbox', { name: /מבני נתונים, תרגיל/ })).toBeChecked()
    expect(sent[0].type).toBe('application/octet-stream')
    expect(sent[0].body).toBeInstanceOf(File)
  })

  it('a class with no building found asks for one before adding', async () => {
    const user = userEvent.setup()
    show()
    await user.upload(await screen.findByLabelText('ייבוא מקובץ הידיעון'), xlsx())
    const add = await screen.findByRole('button', { name: 'להוסיף 2 שיעורים' })
    expect(add).toBeDisabled()
    expect(screen.getByText(/בקובץ: ספורט/)).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText(/בניין לשיעור אורח חיים בריא/), 'L')
    expect(add).toBeEnabled()
  })

  it('adds the chosen classes through the usual route, and says which were refused', async () => {
    const user = userEvent.setup()
    refuse = '08:30'
    const onAdded = show()
    await user.upload(await screen.findByLabelText('ייבוא מקובץ הידיעון'), xlsx())
    await user.selectOptions(await screen.findByLabelText(/בניין לשיעור אורח חיים בריא/), 'L')
    await user.click(screen.getByRole('button', { name: 'להוסיף 2 שיעורים' }))
    await waitFor(() => expect(onAdded).toHaveBeenCalled())
    // One request with both, in order.
    expect(sent.filter((s) => s.path === '/me/classes/bulk').map((s) => s.body)).toEqual([[
      { weekday: 6, starts: '08:30', ends: '10:30', building_code: 'M', title: 'מבני נתונים, תרגיל' },
      { weekday: 3, starts: '10:30', ends: '12:20', building_code: 'L', title: 'אורח חיים בריא, הרצאה' },
    ]])
    expect(await screen.findByText(/נוסף שיעור אחד מתוך 2/)).toBeInTheDocument()
    // The refused one stays, with why.
    const left = screen.getByRole('listitem')
    expect(within(left).getByText(/חופף לשיעור אחר/)).toBeInTheDocument()
  })

  it('unchecking a class leaves it out', async () => {
    const user = userEvent.setup()
    show()
    await user.upload(await screen.findByLabelText('ייבוא מקובץ הידיעון'), xlsx())
    await user.click(await screen.findByRole('checkbox', { name: /אורח חיים בריא/ }))
    await user.click(screen.getByRole('button', { name: 'להוסיף שיעור אחד' }))
    await waitFor(() => expect(sent.at(-1)?.path).toBe('/me/classes/bulk'))
    const last = sent[sent.length - 1].body as { title: string }[]
    expect(last.map((c) => c.title)).toEqual(['מבני נתונים, תרגיל'])
  })
})
