// Wave 19.1: a free room whose last stay ended by the clock a moment ago is
// shown as "maybe still taken". The server marks it (backend/tests/test_lingering.py);
// here the page's answer is changed on its way, so the test needs no clock tricks,
// and the page is checked for what a visitor sees, and by axe.

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
  test(`a free room that may not have been left says so, ${label}`, async ({ page }) => {
    await page.route(isMapTile, (route) => route.abort())
    await page.setViewportSize(viewport)
    await page.emulateMedia({ colorScheme })
    const id = await placeId(page, 'EM107')
    await page.route(new RegExp(`/places/${id}$`), async (route) => {
      const response = await route.fetch()
      const body = await response.json()
      await route.fulfill({ response, json: { ...body, is_open: true, free_now: true, free_from: null, maybe_still_taken: true } })
    })
    await page.goto(`/spaces/${id}`)
    const note = page.getByRole('note', { name: 'אולי עדיין תפוס' })
    await expect(note).toBeVisible()
    await expect(note).toContainText('מי שהיה כאן אולי עוד לא יצא')
    await expect(page.getByText('פנוי, אולי עדיין תפוס')).toBeVisible()
    await page.waitForFunction(
      "document.getAnimations().every((a) => !(a.timeline instanceof DocumentTimeline) || a.effect?.getTiming().iterations === Infinity || a.playState !== 'running')",
    )
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
    expect(result.violations.map((v) => `${v.id} ${v.nodes[0]?.target.join(' ')}`)).toEqual([])
  })
}
