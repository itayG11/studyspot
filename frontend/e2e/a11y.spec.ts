// An automatic accessibility check (axe) on every main screen, signed out
// and signed in, at a computer width and at a phone width. axe finds about
// a third of real problems: keyboard use and screen readers are still
// checked by hand (docs/INTERVIEW_REPORT.md).

import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const API = 'http://localhost:8001'

test.beforeEach(async ({ page }) => {
  await page.route(/tile\.openstreetmap\.org|arcgisonline\.com/, (route) => route.abort())
})

async function check(page: Page, what: string) {
  // Text that is still fading in is measured as faint: wait for the
  // entrance animations. Two kinds never end and are skipped: the endless
  // ones, like a live dot, and the story's scroll-driven ones, which follow
  // the scroll bar rather than the clock and so always read as running.
  // (A string: it runs in the page, and this file is typed without the DOM.)
  await page.waitForFunction(
    "document.getAnimations().every((a) => !(a.timeline instanceof DocumentTimeline) || a.effect?.getTiming().iterations === Infinity || a.playState !== 'running')",
  )
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  const problems = result.violations.map((v) => `${what}: ${v.id} (${v.impact}) ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`)
  expect.soft(problems).toEqual([])
}

async function firstPlace(page: Page, name: string): Promise<number> {
  const places = await (await page.request.get(`${API}/institutions/demo/places`)).json()
  return places.find((p: { name: string }) => p.name === name).id
}

for (const [label, viewport, colorScheme] of [
  ['computer', { width: 1280, height: 860 }, 'light'],
  ['phone', { width: 390, height: 844 }, 'light'],
  // The dark theme has its own colours, so its contrast is checked too:
  // once by the device's setting, once by the visitor's own choice
  ['computer, dark', { width: 1280, height: 860 }, 'dark'],
  ['phone, dark by choice', { width: 390, height: 844 }, 'chosen dark'],
] as const) {
  test(`no automatic accessibility problems, ${label}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    if (colorScheme === 'chosen dark') {
      await page.addInitScript("localStorage.setItem('studyspot:theme', 'dark')")
    } else {
      await page.emulateMedia({ colorScheme })
    }
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await check(page, 'home')

    await page.goto('/?q=M206#finder')
    await expect(page.getByRole('link', { name: 'M206' })).toBeVisible()
    await check(page, 'finder')

    await page.goto('/login')
    await check(page, 'login')
    await page.getByRole('button', { name: 'כניסה כסטודנט לדוגמה' }).click()
    await expect(page.getByText('סטודנט לדוגמה')).toBeVisible()

    await page.goto(`/spaces/${await firstPlace(page, 'M206')}`)
    await expect(page.getByRole('list', { name: 'תאים' })).toBeVisible()
    await check(page, 'lab')

    await page.goto(`/spaces/${await firstPlace(page, 'EM107')}`)
    await expect(page.getByRole('heading', { name: 'EM107' })).toBeVisible()
    await check(page, 'room')

    await page.goto('/me')
    await expect(page.getByRole('region', { name: 'המועדפים' })).toBeVisible()
    await check(page, 'my area')

    await page.goto('/scan')
    await expect(page.getByLabel('הקוד מהשלט')).toBeVisible()
    await check(page, 'scan')

    await page.goto('/nowhere')
    await check(page, 'not found')

    await page.goto('/privacy')
    await expect(page.getByRole('heading', { level: 1, name: 'מדיניות הפרטיות' })).toBeVisible()
    await check(page, 'privacy')

    // The admin's signs: paper-white in both themes, with screen-only buttons
    await page.context().clearCookies() // the demo student signs out
    await page.goto('/login')
    await page.getByRole('button', { name: 'כניסה כמנהל מוסד לדוגמה' }).click()
    await page.getByRole('link', { name: 'ניהול' }).click()
    await expect(page.getByRole('img', { name: /קוד QR/ })).toHaveCount(10)
    await check(page, 'admin signs')
  })
}
