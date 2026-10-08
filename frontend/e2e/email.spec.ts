import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'

// Sign-in with a one-time code by email. The test server prints codes to its
// log instead of sending them (EMAIL_LOGIN_DEV_LOG); the test recovers the
// code from the database with e2e/email_code.py.

const python = process.env.PYTHON ?? 'python'
const backend = resolve(import.meta.dirname, '../../backend')

function codeFor(email: string): string {
  return execFileSync(python, [`${import.meta.dirname}/email_code.py`, email], {
    cwd: backend,
    env: { ...process.env, PYTHONPATH: backend }, // a script's own folder comes first on sys.path, not cwd
  }).toString().trim()
}

test('a Braude student signs in with a code sent to the college address', async ({ page }) => {
  // A fresh address on every run, so the per-address limit never fills up.
  const email = `e2e.${Date.now()}@e.braude.ac.il`
  await page.goto('/login')
  await page.getByLabel('כתובת המייל של המכללה').fill(email)
  await page.getByRole('button', { name: 'שליחת קוד' }).click()
  await expect(page.getByText('שלחנו קוד בן 6 ספרות אל')).toBeVisible()

  // A wrong code first: refused, and the form stays.
  const field = page.getByLabel('הקוד מהמייל')
  const code = codeFor(email)
  await field.fill(code === '000000' ? '111111' : '000000')
  await page.getByRole('button', { name: 'כניסה', exact: true }).click()
  await expect(page.getByText(/הקוד לא נכון/)).toBeVisible()

  await field.fill(code)
  await page.getByRole('button', { name: 'כניסה', exact: true }).click()
  await expect(page.getByRole('button', { name: 'התנתקות' })).toBeVisible()
  await page.goto('/me')
  await expect(page.getByText(email)).toBeVisible()
})

test('an address that is not a college one gets no code', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('כתובת המייל של המכללה').fill('someone@gmail.com')
  await page.getByRole('button', { name: 'שליחת קוד' }).click()
  await expect(page.getByText(/אפשר לקבל קוד רק לכתובת של מוסד/)).toBeVisible()
})
