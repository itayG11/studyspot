// Wave 19.3: the institution's screen for "someone stayed after their time". The
// server's rules are tested in backend/tests/test_overstay_admin.py; here the
// three answers are set on their way, so the test does not depend on what the
// demo campus holds today, and the page is checked for what an admin sees, and by axe.

import { isMapTile } from './tiles.ts'
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const SETTINGS = { policy: 'reports', grace_minutes: 5, break_minutes: 20, locked: true, open_reports: 1 }
const OPEN = [{ id: 1, place_id: 3, place_name: 'EM107', building_code: 'EM', seat_label: null, created_at: '2026-11-03T10:00:00Z', status: 'open', resolution: null }]
const HEAT = {
  days: 30,
  cells: [
    { place_id: 3, place_name: 'EM107', weekday: 1, hour: 12, count: 6 },
    { place_id: 3, place_name: 'EM107', weekday: 3, hour: 13, count: 2 },
  ],
  recommendations: [{ place_id: 3, place_name: 'EM107', count: 4, kind: 'shorten_booking' }],
}

for (const [label, viewport, colorScheme] of [
  ['computer', { width: 1280, height: 860 }, 'light'],
  ['phone, dark', { width: 390, height: 844 }, 'dark'],
] as const) {
  test(`the admin reads when people stay after their time, ${label}`, async ({ page }) => {
    await page.route(isMapTile, (route) => route.abort())
    await page.setViewportSize(viewport)
    await page.emulateMedia({ colorScheme })
    await page.route(/\/admin\/institutions\/demo\/overstay$/, (route) => route.fulfill({ json: SETTINGS }))
    await page.route(/\/admin\/institutions\/demo\/reports\?status=open$/, (route) => route.fulfill({ json: OPEN }))
    await page.route(/\/admin\/institutions\/demo\/reports\/heat\?days=30$/, (route) => route.fulfill({ json: HEAT }))
    await page.goto('/login')
    await page.getByRole('button', { name: 'כניסה כמנהל מוסד לדוגמה' }).click()
    await page.getByRole('link', { name: 'ניהול' }).click()
    await page.getByRole('button', { name: 'שוהים אחרי הזמן' }).click()
    const table = page.getByRole('table', { name: 'הזמנים עם הכי הרבה דיווחים' })
    await expect(table).toContainText('EM107')
    await expect(table).toContainText('שלישי')
    await expect(page.getByRole('list', { name: 'מה אפשר לעשות' })).toContainText('4 דיווחים בשבוע')
    await expect(page.getByRole('list', { name: 'דיווחים פתוחים' })).toContainText('EM107')
    await expect(page.getByText('בקמפוס ההדגמה אי אפשר לשנות')).toBeVisible()
    await page.waitForFunction(
      "document.getAnimations().every((a) => !(a.timeline instanceof DocumentTimeline) || a.effect?.getTiming().iterations === Infinity || a.playState !== 'running')",
    )
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
    expect(result.violations.map((v) => `${v.id} ${v.nodes[0]?.target.join(' ')}`)).toEqual([])
  })
}
