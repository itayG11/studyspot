// The cookie note on a first visit: there once, gone after "got it".
import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

test('the cookie note shows once, and stays away after "got it"', async ({ page }) => {
  await page.goto('/demo')
  const note = page.getByRole('region', { name: /עוגיות באתר/ })
  await expect(note).toBeVisible()
  await page.screenshot({ path: 'test-results/cookie-note.png' })
  await note.getByRole('button', { name: 'הבנתי' }).click()
  await expect(note).toBeHidden()
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
  await expect(note).toBeHidden()
})

test("on a phone, the place page's booking bar stands above the note, not behind it", async ({ browser, request }) => {
  const places = await (await request.get('http://localhost:8001/institutions/demo/places')).json()
  const room = places.find((p: { kind: string }) => p.kind === 'group_room')
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  await page.goto(`http://localhost:5174/places/${room.id}`)
  const note = page.getByRole('region', { name: /עוגיות באתר/ })
  await expect(note).toBeVisible()
  const bar = page.locator('[class*="bookBar"]')
  await expect(bar).toBeVisible()
  const [noteBox, barBox] = [await note.boundingBox(), await bar.boundingBox()]
  expect(barBox!.y + barBox!.height).toBeLessThanOrEqual(noteBox!.y + 1)
  await page.screenshot({ path: 'test-results/cookie-note-phone.png' })
  await note.getByRole('button', { name: 'הבנתי' }).click()
  await expect(note).toBeHidden()
  const after = await bar.boundingBox()
  expect(Math.round(after!.y + after!.height)).toBe(844)
  await context.close()
})

test('on a phone, the end of the page scrolls clear of both the note and the tab bar', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  await page.goto('http://localhost:5174/demo')
  const note = page.getByRole('region', { name: /עוגיות באתר/ })
  await expect(note).toBeVisible()
  const bar = page.getByRole('navigation', { name: 'ניווט מהיר' })
  await expect(bar).toBeVisible()
  // The page grows as parts of it load: scroll until its height holds still.
  await expect(async () => {
    const before = await page.evaluate(() => document.documentElement.scrollHeight)
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await page.waitForTimeout(400)
    const now = await page.evaluate(() => [document.documentElement.scrollHeight, window.scrollY + window.innerHeight])
    expect(now[0]).toBe(before)
    expect(now[1]).toBeGreaterThanOrEqual(now[0] - 2)
  }).toPass({ timeout: 20_000 })
  const last = page.locator('footer a').last()
  await expect(last).toBeVisible()
  const [linkBox, noteBox, barBox] = [await last.boundingBox(), await note.boundingBox(), await bar.boundingBox()]
  expect(linkBox!.y + linkBox!.height).toBeLessThanOrEqual(noteBox!.y + 1)
  expect(noteBox!.y + noteBox!.height).toBeLessThanOrEqual(barBox!.y + 1)
  await context.close()
})
