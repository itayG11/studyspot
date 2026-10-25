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
