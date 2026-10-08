// The edge cases a person would try by hand, on a computer, a tablet and a
// phone (playwright.edge.config.ts), against the production build.
//
// What this cannot do, and is left to a real device: Safari's own engine,
// a real camera, signing in to Google Calendar, and "add to home screen".

/// <reference lib="dom" />

import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import jsQRModule from 'jsqr'

// jsqr is a CommonJS package: under Node's ESM rules its function is .default.
const jsQR = jsQRModule.default

const SITE = 'http://localhost:8002'
const API = `${SITE}/api`

// --- helpers ---------------------------------------------------------------

async function apiToken(request: APIRequestContext, persona: 'student' | 'admin'): Promise<string> {
  const response = await request.post(`${API}/auth/demo/login`, { data: { persona }, headers: { Origin: SITE } })
  expect(response.ok()).toBeTruthy()
  return (await response.json()).access_token
}

async function placeId(request: APIRequestContext, name: string): Promise<number> {
  const places = await (await request.get(`${API}/institutions/demo/places`)).json()
  return places.find((p: { name: string }) => p.name === name).id
}

// The demo student is shared: every test starts with no advance bookings.
async function cancelAllBookings(request: APIRequestContext) {
  const headers = { Authorization: `Bearer ${await apiToken(request, 'student')}` }
  const bookings = await (await request.get(`${API}/me/bookings`, { headers })).json()
  for (const booking of bookings) {
    if (booking.status === 'booked' && booking.source === 'advance') {
      await request.post(`${API}/bookings/${booking.id}/cancel`, { headers })
    }
  }
}

async function signIn(page: Page, persona: 'student' | 'admin') {
  await page.context().clearCookies()
  await page.goto('/login')
  const button = persona === 'student' ? 'כניסה כסטודנט לדוגמה' : 'כניסה כמנהל מוסד לדוגמה'
  await page.getByRole('button', { name: button }).click()
  await expect(page.getByText(persona === 'student' ? 'סטודנט לדוגמה' : 'מנהל לדוגמה')).toBeVisible()
}

// Narrow screens book in a sheet from the bottom; wider ones in a side panel.
function isTall(page: Page): boolean {
  return (page.viewportSize()?.width ?? 1280) <= 760
}

async function openBookingForm(page: Page): Promise<Locator> {
  if (isTall(page)) {
    await page.getByRole('button', { name: 'להזמין', exact: true }).click()
    return page.getByRole('dialog')
  }
  return page.getByRole('complementary')
}

// The latest day that still has a free start time. Usually the last day,
// but between midnight and opening its times are past the 4-day limit.
async function chooseLastDayFirstTime(form: Locator, length: string) {
  const days = form.getByRole('group', { name: 'יום' }).getByRole('button')
  const starts = form.getByRole('group', { name: 'שעת התחלה' }).getByRole('button', { disabled: false })
  for (let i = (await days.count()) - 1; i >= 0; i--) {
    await days.nth(i).click()
    if ((await starts.count()) > 0) break
  }
  await starts.first().click()
  await form.getByRole('group', { name: 'אורך' }).getByRole('button', { name: length, exact: true }).click()
}

// --- every test ------------------------------------------------------------

let policyErrors: string[] = []

test.beforeEach(async ({ page }) => {
  await page.route(/tile\.openstreetmap\.org|arcgisonline\.com/, (route) => route.abort())
  // Anything the security policy blocks would be broken for real visitors.
  policyErrors = []
  page.on('console', (message) => {
    if (message.type() === 'error' && /Content Security Policy/.test(message.text())) policyErrors.push(message.text())
  })
})

test.afterEach(() => {
  expect(policyErrors).toEqual([])
})

// --- the phone list --------------------------------------------------------

