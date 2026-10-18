import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test'

// Wave 11: notices by email, and the waiting list for a group room. Two
// Braude students sign in with a code to the college address (the test
// server logs codes instead of sending them; e2e/email_code.py reads them).

const python = process.env.PYTHON ?? 'python'
const backend = resolve(import.meta.dirname, '../../backend')
const API = `http://localhost:${process.env.API_PORT ?? 8001}`

function codeFor(email: string): string {
  return execFileSync(python, [`${import.meta.dirname}/email_code.py`, email], {
    cwd: backend,
    env: { ...process.env, PYTHONPATH: backend },
  }).toString().trim()
}

async function signedInStudent(browser: Browser, name: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage()
  const email = `e2e.${name}.${Date.now()}@e.braude.ac.il`
  await page.goto('/login')
  await page.getByLabel('כתובת המייל של המכללה').fill(email)
  await page.getByRole('button', { name: 'שליחת קוד' }).click()
  await page.getByLabel('הקוד מהמייל').fill(codeFor(email))
  await page.getByRole('button', { name: 'כניסה', exact: true }).click()
  await expect(page.getByRole('button', { name: 'התנתקות' })).toBeVisible()
  return page
}

// The last bookable day's first free hour: the same choice in both windows.
async function chooseLastDayFirstHour(form: Locator) {
  const days = form.getByRole('group', { name: 'יום' }).getByRole('button')
  await expect(days.first()).toBeVisible()
  await days.last().click()
  await expect(days.last()).toHaveAttribute('aria-pressed', 'true')
  await form.getByRole('group', { name: 'שעת התחלה' }).getByRole('button', { disabled: false }).first().click()
  await form.getByRole('group', { name: 'אורך' }).getByRole('button', { name: 'שעה', exact: true }).click()
}

test('email notices: on and off, shown with the address they go to', async ({ browser }) => {
  const page = await signedInStudent(browser, 'notices')
  await page.goto('/me')
  await page.getByRole('button', { name: 'להפעיל התראות במייל' }).click()
  await expect(page.getByRole('button', { name: 'לכבות התראות במייל' })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'לכבות התראות במייל' }).click()
  await expect(page.getByRole('button', { name: 'להפעיל התראות במייל' })).toBeVisible()
})

test('a clash on a group room: wait for it to free, see it in my area, remove it', async ({ browser, request }) => {
  const places = await (await request.get(`${API}/institutions/braude/places`)).json()
  const room = `/braude/spaces/${places.find((p: { name: string }) => p.name === 'EM107').id}`
  const first = await signedInStudent(browser, 'first')
  const second = await signedInStudent(browser, 'second')
  // Only a student we can tell may wait: notices by email on first.
  await second.goto('/me')
  await second.getByRole('button', { name: 'להפעיל התראות במייל' }).click()
  await expect(second.getByRole('button', { name: 'לכבות התראות במייל' })).toBeVisible()
  await first.goto(room)
  await second.goto(room)
  const formA = first.getByRole('complementary')
  const formB = second.getByRole('complementary')
  await chooseLastDayFirstHour(formA)
  await chooseLastDayFirstHour(formB)
  await formA.getByRole('button', { name: 'להזמין', exact: true }).click()
  await expect(first.getByRole('status').filter({ hasText: 'ההזמנה נקלטה' })).toBeVisible()

  await formB.getByRole('button', { name: 'להזמין', exact: true }).click()
  await expect(second.getByRole('alert').filter({ hasText: 'מישהו הזמין את הזמן הזה ממש עכשיו' })).toBeVisible()
  await second.getByRole('button', { name: 'להודיע לי אם יתפנה' }).click()
  await expect(second.getByRole('status').filter({ hasText: /נרשמת. אם הזמן יתפנה/ })).toBeVisible()

  await second.goto('/me')
  const waiting = second.getByRole('region', { name: 'ממתין שיתפנה' })
  await expect(waiting.getByText('EM107')).toBeVisible()
  await waiting.getByRole('button', { name: 'להסיר' }).click()
  await waiting.getByRole('button', { name: 'כן, להסיר' }).click()
  await expect(waiting).toHaveCount(0)
})
