// The fixes from the user's check of the live site, 25 Oct 2026: one test
// each, with a screenshot in test-results/ as the proof.
import { expect, test } from '@playwright/test'

test('the code form has a way back to the page before', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: 'כניסה כסטודנט לדוגמה' }).click()
  await expect(page.getByRole('button', { name: 'התנתקות' })).toBeVisible()
  await page.goto('/demo')
  await page.goto('/scan')
  await expect(page.getByRole('heading', { name: 'כניסה למקום' })).toBeVisible()
  await page.screenshot({ path: 'test-results/fix-scan-back.png' })
  await page.getByRole('link', { name: 'חזרה' }).click()
  await expect(page).toHaveURL(/\/demo$/)
})
