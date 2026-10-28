// Beyond axe: what a keyboard user and a user with a large text size meet.
// Checks, on the main public screens: Tab always moves on and never gets
// stuck, every stop shows a focus ring, a window as narrow as 200% zoom on
// a laptop (or a 320 px phone) has no sideways scroll, and Windows
// high-contrast mode (forced colors) keeps the page readable. A screen
// reader is still checked by hand (docs/LAUNCH_GUIDE.md).

import { isMapTile } from './tiles.ts'
import { expect, test, type Page } from '@playwright/test'

const API = 'http://localhost:8001'
const SCREENS = ['/demo', '/login', '/privacy', '/terms', '/accessibility', '/institutions'] as const

test.beforeEach(async ({ page }) => {
  await page.route(isMapTile, (route) => route.abort())
})

async function settle(page: Page) {
  await page.waitForLoadState('networkidle')
  await page.waitForFunction(
    "document.getAnimations().every((a) => !(a.timeline instanceof DocumentTimeline) || a.effect?.getTiming().iterations === Infinity || a.playState !== 'running')",
  )
}

// A string: it runs in the page, and this file is typed without the DOM.
const FOCUS_INFO = `(() => {
  const el = document.activeElement
  if (!el || el === document.body) return { body: true }
  const s = getComputedStyle(el)
  const box = el.closest('li, label, [role=group]')
  const sb = box ? getComputedStyle(box) : null
  const ring = (st) => st && st.outlineStyle !== 'none' && parseFloat(st.outlineWidth) > 0
  return {
    body: false,
    id: el.tagName.toLowerCase() + (el.getAttribute('aria-label') ? '[' + el.getAttribute('aria-label') + ']' : '') + ':' + (el.textContent || '').trim().slice(0, 30),
    visible: ring(s) || (s.boxShadow && s.boxShadow !== 'none') || ring(sb) || (sb && sb.boxShadow !== 'none'),
  }
})()`

for (const path of SCREENS) {
  test(`keyboard: ${path} has no trap and every stop shows a focus ring`, async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto(path)
    await settle(page)
    const seen = new Set<string>()
    const hidden: string[] = []
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Tab')
      const info = (await page.evaluate(FOCUS_INFO)) as { body: boolean; id?: string; visible?: boolean }
      // Focus leaving the page into the browser's own toolbar is a way out
      if (info.body) break
      seen.add(info.id!)
      if (!info.visible) hidden.push(info.id!)
    }
    expect(seen.size, 'Tab reached some controls').toBeGreaterThan(3)
    expect(hidden, 'stops without a visible focus ring').toEqual([])
    // Shift+Tab goes back too: the keyboard is not stuck on one control
    const before = (await page.evaluate(FOCUS_INFO)) as { id?: string }
    await page.keyboard.press('Shift+Tab')
    const after = (await page.evaluate(FOCUS_INFO)) as { id?: string }
    expect(after.id).not.toBe(before.id)
  })
}

for (const [label, width] of [['200 percent zoom on a laptop', 640], ['a 320 px phone', 320]] as const) {
  test(`reflow: no sideways scroll at ${label}`, async ({ page }) => {
    test.setTimeout(60_000)
    await page.setViewportSize({ width, height: 800 })
    const wide: string[] = []
    for (const path of SCREENS) {
      await page.goto(path)
      await settle(page)
      const scrollWidth = await page.evaluate('document.documentElement.scrollWidth')
      if ((scrollWidth as number) > width + 1) wide.push(`${path}: ${scrollWidth}px`)
    }
    expect(wide, 'screens wider than the window').toEqual([])
  })
}

test('forced colors: the main screens keep their text and controls', async ({ page }) => {
  test.setTimeout(60_000)
  await page.emulateMedia({ forcedColors: 'active' })
  const places = await (await page.request.get(`${API}/institutions/demo/places`)).json()
  for (const path of ['/demo', `/demo/spaces/${places[0].id}`, '/login']) {
    await page.goto(path)
    await settle(page)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    // Every button and link still has a name, and none collapsed to nothing
    const empty = await page.evaluate(
      `[...document.querySelectorAll('button, a[href]')].filter((el) => el.getBoundingClientRect().width > 0 && !(el.getAttribute('aria-label') || el.textContent || '').trim()).length`,
    )
    expect(empty, `${path}: controls without a name`).toBe(0)
  }
})
