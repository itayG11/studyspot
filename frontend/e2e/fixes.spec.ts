// The fixes from the user's check of the live site, 25 Oct 2026: one test
// each, with a screenshot in test-results/ as the proof.
import { expect, test } from '@playwright/test'

test('the code form has a way back: to the page before, or home when opened straight', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: 'כניסה כסטודנט לדוגמה' }).click()
  await expect(page.getByRole('button', { name: 'התנתקות' })).toBeVisible()

  // Inside the site: my area, "scan a code", back to my area.
  await page.goto('/me')
  await page.getByRole('link', { name: 'לסרוק קוד' }).click()
  await expect(page.getByRole('heading', { name: 'כניסה למקום' })).toBeVisible()
  await page.screenshot({ path: 'test-results/fix-scan-back.png' })
  await page.getByRole('link', { name: 'חזרה' }).click()
  await expect(page).toHaveURL(/\/me$/)

  // A new tab from a sign's code: the page replaces its own address, and
  // there is still nothing before it, so "back" leads to the front page.
  const tab = await page.context().newPage()
  await tab.goto('/scan#c=not-a-real-code')
  await expect(tab).toHaveURL(/\/scan$/)
  await tab.getByRole('link', { name: 'חזרה' }).click()
  await expect(tab).toHaveURL(/\/demo$/)
  await tab.close()
})

// Every bar stands on the same line, and every column says its hour.
async function checkChart(scope: import('@playwright/test').Locator, shot: string) {
  const columns = scope.locator('[title]')
  await expect(columns.first()).toBeVisible()
  const count = await columns.count()
  expect(count).toBeGreaterThan(5)
  const rows = await columns.evaluateAll((all) =>
    all.map((c) => {
      const [value, plot, hour] = [...c.children] as HTMLElement[]
      const box = plot.getBoundingClientRect()
      const label = hour.firstElementChild as HTMLElement
      const fits = (outer: HTMLElement, inner: DOMRect) => {
        const room = outer.getBoundingClientRect()
        return inner.width <= room.width + 1 && inner.height <= room.height + 1
      }
      return {
        bottom: Math.round(box.bottom),
        hour: hour.innerText.trim(),
        cut: value.scrollWidth > value.clientWidth + 1 || !fits(hour, label.getBoundingClientRect()),
      }
    }),
  )
  expect(new Set(rows.map((r) => r.bottom)).size).toBe(1)
  expect(rows.filter((r) => r.cut)).toEqual([]) // no number cut off in a narrow column
  for (const r of rows) expect(r.hour).toMatch(/^\d{2}:00$/) // the full hour, on a phone too
  await scope.screenshot({ path: `test-results/${shot}` })
}

// The campus runs on the real clock: closed on Saturday (no chart), and
// before it opens there is no "today" yet. The legend's threshold line is
// there either way.
test('the campus chart: bars on one line, an hour under every column, a legend for every colour', async ({ page }) => {
  await page.goto('/demo')
  const card = page.getByRole('region', { name: 'העומס היום בקמפוס' })
  await card.scrollIntoViewIfNeeded()
  test.skip(await card.getByText('הקמפוס סגור היום.').isVisible(), 'the campus is closed today')
  await expect(card.getByText(/85% ומעלה מהמקומות$/)).toBeVisible()
  await checkChart(card, 'fix-chart-campus.png')
})

// The narrowest common phone (320) and a usual one (390), held upright.
for (const width of [320, 390]) {
  test(`on a phone too, ${width} wide`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      storageState: { cookies: [], origins: [{ origin: 'http://localhost:5174', localStorage: [{ name: 'studyspot:cookie-note-seen', value: '1' }] }] },
    })
    const page = await context.newPage()
    await page.goto('http://localhost:5174/demo')
    const card = page.getByRole('region', { name: 'העומס היום בקמפוס' })
    await card.scrollIntoViewIfNeeded()
    if (await card.getByText('הקמפוס סגור היום.').isVisible()) {
      await context.close()
      test.skip(true, 'the campus is closed today')
    }
    await checkChart(card, `fix-chart-phone-${width}.png`)
    await context.close()
  })
}

test("a place's chart on another day uses the same chart", async ({ page, request }) => {
  const places = await (await request.get('http://localhost:8001/institutions/demo/places')).json()
  const open = places.find((p: { kind: string }) => p.kind === 'open_area')
  await page.goto(`/places/${open.id}`)
  const card = page.locator('section', { has: page.getByRole('heading', { name: 'עומס צפוי' }) })
  await card.scrollIntoViewIfNeeded()
  // Another day than today, and not Saturday, when the campus is closed.
  const other = card
    .getByRole('group', { name: 'יום בשבוע' })
    .getByRole('button', { pressed: false })
    .filter({ hasNotText: 'ש׳' })
  await other.first().click()
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

test('the bulk table templates are download buttons that download', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: 'כניסה כמנהל מוסד לדוגמה' }).click()
  await expect(page.getByRole('button', { name: 'התנתקות' })).toBeVisible()
  await page.goto('/demo/admin?tab=adding')
  const section = page.getByRole('region', { name: 'הרבה בניינים בבת אחת' })
  await section.scrollIntoViewIfNeeded()
  await section.screenshot({ path: 'test-results/fix-templates.png' })
  const [download] = await Promise.all([page.waitForEvent('download'), section.getByRole('link', { name: 'תבנית CSV' }).click()])
  expect(download.suggestedFilename()).toBe('buildings.csv')
})

test('the connections tab: the widget first, the IT parts folded', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: 'כניסה כמנהל מוסד לדוגמה' }).click()
  await expect(page.getByRole('button', { name: 'התנתקות' })).toBeVisible()
  await page.goto('/demo/admin?tab=connections')
  await expect(page.getByRole('heading', { name: "וידג'ט לאתר של המוסד" })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'מפתחות API' })).toBeHidden()
  await page.screenshot({ path: 'test-results/fix-connections.png', fullPage: true })
  await page.getByText('לאנשי המחשוב של המוסד: מפתחות API ו-webhooks').click()
  await expect(page.getByRole('heading', { name: 'מפתחות API' })).toBeVisible()
})

test('the timetable import says which files it reads, without the word "Yedion"', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: 'כניסה כסטודנט לדוגמה' }).click()
  await expect(page.getByRole('button', { name: 'התנתקות' })).toBeVisible()
  await page.goto('/me')
  const hint = page.getByText(/^אפשר להעלות: קובץ אקסל של מערכת השעות/)
  await hint.scrollIntoViewIfNeeded()
  await expect(hint).toContainText('קובץ אקסל אחר')
  await expect(page.getByText(/ידיעון/)).toHaveCount(0)
  await hint.locator('..').screenshot({ path: 'test-results/fix-import-hint.png' })
})
