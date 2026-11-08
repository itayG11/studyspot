// Wave 19.1b: a room whose student stepped out for a while says so. The server's
// rules are tested in backend/tests/test_break.py; here the page's answer is
// changed on its way, and the page is checked for what a visitor sees, and by axe.

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
  test(`a room on a break says until when, ${label}`, async ({ page }) => {
    await page.route(isMapTile, (route) => route.abort())
    await page.setViewportSize(viewport)
    await page.emulateMedia({ colorScheme })
    const id = await placeId(page, 'EM107')
    const until = new Date(Date.now() + 15 * 60_000).toISOString()
    await page.route(new RegExp(`/places/${id}$`), async (route) => {
      const response = await route.fetch()
      const body = await response.json()
      await route.fulfill({ response, json: { ...body, is_open: true, free_now: false, free_from: until, on_break_until: until } })
    })
    await page.goto(`/spaces/${id}`)
    await expect(page.getByText(/^בהפסקה עד \d\d:\d\d$/)).toBeVisible()
    await page.waitForFunction(
      "document.getAnimations().every((a) => !(a.timeline instanceof DocumentTimeline) || a.effect?.getTiming().iterations === Infinity || a.playState !== 'running')",
    )
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
    expect(result.violations.map((v) => `${v.id} ${v.nodes[0]?.target.join(' ')}`)).toEqual([])
  })
}
