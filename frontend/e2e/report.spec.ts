// Wave 19.2: a student at a booked room that someone is sitting in says so with
// two taps and is told where else to go. The server's rules are tested in
// backend/tests/test_reports.py; here the booking list and the report's answer
// are set on their way, so the test does not depend on the time of day, and
// the page is checked for what a visitor sees, and by axe.

import { isMapTile } from './tiles.ts'
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const API = 'http://localhost:8001'

async function placeId(page: Page, name: string): Promise<number> {
  const places = await (await page.request.get(`${API}/institutions/demo/places`)).json()
  return places.find((p: { name: string }) => p.name === name).id
}

for (const [label, viewport, colorScheme] of [
  ['computer', { width: 1280, height: 860 }, 'light'],
  ['phone, dark', { width: 390, height: 844 }, 'dark'],
] as const) {
  test(`a student reports a taken room and is shown another, ${label}`, async ({ page }) => {
    await page.route(isMapTile, (route) => route.abort())
    await page.setViewportSize(viewport)
    await page.emulateMedia({ colorScheme })
    await page.goto('/login')
    await page.getByRole('button', { name: 'כניסה כסטודנט לדוגמה' }).click()
    await expect(page.getByRole('button', { name: 'התנתקות' })).toBeVisible()

    const roomId = await placeId(page, 'EM107')
    const starts = new Date(Date.now() + 5 * 60_000).toISOString()
    const ends = new Date(Date.now() + 65 * 60_000).toISOString()
    await page.route(/\/me\/bookings$/, (route) =>
      route.fulfill({
        json: [{ id: 4242, place_id: roomId, place_name: 'EM107', building_code: 'EM', seat_id: null, seat_label: null, starts_at: starts, ends_at: ends, status: 'booked', source: 'advance' }],
      }),
    )
    let reported = 0
    await page.route(/\/bookings\/4242\/report-occupied$/, (route) => {
      reported += 1
      return route.fulfill({
        json: { reported: true, alternatives: [{ place_id: roomId, place_name: 'EM108', building_code: 'EM', walk_minutes: 2, kind: 'group_room', seat_id: null, seat_label: null, free_until: null }] },
      })
    })
    await page.goto('/me')
    const row = page.getByRole('listitem', { name: /הזמנה: EM107/ })
    await row.getByRole('button', { name: 'יש מישהו במקום' }).click()
    expect(reported).toBe(0) // asked first
    await row.getByRole('button', { name: 'כן, לדווח' }).click()
    await expect(row.getByRole('list', { name: 'מקומות פנויים קרובים' })).toContainText('EM108')
    await expect(row.getByText('הדיווח נשמר למוסד, בלי שם של מי שהיה שם.')).toBeVisible()
    expect(reported).toBe(1)
    // The answer spans the row, not the photo column (the trial institution, 10 Nov).
    const rowBox = (await row.boundingBox())!
    const listBox = (await row.getByRole('list', { name: 'מקומות פנויים קרובים' }).boundingBox())!
    expect(listBox.width).toBeGreaterThan(rowBox.width * 0.6)
    await page.screenshot({ path: `test-results/report-${label.replace(/\W+/g, '-')}.png` })
    await page.waitForFunction(
      "document.getAnimations().every((a) => !(a.timeline instanceof DocumentTimeline) || a.effect?.getTiming().iterations === Infinity || a.playState !== 'running')",
    )
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
    expect(result.violations.map((v) => `${v.id} ${v.nodes[0]?.target.join(" ")}`)).toEqual([])
  })
}

test('after a reload, a reported booking says so and stays', async ({ page }) => {
  await page.route(isMapTile, (route) => route.abort())
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/login')
  await page.getByRole('button', { name: 'כניסה כסטודנט לדוגמה' }).click()
  await expect(page.getByRole('button', { name: 'התנתקות' })).toBeVisible()
  const roomId = await placeId(page, 'EM107')
  const starts = new Date(Date.now() + 5 * 60_000).toISOString()
  const ends = new Date(Date.now() + 65 * 60_000).toISOString()
  await page.route(/\/me\/bookings$/, (route) =>
    route.fulfill({
      json: [{ id: 4242, place_id: roomId, place_name: 'EM107', building_code: 'EM', seat_id: null, seat_label: null, starts_at: starts, ends_at: ends, status: 'booked', source: 'advance', reported: true }],
    }),
  )
  await page.goto('/me')
  const row = page.getByRole('listitem', { name: /הזמנה: EM107/ })
  await expect(row.getByText(/דיווחת שהמקום תפוס/)).toBeVisible()
  await expect(row.getByRole('button', { name: 'יש מישהו במקום' })).toHaveCount(0)
  await expect(row.getByRole('button', { name: 'לבטל' })).toBeVisible()
  await expect(row.getByRole('link', { name: 'EM107' })).toHaveAttribute('href', `/demo/spaces/${roomId}`)
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  expect(result.violations.map((v) => `${v.id} ${v.nodes[0]?.target.join(" ")}`)).toEqual([])
  // After axe: scrolled, the tab bar half-covers a timetable chip, which axe counts as a small target.
  await row.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await row.screenshot({ path: 'test-results/report-after-reload.png' })
})
