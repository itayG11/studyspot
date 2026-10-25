// The fixes from the user's check of the live site, 25 Oct 2026: one test
// each, with a screenshot in test-results/ as the proof.
import { expect, test } from '@playwright/test'

test('the code form has a way back to the page before', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: 'כניסה כסטודנט לדוגמה' }).click()
  await expect(page.getByRole('button', { name: 'התנתקות' })).toBeVisible()
  await page.goto('/demo')
  // Signed in again from the cookie before the next load, so the two do not race.
  await expect(page.getByRole('button', { name: 'התנתקות' })).toBeVisible()
  await page.goto('/scan')
  await expect(page.getByRole('heading', { name: 'כניסה למקום' })).toBeVisible()
  await page.screenshot({ path: 'test-results/fix-scan-back.png' })
  await page.getByRole('link', { name: 'חזרה' }).click()
  await expect(page).toHaveURL(/\/demo$/)
})

// Every bar stands on the same line, and every column says its hour.
async function checkChart(scope: import('@playwright/test').Locator, shot: string) {
  const columns = scope.locator('[title]')
  await expect(columns.first()).toBeVisible()
  const count = await columns.count()
  expect(count).toBeGreaterThan(5)
  const rows = await columns.evaluateAll((all) =>
    all.map((c) => {
      const [, plot, hour] = [...c.children] as HTMLElement[]
      const box = plot.getBoundingClientRect()
      return { bottom: Math.round(box.bottom), hour: hour.innerText.trim() }
    }),
  )
  expect(new Set(rows.map((r) => r.bottom)).size).toBe(1)
  for (const r of rows) expect(r.hour).toMatch(/^\d{1,2}(:00)?$/)
  await scope.screenshot({ path: `test-results/${shot}` })
}

test('the campus chart: bars on one line, an hour under every column, a legend for every colour', async ({ page }) => {
  await page.goto('/demo')
  const card = page.getByRole('region', { name: 'העומס היום בקמפוס' })
  await card.scrollIntoViewIfNeeded()
  await expect(card.getByText('אפור: בדרך כלל')).toBeVisible()
  await expect(card.getByText(/^היום: .*85% ומעלה/)).toBeVisible()
  await checkChart(card, 'fix-chart-campus.png')
})

test('on a phone too', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    storageState: { cookies: [], origins: [{ origin: 'http://localhost:5174', localStorage: [{ name: 'studyspot:cookie-note-seen', value: '1' }] }] },
  })
  const page = await context.newPage()
  await page.goto('http://localhost:5174/demo')
  const card = page.getByRole('region', { name: 'העומס היום בקמפוס' })
  await card.scrollIntoViewIfNeeded()
  await checkChart(card, 'fix-chart-phone.png')
  await context.close()
})

test("a place's chart on another day uses the same chart", async ({ page, request }) => {
  const places = await (await request.get('http://localhost:8001/institutions/demo/places')).json()
  const open = places.find((p: { kind: string }) => p.kind === 'open_area')
  await page.goto(`/places/${open.id}`)
  const card = page.locator('section', { has: page.getByRole('heading', { name: 'עומס צפוי' }) })
  await card.scrollIntoViewIfNeeded()
  const days = card.getByRole('group', { name: 'יום בשבוע' }).getByRole('button')
  await days.nth(2).click()
  await expect(card.getByText(/^בדרך כלל: .*85% ומעלה/)).toBeVisible()
  await checkChart(card, 'fix-chart-place-day.png')
})

test("another institution's campus says it is only for looking, and the list marks the student's own", async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: 'כניסה כסטודנט לדוגמה' }).click()
  await expect(page.getByRole('button', { name: 'התנתקות' })).toBeVisible()
  await page.goto('/institutions')
  const own = page.getByRole('listitem').filter({ has: page.getByRole('link', { name: /קמפוס הדגמה/ }) })
  await expect(own.getByText('המוסד שלך')).toBeVisible()
  await page.screenshot({ path: 'test-results/fix-institutions-own.png' })
  // An institution that is not listed (Braude, hidden here) still has its address.
  await page.goto('/braude')
  const note = page.getByRole('note', { name: 'קמפוס של מוסד אחר' })
  await expect(note).toContainText('אפשר רק לצפות')
  await page.screenshot({ path: 'test-results/fix-visiting-banner.png' })
  await note.getByRole('link', { name: /חזרה ל/ }).click()
  await expect(page).toHaveURL(/\/demo$/)
  await expect(note).toBeHidden()
})
