// Uploading a table of buildings and places: a preview, a choice for each
// building that is already there, and then one save.

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetSessionForTests } from '../api/client'
import type { CampusPreview, ImportedPlace } from '../api/types'
import { AuthProvider } from '../auth/AuthContext'
import { InstitutionProvider } from '../institution'
import { jsonResponse } from '../test/fixtures'
import { BulkImport } from './BulkImport'

const ME = { id: 1, email: 'a@braude.ac.il', display_name: 'דלית', role: 'institution_admin', institution_slug: 'braude', is_demo: false }
const INSTITUTION = {
  slug: 'braude', name: 'מכללת בראודה', timezone: 'Asia/Jerusalem', live_simulated: false,
  booking_rules: { slot_minutes: 15, max_minutes: 120, days_ahead: 4, horizon_minutes: 5760, max_upcoming: 2, arrive_early_minutes: 10, no_show_after_minutes: 15 },
}
const place = (line: number, name: string, extra: Partial<ImportedPlace> = {}): ImportedPlace => ({
  line, kind: 'library', name, floor: 0, capacity: 20, lab_rows: null, lab_cols: null, location_note: null,
  weekday_hours: null, friday_hours: null, when_added: null, ...extra,
})
const PREVIEW: CampusPreview = {
  buildings: [
    {
      code: 'T', name: 'בניין הניסיון', floors_count: 2, status: 'new', latitude: null, longitude: null, existing: null,
      places: [place(2, 'T101', { weekday_hours: '08:00-18:00', friday_hours: 'closed' })],
    },
    {
      code: 'M', name: 'בניין M', floors_count: 3, status: 'active', latitude: null, longitude: null,
      existing: { name: 'בניין M', floors_count: 3, places: 2, upcoming_bookings: 4, classes: 7, locked: false, status: 'under_construction' },
      places: [place(3, 'M206', { when_added: 'place_name_taken' }), place(4, 'M001')],
    },
  ],
  problems: [{ line: 5, code: 'row_kind' }],
}

let sent: { path: string; body: unknown; type: string | null }[]
let answer: { status: number; body: unknown }

beforeEach(() => {
  resetSessionForTests()
  sent = []
  answer = { status: 200, body: { buildings_added: 1, buildings_replaced: 0, places_added: 2, places_skipped: 0 } }
  vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => {
    const path = new URL(url).pathname
    const headers = (init.headers ?? {}) as Record<string, string>
    if (path === '/auth/refresh') return Promise.resolve(jsonResponse({ access_token: 't', token_type: 'bearer', expires_in: 900, user: ME }))
    if (path === '/institutions/braude') return Promise.resolve(jsonResponse(INSTITUTION))
    if (path === '/admin/institutions/braude/import/preview') {
      sent.push({ path, body: init.body, type: headers['Content-Type'] ?? null })
      return Promise.resolve(jsonResponse(PREVIEW))
    }
    if (path === '/admin/institutions/braude/import') {
      sent.push({ path, body: JSON.parse(String(init.body)), type: null })
      return Promise.resolve(jsonResponse(answer.body, answer.status))
    }
    return Promise.resolve(jsonResponse({ detail: 'unknown' }, 404))
  }))
})

afterEach(() => vi.unstubAllGlobals())

function show(onSaved = vi.fn()) {
  render(
    <MemoryRouter>
      <AuthProvider>
        <InstitutionProvider slug="braude">
          <BulkImport onSaved={onSaved} />
        </InstitutionProvider>
      </AuthProvider>
    </MemoryRouter>,
  )
  return onSaved
}

const table = () => new File(['שם קצר,מספר קומות\nT,2'], 'בניינים.csv', { type: 'text/csv' })

async function upload() {
  const user = userEvent.setup()
  show()
  await user.upload(await screen.findByLabelText('העלאת טבלה'), table())
  await screen.findByRole('heading', { name: /מה נמצא בטבלה/ })
  return user
}

const saved = () => sent.find((s) => s.path.endsWith('/import'))?.body as { buildings: Record<string, unknown>[] } | undefined

