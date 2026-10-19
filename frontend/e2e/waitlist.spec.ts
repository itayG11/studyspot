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

// The first start, from the first day on, that an hour can be booked from:
// the same choice in both windows. Not just the first free start: the test
// database keeps earlier runs' bookings, and one may begin within the hour.
// Not the last day: the window is four days to the minute, so around
// midnight the last day has no time open yet.
async function chooseFirstFreeHour(form: Locator) {
  const days = form.getByRole('group', { name: 'יום' }).getByRole('button')
  const starts = form.getByRole('group', { name: 'שעת התחלה' }).getByRole('button', { disabled: false })
  const hour = form.getByRole('group', { name: 'אורך' }).getByRole('button', { name: 'שעה', exact: true })
  await expect(days.first()).toBeVisible()
  const dayCount = await days.count()
  for (let d = 0; d < dayCount; d++) {
    await days.nth(d).click()
    await expect(days.nth(d)).toHaveAttribute('aria-pressed', 'true')
    // The day's times load after the click: wait for them, or for the note that none are left.
    await expect(
      form.getByRole('group', { name: 'שעת התחלה', exact: true }).or(form.getByText('לא נשארו ביום הזה שעות להזמנה')),
    ).toBeVisible()
    const startCount = await starts.count()
    for (let s = 0; s < startCount; s++) {
      await starts.nth(s).click()
      await expect(form.getByRole('group', { name: 'אורך' })).toBeVisible() // the lengths for this start
      if ((await hour.count()) > 0 && (await hour.isEnabled())) {
        await hour.click()
        return
      }
    }
  }
  throw new Error('no start in the booking window that an hour can be booked from')
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
  await chooseFirstFreeHour(formA)
  await chooseFirstFreeHour(formB)
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
