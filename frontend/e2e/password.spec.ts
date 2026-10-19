import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'

// Wave 11: a password, set after an emailed code. The test server logs codes
// instead of sending them; e2e/email_code.py reads the last one.

const python = process.env.PYTHON ?? 'python'
const backend = resolve(import.meta.dirname, '../../backend')
const PASSWORD = 'Kfar-Tavor 7 rain'

function codeFor(email: string): string {
  return execFileSync(python, [`${import.meta.dirname}/email_code.py`, email], {
    cwd: backend,
    env: { ...process.env, PYTHONPATH: backend },
  }).toString().trim()
}

test('a code, then a password; out, and back in with the password', async ({ page }) => {
  const email = `e2e.password.${Date.now()}@e.braude.ac.il`
  await page.goto('/login')
  await page.getByRole('button', { name: 'סיסמה', exact: true }).click()
  await page.getByRole('button', { name: 'שכחתי סיסמה, או שעוד אין לי' }).click()
  await page.getByLabel('כתובת המייל של המכללה').fill(email)
  await page.getByRole('button', { name: 'שליחת קוד' }).click()
  await page.getByLabel('הקוד מהמייל').fill(codeFor(email))
  await page.getByLabel('סיסמה חדשה').fill(PASSWORD)
  await page.getByRole('button', { name: 'שמירת הסיסמה' }).click()
  await expect(page.getByRole('button', { name: 'התנתקות' })).toBeVisible()

  await page.goto('/me')
  await expect(page.getByRole('button', { name: 'להחליף סיסמה' })).toBeVisible()
  await page.getByRole('button', { name: 'התנתקות' }).first().click()
  await expect(page.getByRole('link', { name: 'התחברות' }).first()).toBeVisible()

  await page.goto('/login')
  await page.getByRole('button', { name: 'סיסמה', exact: true }).click()
  await page.getByLabel('כתובת המייל של המכללה').fill(email)
  await page.getByLabel('סיסמה', { exact: true }).fill('Wrong-Password 1')
  await page.getByRole('button', { name: 'כניסה', exact: true }).click()
  await expect(page.getByText(/המייל או הסיסמה שגויים/)).toBeVisible()
  await page.getByLabel('סיסמה', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'כניסה', exact: true }).click()
  await expect(page.getByRole('button', { name: 'התנתקות' })).toBeVisible()
})