describe('BulkImport', () => {
  it('offers the templates and sends the file as it is', async () => {
    await upload()
    expect(screen.getByRole('link', { name: /תבנית אקסל/ })).toHaveAttribute('href', '/templates/buildings.xlsx')
    expect(screen.getByRole('link', { name: /תבנית CSV/ })).toHaveAttribute('href', '/templates/buildings.csv')
    expect(sent[0].type).toBe('application/octet-stream')
    expect(sent[0].body).toBeInstanceOf(File)
  })

  it('names each bad line, and what is wrong with it', async () => {
    await upload()
    expect(screen.getByText(/שורה 5/)).toHaveTextContent(/סוג המקום/)
  })

  it('a building that is there: the new places go into it by default, and the one it has is skipped', async () => {
    const user = await upload()
    const m = screen.getByRole('group', { name: /הבניין M כבר קיים/ })
    expect(within(m).getByRole('radio', { name: /להוסיף את המקומות החדשים/ })).toBeChecked()
    expect(within(m).getByText(/M206/).closest('li')).toHaveTextContent('כבר קיים')
    await user.click(screen.getByRole('button', { name: 'לשמור 2 בניינים ו-2 מקומות' }))
    const body = saved()!
    expect(body.buildings.map((b) => [b.code, b.action, (b.places as { name: string }[]).map((p) => p.name)])).toEqual([
      ['T', 'create', ['T101']],
      ['M', 'add', ['M001']],
    ])
    expect(await screen.findByText(/נוספו בניין אחד ו-2 מקומות\. מקום אחד, שכבר קיים/)).toBeInTheDocument()
  })

  it('leaving it as it is sends nothing for it', async () => {
    const user = await upload()
    await user.click(screen.getByRole('radio', { name: /להשאיר כמו שהוא/ }))
    await user.click(screen.getByRole('button', { name: 'לשמור בניין אחד ומקום אחד' }))
    expect(saved()!.buildings.map((b) => b.code)).toEqual(['T'])
  })

  it('delete and add again: says what goes with it, and asks twice', async () => {
    const user = await upload()
    await user.click(screen.getByRole('radio', { name: /למחוק ולהוסיף מחדש/ }))
    const warning = screen.getByText(/יימחקו 2 מקומות/)
    expect(warning).toHaveTextContent('4 הזמנות')
    expect(warning).toHaveTextContent('7 שיעורים')
    expect(warning).toHaveTextContent('מצב הבניין ישתנה: בבנייה, ובמקומו פעיל')
    await user.click(screen.getByRole('button', { name: 'לשמור 2 בניינים ו-3 מקומות' }))
    expect(saved()).toBeUndefined()
    await user.click(screen.getByRole('button', { name: 'כן, למחוק ולשמור' }))
    const m = saved()!.buildings[1]
    expect([m.action, m.expected_places, m.expected_upcoming_bookings, (m.places as { name: string }[]).map((p) => p.name)]).toEqual([
      'replace', 2, 4, ['M206', 'M001'],
    ])
  })

  it('a refusal saves nothing and says why', async () => {
    const onSaved = vi.fn()
    answer = { status: 409, body: { detail: 'import_stale' } }
    const user = userEvent.setup()
    show(onSaved)
    await user.upload(await screen.findByLabelText('העלאת טבלה'), table())
    await user.click(await screen.findByRole('button', { name: /^לשמור/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/השתנה/)
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('a building of the demo campus cannot be deleted from here', async () => {
    PREVIEW.buildings[1].existing!.locked = true
    try {
      await upload()
      expect(screen.queryByRole('radio', { name: /למחוק/ })).not.toBeInTheDocument()
      expect(screen.getByText(/אבל לא למחוק אותו/)).toBeInTheDocument()
    } finally {
      PREVIEW.buildings[1].existing!.locked = false
    }
  })

  it('a building that is there with nothing new for it is not counted', async () => {
    const all = PREVIEW.buildings[1].places
    PREVIEW.buildings[1].places = all.filter((p) => p.when_added !== null) // only M206, which it has
    try {
      const user = await upload()
      await user.click(screen.getByRole('button', { name: 'לשמור בניין אחד ומקום אחד' }))
      expect(saved()!.buildings.map((b) => b.code)).toEqual(['T'])
    } finally {
      PREVIEW.buildings[1].places = all
    }
  })

  it("shows the table's own hours and the building's status, and sends them", async () => {
    const user = await upload()
    expect(screen.getByText(/T101/)).toHaveTextContent("א'-ה' 08:00-18:00 · ו' סגור")
    expect(screen.getByText(/בניין חדש, 2 קומות/)).toHaveTextContent('בניין חדש')
    await user.click(screen.getByRole('button', { name: /^לשמור/ }))
    const t = saved()!.buildings[0]
    expect([t.status, (t.places as Record<string, unknown>[])[0]]).toEqual([
      'new', expect.objectContaining({ weekday_hours: '08:00-18:00', friday_hours: 'closed' }),
    ])
  })
})
