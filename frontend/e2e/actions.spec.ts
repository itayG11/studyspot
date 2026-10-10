import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { expect, test, type APIRequestContext } from '@playwright/test'

// The API the test servers run on (see playwright.config.ts).
const API = 'http://localhost:8001'
const SITE = 'http://localhost:5174'

async function apiToken(request: APIRequestContext, persona: 'student' | 'admin'): Promise<string> {
  const response = await request.post(`${API}/auth/demo/login`, { data: { persona }, headers: { Origin: SITE } })
  expect(response.ok()).toBeTruthy()
  return (await response.json()).access_token
}

async function findPlace(request: APIRequestContext, building: string, name: string) {
  const places = await (await request.get(`${API}/institutions/demo/places?building=${building}`)).json()
  return places.find((p: { name: string }) => p.name === name)
}

// The demo student is shared between runs: start each test with no bookings.
async function cancelAllBookings(request: APIRequestContext) {
  const token = await apiToken(request, 'student')
  const headers = { Authorization: `Bearer ${token}` }
  const bookings = await (await request.get(`${API}/me/bookings`, { headers })).json()
  for (const booking of bookings) {
    if (booking.status === 'booked' && booking.source === 'advance') {
      await request.post(`${API}/bookings/${booking.id}/cancel`, { headers })
    }
  }
}

async function signInAsStudent(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.getByRole('button', { name: 'כניסה כסטודנט לדוגמה' }).click()
  await expect(page.getByText('סטודנט לדוגמה')).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.route(/tile\.openstreetmap\.org|arcgisonline\.com/, (route) => route.abort())
})

test('a student books a lab station, sees it, and cancels it', async ({ page, request }) => {
  await cancelAllBookings(request)
  const lab = await findPlace(request, 'M', 'M206')
  await signInAsStudent(page)

  await page.goto(`/places/${lab.id}`)
  await page.getByRole('button', { name: /^A1:/ }).click()
  // The last bookable day always has the whole day ahead of it.
  const days = page.getByRole('group', { name: 'יום' }).getByRole('button')
  await days.last().click()
  await page.getByRole('group', { name: 'שעת התחלה' }).getByRole('button', { disabled: false }).first().click()
  await page.getByRole('button', { name: 'רבע שעה' }).click()
  await page.getByRole('button', { name: 'להזמין' }).click()
  await expect(page.getByRole('status')).toContainText('ההזמנה נקלטה')

  await page.getByRole('link', { name: 'להזמנות שלי' }).click()
  const booking = page.getByRole('listitem', { name: /M206, תא A1/ })
  await expect(booking).toBeVisible()
  await booking.getByRole('button', { name: 'לבטל' }).click()
  await booking.getByRole('button', { name: 'כן, לבטל' }).click()
  await expect(booking).toHaveCount(0)
})

test('a student checks in by opening the address on a sign', async ({ page, request }) => {
  const area = await findPlace(request, 'L', 'מתחם לימוד')
  test.skip(!area.is_open, 'The open area is closed right now; check-in can only be tried in opening hours.')

  // The code printed on L's sign, as the admin's page would show it.
  const adminToken = await apiToken(request, 'admin')
  const codes = await (
    await request.get(`${API}/admin/institutions/demo/codes`, { headers: { Authorization: `Bearer ${adminToken}` } })
  ).json()
  const sign = codes.find((c: { place_id: number }) => c.place_id === area.id)

  await signInAsStudent(page)
  await page.goto(`/scan#c=${encodeURIComponent(sign.code)}`)
  await expect(page.getByRole('heading', { name: 'מתחם לימוד' })).toBeVisible()
  await expect(page).toHaveURL('/scan') // the code is not kept in the address
  await page.getByRole('button', { name: 'אני כאן' }).click()
  await expect(page.getByRole('status')).toContainText('נכנסת')

  await page.getByRole('link', { name: 'לאזור שלי' }).click()
  const now = page.getByRole('region', { name: 'עכשיו' })
  await expect(now).toContainText('מתחם לימוד')
  await now.getByRole('button', { name: 'יציאה' }).click()
  await expect(now).toContainText('אין לך כניסה פעילה')
})

test('the admin page shows a sign for every place', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: 'כניסה כמנהל מוסד לדוגמה' }).click()
  await page.getByRole('link', { name: 'ניהול' }).click()
  await expect(page.getByRole('img', { name: /קוד QR/ })).toHaveCount(10)
})

// Puts the demo campus back to its seed data (e2e/reset_demo.py).
function resetDemoCampus() {
  const backend = resolve(import.meta.dirname, '../../backend')
  execFileSync(process.env.PYTHON ?? 'python', [`${import.meta.dirname}/reset_demo.py`], {
    cwd: backend,
    env: { ...process.env, PYTHONPATH: backend },
  })
}

test('the admin adds a building and a room, and students find the room', async ({ page }) => {
  try {
    await page.goto('/login')
    await page.getByRole('button', { name: 'כניסה כמנהל מוסד לדוגמה' }).click()
    await page.getByRole('link', { name: 'ניהול' }).click()
    await page.getByRole('button', { name: 'הוספה' }).click()

    // The building goes where the map is clicked.
    const map = page.getByRole('region', { name: 'הוספה' }).locator('.leaflet-container')
    await map.scrollIntoViewIfNeeded()
    const box = (await map.boundingBox())!
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5)
    await expect(page.getByText('נבחר מיקום על המפה.')).toBeVisible()
    await page.getByLabel('שם הבניין').fill('בניין הבדיקות')
    await page.getByLabel(/שם קצר/).fill('QA')
    await page.getByLabel('מספר קומות').fill('2')
    await page.getByRole('button', { name: 'הוספת בניין' }).click()
    await expect(page.getByText('בניין הבדיקות נוסף')).toBeVisible()

    await page.getByLabel('בניין', { exact: true }).selectOption({ label: 'בניין QA' })
    await page.getByLabel('סוג המקום').selectOption('group_room')
    await page.getByLabel('שם המקום').fill('QA101')
    await page.getByLabel('קומה').selectOption({ label: 'קומה 1' })
    await page.getByLabel('כמה אנשים').fill('6')
    await page.getByRole('button', { name: 'הוספת מקום' }).click()
    await expect(page.getByText('QA101 נוסף לבניין QA')).toBeVisible()

    // Its sign is ready, and the finder shows the room.
    await page.getByRole('button', { name: 'שלטים להדפסה' }).click()
    await expect(page.getByRole('img', { name: /קוד QR/ })).toHaveCount(11)
    await page.goto('/?q=QA101')
    await expect(page.getByRole('link', { name: /QA101/ })).toBeVisible()
  } finally {
    resetDemoCampus()
  }
})
