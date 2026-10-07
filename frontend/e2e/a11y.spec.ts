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
  // entrance animations (the endless ones, like a live dot, never end).
  // (A string: it runs in the page, and this file is typed without the DOM.)
  await page.waitForFunction(
    "document.getAnimations().every((a) => a.effect?.getTiming().iterations === Infinity || a.playState !== 'running')",
  )
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  const problems = result.violations.map((v) => `${what}: ${v.id} (${v.impact}) ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`)
  expect.soft(problems).toEqual([])
}

async function firstPlace(page: Page, name: string): Promise<number> {
  const places = await (await page.request.get(`${API}/institutions/demo/places`)).json()
  return places.find((p: { name: string }) => p.name === name).id
}

for (const [label, viewport] of [
  ['computer', { width: 1280, height: 860 }],
  ['phone', { width: 390, height: 844 }],
] as const) {
  test(`no automatic accessibility problems, ${label}`, async ({ page }) => {
    await page.setViewportSize(viewport)
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
  })
}
