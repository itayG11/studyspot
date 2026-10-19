import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'

// Wave 12: a calendar feed. Made in "my area", read with no sign-in (as a
// calendar app would), and gone once the link is removed.

const python = process.env.PYTHON ?? 'python'
const backend = resolve(import.meta.dirname, '../../backend')

function codeFor(email: string): string {
  return execFileSync(python, [`${import.meta.dirname}/email_code.py`, email], {
    cwd: backend,
    env: { ...process.env, PYTHONPATH: backend },
  }).toString().trim()
}

test('make a feed, read it signed out, remove it', async ({ page, playwright }) => {
  const email = `e2e.calendar.${Date.now()}@e.braude.ac.il`
  await page.goto('/login')
  await page.getByLabel('כתובת המייל של המכללה').fill(email)
  await page.getByRole('button', { name: 'שליחת קוד' }).click()
  await page.getByLabel('הקוד מהמייל').fill(codeFor(email))
  await page.getByRole('button', { name: 'כניסה', exact: true }).click()
  await expect(page.getByRole('button', { name: 'התנתקות' }).first()).toBeVisible()

  await page.goto('/me')
  await page.getByRole('button', { name: 'ליצור קישור ליומן' }).click()
  const address = (await page.getByText(/calendar\.ics\?t=/).textContent())!.trim()
  // The whole address parsed, not a pattern that could match anywhere in it.
  const google = new URL((await page.getByRole('link', { name: /יומן Google/ }).getAttribute('href'))!)
  expect(google.origin).toBe('https://calendar.google.com')
  const token = new URL(address).searchParams.get('t')!
  expect(google.searchParams.get('cid')).toMatch(/^webcal:\/\//)
  expect(new URL(google.searchParams.get('cid')!.replace(/^webcal:/, 'https:')).searchParams.get('t')).toBe(token)

  // A calendar app has no cookie: a fresh request context, signed out.
  const outside = await playwright.request.newContext()
  const feed = await outside.get(address)
  expect(feed.status()).toBe(200)
  expect(feed.headers()['content-type']).toContain('text/calendar')
  expect(await feed.text()).toContain('BEGIN:VCALENDAR')

  await page.getByRole('button', { name: 'לבטל את הקישור' }).click()
  await page.getByRole('button', { name: 'כן, לבטל' }).click()
  await expect(page.getByRole('button', { name: 'ליצור קישור ליומן' })).toBeVisible()
  expect((await outside.get(address)).status()).toBe(404)
  await outside.dispose()
})