test('the story scrolls to the search without jumps or missing pictures', async ({ page }) => {
  // Shifts inside the story are left out: its photo opens with a clip-path
  // and a transform as you scroll, which Chrome reports as a shift although
  // nothing jumps (checked frame by frame). Every other shift counts.
  await page.addInitScript(`
    window.__shift = 0
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const inStory = entry.sources.every((s) => s.node && s.node.closest && s.node.closest('[aria-label^="סיפור"]'))
        if (!entry.hadRecentInput && !inStory) window.__shift += entry.value
      }
    }).observe({ type: 'layout-shift', buffered: true })
  `)
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  const finderTop = await page.locator('#finder').evaluate((el) => el.getBoundingClientRect().top + window.scrollY)
  const step = (page.viewportSize()?.height ?? 800) / 2
  for (let y = 0; y <= finderTop; y += step) {
    await page.evaluate((top) => window.scrollTo(0, top), y)
    await page.waitForTimeout(80)
  }
  await expect(page.getByRole('searchbox', { name: 'חיפוש מקום' })).toBeInViewport()
  // A picture that finished loading with no size is a broken one.
  const broken = await page.locator('img').evaluateAll((images) =>
    (images as HTMLImageElement[]).filter((img) => img.complete && img.naturalWidth === 0).map((img) => img.currentSrc || img.src),
  )
  expect(broken).toEqual([])
  expect(await page.evaluate('window.__shift')).toBeLessThan(0.1)
})

test('search, then a quick filter, then the map', async ({ page }) => {
  await page.goto('/#finder')
  await page.getByRole('searchbox', { name: 'חיפוש מקום' }).fill('מחשב')
  await page.getByRole('group', { name: 'סינון' }).getByRole('button', { name: /^שקט/ }).click()
  await expect(page).toHaveURL(/q=/)
  await expect(page).toHaveURL(/quiet/)
  await expect(page.getByRole('link', { name: 'M206' })).toBeVisible()

  await page.getByRole('group', { name: 'תצוגה' }).getByRole('button', { name: 'מפה' }).click()
  await page.getByRole('button', { name: 'M206 במפה' }).click()
  await expect(page.getByRole('button', { name: 'הסרת הסינון לבניין M' })).toBeVisible()
})

test('a booking, its calendar link, and the dark theme on every page', async ({ page, request }) => {
  await cancelAllBookings(request)
  await signIn(page, 'student')
  await page.goto(`/spaces/${await placeId(request, 'EM107')}`)
  const form = await openBookingForm(page)
  await chooseLastDayFirstTime(form, 'שעה וחצי')
  await form.getByRole('button', { name: 'להזמין', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'ההזמנה נקלטה' })).toBeVisible()

  const google = page.getByRole('link', { name: /הוספה ליומן Google/ })
  await expect(google).toHaveAttribute('href', /^https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE&/)
  await expect(google).toHaveAttribute('href', /dates=\d{8}T\d{6}Z%2F\d{8}T\d{6}Z/)
  await expect(google).toHaveAttribute('target', '_blank')
  if (isTall(page)) await page.keyboard.press('Escape') // the sheet closes

  // The switch is on every page, and the choice stays after a reload.
  await page.getByRole('switch', { name: 'מצב כהה' }).click()
  for (const path of ['/', '/me', '/login', `/spaces/${await placeId(request, 'M206')}`]) {
    await page.goto(path)
    await expect(page.getByRole('switch', { name: 'מצב כהה' })).toHaveAttribute('aria-checked', 'true')
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark')
  }
  await page.reload()
  await expect(page.getByRole('switch', { name: 'מצב כהה' })).toHaveAttribute('aria-checked', 'true')
  await cancelAllBookings(request)
})

