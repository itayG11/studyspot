import { isMapTile } from './tiles.ts'
import { expect, test, type APIRequestContext } from '@playwright/test'

// Wave 13: a screen by the door. The demo admin turns it on for a place,
// the screen shows a code that changes every minute, a student checks in
// with it, and the printed sign of that place stops working.

const API = 'http://localhost:8001'
const SITE = 'http://localhost:5174'

async function token(request: APIRequestContext, persona: 'student' | 'admin'): Promise<string> {
  const response = await request.post(`${API}/auth/demo/login`, { data: { persona }, headers: { Origin: SITE } })
  return (await response.json()).access_token
}

test.beforeEach(async ({ page }) => {
  await page.route(isMapTile, (route) => route.abort())
})

test('the admin turns on a screen, a student checks in with its code, the printed sign stops working', async ({
  page,
  browser,
  playwright,
}) => {
  const outside = await playwright.request.newContext() // its own cookies, apart from the pages
  const places = await (await outside.get(`${API}/institutions/demo/places?building=L`)).json()
  const area = places.find((p: { name: string }) => p.name === 'מתחם לימוד')
  test.skip(!area.is_open, 'The open area is closed right now; check-in can only be tried in opening hours.')
  const admin = { Authorization: `Bearer ${await token(outside, 'admin')}` }
  const printed = (await (await outside.get(`${API}/admin/institutions/demo/codes`, { headers: admin })).json()).find(
    (c: { place_id: number }) => c.place_id === area.id,
  ).code

  try {
    await page.goto('/login')
    await page.getByRole('button', { name: 'כניסה כמנהל מוסד לדוגמה' }).click()
    await page.getByRole('link', { name: 'ניהול' }).click()
    const sign = page.getByRole('listitem', { name: 'מתחם לימוד, בניין L' })
    await sign.getByRole('button', { name: 'מסך' }).click()
    await expect(sign.getByText(/השלט המודפס לא עובד/)).toBeVisible()
    await sign.getByRole('button', { name: 'ליצור קישור למסך' }).click()
    const link = (await sign.getByText(/\/screen#t=/).textContent())!.trim()

    // The tablet by the door: no sign-in, only the link.
    const tablet = await browser.newPage()
    await tablet.goto(link)
    await expect(tablet.getByRole('heading', { name: 'מתחם לימוד' })).toBeVisible()
    await expect(tablet.getByRole('img', { name: /קוד QR לכניסה למתחם לימוד/ })).toBeVisible()
    const screenToken = new URL(link).hash.slice('#t='.length)
    const shown = await (await outside.get(`${API}/screen`, { headers: { 'X-Screen-Token': screenToken } })).json()

    // A student scans the screen.
    const student = await (await browser.newContext()).newPage()
    await student.route(isMapTile, (route) => route.abort())
    await student.goto('/login')
    await student.getByRole('button', { name: 'כניסה כסטודנט לדוגמה' }).click()
    await expect(student.getByRole('button', { name: 'התנתקות' })).toBeVisible()
    await student.goto(`/scan#c=${encodeURIComponent(shown.code)}`)
    await student.getByRole('button', { name: 'אני כאן' }).click()
    await expect(student.getByRole('status')).toContainText('נכנסת')
    await student.getByRole('link', { name: 'לאזור שלי' }).click()
    await student.getByRole('region', { name: 'עכשיו' }).getByRole('button', { name: 'יציאה' }).click()

    // The printed sign of the same place no longer lets anyone in.
    await student.goto(`/scan#c=${encodeURIComponent(printed)}`)
    await student.getByRole('button', { name: 'אני כאן' }).click()
    await expect(student.getByText(/הקוד לא תקין/)).toBeVisible()
  } finally {
    // Back to the printed sign, for the other tests and for visitors.
    await outside.patch(`${API}/admin/places/${area.id}/check-in-mode`, { headers: admin, data: { mode: 'sign' } })
    await outside.dispose()
  }
})
