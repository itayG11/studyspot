import { isMapTile } from './tiles.ts'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

// Wave 14.1: "I'm studying here". A student shares a booking, a friend with
// no account opens the link, and once the booking is cancelled the same link
// says it has ended.

const API = 'http://localhost:8001'
const SITE = 'http://localhost:5174'

async function studentHeaders(request: APIRequestContext) {
  const response = await request.post(`${API}/auth/demo/login`, { data: { persona: 'student' }, headers: { Origin: SITE } })
  return { Authorization: `Bearer ${(await response.json()).access_token}` }
}

// The demo student is shared between runs: start with no advance bookings.
async function cancelAllBookings(request: APIRequestContext) {
  const headers = await studentHeaders(request)
  for (const booking of await (await request.get(`${API}/me/bookings`, { headers })).json()) {
    if (booking.status === 'booked' && booking.source === 'advance') {
      await request.post(`${API}/bookings/${booking.id}/cancel`, { headers })
    }
  }
}

// From the last bookable day back, the first with a free start time (as in actions.spec.ts).
async function bookFirstFreeTime(page: Page) {
  const days = page.getByRole('group', { name: 'יום' }).getByRole('button')
  const starts = page.getByRole('group', { name: 'שעת התחלה' }).getByRole('button', { disabled: false })
  const loaded = page.getByRole('group', { name: 'שעת התחלה', exact: true }).or(page.getByText('לא נשארו ביום הזה שעות להזמנה'))
  for (let day = (await days.count()) - 1; day >= 0; day--) {
    await days.nth(day).click()
    await expect(days.nth(day)).toHaveAttribute('aria-pressed', 'true')
    await expect(loaded).toBeVisible()
    if ((await starts.count()) > 0) break
  }
  await starts.first().click()
  await page.getByRole('button', { name: 'רבע שעה' }).click()
  await page.getByRole('button', { name: 'להזמין' }).click()
  await expect(page.getByRole('status')).toContainText('ההזמנה נקלטה')
}

test.beforeEach(async ({ page }) => {
  await page.route(isMapTile, (route) => route.abort())
  // The phone's share menu, recorded instead of opened.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', {
      value: (data: ShareData) => {
        ;(window as unknown as { shared: ShareData }).shared = data
        return Promise.resolve()
      },
    })
  })
})

test('a student shares a booking, a friend opens it, and it ends with the booking', async ({ page, browser, request }) => {
  await cancelAllBookings(request)
  const lab = (await (await request.get(`${API}/institutions/demo/places?building=M`)).json()).find(
    (p: { name: string }) => p.name === 'M206',
  )
  await page.goto('/login')
  await page.getByRole('button', { name: 'כניסה כסטודנט לדוגמה' }).click()
  await expect(page.getByRole('button', { name: 'התנתקות' })).toBeVisible()
  await page.goto(`/places/${lab.id}`)
  await page.getByRole('button', { name: /^A1:/ }).click()
  await bookFirstFreeTime(page)

  await page.getByRole('link', { name: 'להזמנות שלי' }).click()
  const booking = page.getByRole('listitem', { name: /M206, תא A1/ })
  await booking.getByRole('button', { name: 'לשתף' }).click()
  await booking.getByRole('button', { name: 'ליצור קישור ולשתף' }).click()
  await expect.poll(() => page.evaluate(() => (window as unknown as { shared?: ShareData }).shared?.url)).toContain('/s/b')
  const link = (await page.evaluate(() => (window as unknown as { shared: ShareData }).shared.url))!

  // A friend, not signed in.
  const friend = await (await browser.newContext()).newPage()
  await friend.route(isMapTile, (route) => route.abort())
  await friend.goto(new URL(link).pathname)
  await expect(friend.getByRole('heading', { name: 'ילמד/תלמד ב-M206' })).toBeVisible()
  await expect(friend.getByText('Demo Student')).toHaveCount(0) // the name was not chosen

  await booking.getByRole('button', { name: 'לבטל' }).click()
  await booking.getByRole('button', { name: 'כן, לבטל' }).click()
  await expect(booking).toHaveCount(0)
  await friend.reload()
  await expect(friend.getByRole('heading', { name: 'הקישור כבר לא פעיל' })).toBeVisible()
})
