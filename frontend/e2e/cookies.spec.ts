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