test('the site can be installed: its manifest and icons are served', async ({ request }) => {
  const response = await request.get(`${SITE}/manifest.webmanifest`)
  expect(response.headers()['content-type']).toContain('application/manifest+json')
  const manifest = await response.json()
  expect(manifest.display).toBe('standalone')
  expect(manifest.icons.some((icon: { purpose?: string }) => icon.purpose === 'maskable')).toBe(true)
  for (const icon of manifest.icons as { src: string; sizes: string }[]) {
    const file = await request.get(`${SITE}${icon.src}`)
    expect(file.headers()['content-type']).toBe('image/png')
    // A PNG's width and height are at bytes 16-23 of the file.
    const bytes = await file.body()
    expect(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`).toBe(icon.sizes)
  }
})

// --- edge cases ------------------------------------------------------------

test('two tabs, one time: a clash, the next free time, the limit, cancel and book again', async ({ page, request }) => {
  await cancelAllBookings(request)
  await signIn(page, 'student')
  const room = `/spaces/${await placeId(request, 'EM107')}`
  const second = await page.context().newPage()
  await page.goto(room)
  await second.goto(room)

  const formA = await openBookingForm(page)
  const formB = await openBookingForm(second)
  await chooseLastDayFirstTime(formA, 'שעה')
  await chooseLastDayFirstTime(formB, 'שעה')
  await formA.getByRole('button', { name: 'להזמין', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'ההזמנה נקלטה' })).toBeVisible()

  // The second tab still shows the time as free; the database says no.
  await formB.getByRole('button', { name: 'להזמין', exact: true }).click()
  await expect(second.getByRole('alert')).toContainText('מישהו הזמין את הזמן הזה ממש עכשיו')
  await second.getByRole('button', { name: /הזמן הפנוי הקרוב/ }).click()
  await formB.getByRole('button', { name: 'להזמין', exact: true }).click()
  await expect(second.getByRole('status').filter({ hasText: 'ההזמנה נקלטה' })).toBeVisible()

  // Two is the limit.
  await page.reload()
  const formC = await openBookingForm(page)
  await chooseLastDayFirstTime(formC, 'שעה')
  await formC.getByRole('button', { name: 'להזמין', exact: true }).click()
  await expect(page.getByText('יש לך כבר את מספר ההזמנות המרבי')).toBeVisible()

  // Cancel one, and the same kind of booking goes through again.
  await page.goto('/me')
  const booking = page.getByRole('listitem', { name: /EM107/ }).first()
  await booking.getByRole('button', { name: 'לבטל' }).click()
  await booking.getByRole('button', { name: 'כן, לבטל' }).click()
  await expect(page.getByRole('listitem', { name: /EM107/ })).toHaveCount(1)
  await page.goto(room)
  const formD = await openBookingForm(page)
  await chooseLastDayFirstTime(formD, 'שעה')
  await formD.getByRole('button', { name: 'להזמין', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'ההזמנה נקלטה' })).toBeVisible()
  await cancelAllBookings(request)
})

test('reload, "back to search" and the browser\'s back keep the place and the search', async ({ page }) => {
  await page.goto('/#finder')
  await page.getByRole('searchbox', { name: 'חיפוש מקום' }).fill('EM')
  await expect(page).toHaveURL(/q=EM/)
  await page.getByRole('link', { name: 'EM107' }).click()
  await expect(page.getByRole('heading', { name: 'EM107' })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'EM107' })).toBeVisible()

  await page.getByRole('link', { name: 'חזרה לחיפוש' }).click()
  await expect(page).toHaveURL(/q=EM/)
  await expect(page.getByRole('searchbox', { name: 'חיפוש מקום' })).toHaveValue('EM')

  await page.getByRole('link', { name: 'EM107' }).click()
  await expect(page.getByRole('heading', { name: 'EM107' })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('searchbox', { name: 'חיפוש מקום' })).toHaveValue('EM')
})

test('the keyboard alone: every stop has a visible focus mark', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'computer', 'A keyboard is used on the computer.')
  for (const path of ['/', `/spaces/${await placeId(request, 'M206')}`, '/login']) {
    await page.goto(path)
    await expect(page.getByRole('switch', { name: 'מצב כהה' })).toBeVisible()
    const unmarked: string[] = []
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Tab')
      const mark = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null
        if (!el || el === document.body) return null
        const marked = (node: Element | null) => {
          if (!node) return false
          const style = getComputedStyle(node)
          return (style.outlineStyle !== 'none' && style.outlineWidth !== '0px') || style.boxShadow !== 'none'
        }
        // A place card draws the mark around the whole card, its list item.
        const visible = marked(el) || (el.tagName === 'A' && marked(el.closest('li')))
        return visible ? '' : `${el.tagName} ${el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 30)}`
      })
      if (mark) unmarked.push(`${path}: ${mark}`)
    }
    expect(unmarked).toEqual([])
  }
})

// --- the admin -------------------------------------------------------------

test('signs: one per printed page, a QR that opens the place, and a revoked code that stops working', async ({ page }, testInfo) => {
  await signIn(page, 'admin')
  await page.getByRole('link', { name: 'ניהול' }).click()
  await expect(page.getByRole('img', { name: /קוד QR/ })).toHaveCount(10)

  if (testInfo.project.name === 'computer') {
    // Printing is the same on every device: checked once, as a real PDF.
    await page.emulateMedia({ media: 'print' })
    const pdf = (await page.pdf({ format: 'A4', printBackground: true })).toString('latin1')
    expect(pdf.match(/\/Type\s*\/Page[^s]/g)?.length).toBe(10)
    await page.emulateMedia({ media: 'screen' })
  }

  // Read the QR code off the sign, as a phone camera would.
  const sign = page.getByRole('listitem', { name: 'מתחם לימוד, בניין L' })
  const pixels = await sign.getByRole('img', { name: /קוד QR/ }).evaluate((img: HTMLImageElement) => {
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const context = canvas.getContext('2d')!
    context.drawImage(img, 0, 0)
    const data = context.getImageData(0, 0, canvas.width, canvas.height)
    return { width: data.width, height: data.height, data: Array.from(data.data) }
  })
  const decoded = jsQR(Uint8ClampedArray.from(pixels.data), pixels.width, pixels.height)
  expect(decoded?.data).toMatch(new RegExp(`^${SITE}/scan#c=`))
  const oldAddress = decoded!.data

  const phone = await page.context().newPage()
  await phone.goto(oldAddress)
  await expect(phone.getByRole('heading', { name: 'מתחם לימוד' })).toBeVisible()

  await sign.getByRole('button', { name: 'לבטל את הקוד' }).click()
  await sign.getByRole('button', { name: 'כן, קוד חדש' }).click()
  await expect(sign.getByText(/השלט הישן כבר לא עובד/)).toBeVisible()

  await phone.goto('about:blank')
  await phone.goto(oldAddress)
  await expect(phone.getByRole('heading', { name: 'מתחם לימוד' })).toBeVisible()
  await phone.getByRole('button', { name: 'אני כאן' }).click()
  await expect(phone.getByText(/הקוד לא תקין/)).toBeVisible()
})

test('a building moved on the admin map moves in the API too', async ({ page, request }) => {
  const buildings = async () => (await (await request.get(`${API}/institutions/demo/buildings`)).json()) as { id: number; code: string; latitude: number; longitude: number }[]
  const before = (await buildings()).find((b) => b.code === 'L')!

  await signIn(page, 'admin')
  await page.getByRole('link', { name: 'ניהול' }).click()
  await page.getByRole('button', { name: 'מיקום בניינים' }).click()
  await page.getByRole('button', { name: /בניין L/ }).click()
  const map = page.getByRole('region', { name: 'מיקום בניינים' }).locator('.leaflet-container')
  await map.scrollIntoViewIfNeeded() // below the list on a narrow screen
  const box = (await map.boundingBox())!
  try {
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.3)
    await expect(page.getByRole('status').filter({ hasText: 'בניין L מוקם על המפה' })).toBeVisible()
    const after = (await buildings()).find((b) => b.code === 'L')!
    expect([after.latitude, after.longitude]).not.toEqual([before.latitude, before.longitude])
  } finally {
    // Put it back, even when the test failed: the other devices and runs
    // must see the campus as it was.
    const token = await apiToken(request, 'admin')
    const restored = await request.post(`${API}/admin/buildings/${before.id}/location`, {
      data: { latitude: before.latitude, longitude: before.longitude },
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(restored.ok()).toBeTruthy()
  }
})
