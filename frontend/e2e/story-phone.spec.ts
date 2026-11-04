// The story on a phone (home page): each move is long enough for a fast flick not to
// jump past it (found from an Android report, 4 Nov: "jumps two at once, a half move"), and a
// swipe that ends with a photo half risen finishes the move instead of resting halfway.
import { expect, test, type Page } from '@playwright/test'
import { TALL_GEOMETRY, transitionWindows } from '../src/features/story/storyGeometry.js'

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

const windows = transitionWindows(TALL_GEOMETRY, 4)

// The story's progress as the page computes it: from the section's top to its end less one screen.
const geometry = (page: Page) =>
  page.evaluate(() => {
    const section = document.querySelector('section[aria-label^="סיפור"]') as HTMLElement
    const top = section.getBoundingClientRect().top + window.scrollY
    return { top, total: section.offsetHeight - window.innerHeight }
  })
const progress = (page: Page) =>
  page.evaluate(() => {
    const section = document.querySelector('section[aria-label^="סיפור"]') as HTMLElement
    const top = section.getBoundingClientRect().top + window.scrollY
    return (window.scrollY - top) / (section.offsetHeight - window.innerHeight)
  })

async function swipeUp(page: Page, distance: number) {
  const cdp = await page.context().newCDPSession(page)
  const steps = Math.max(4, Math.round(distance / 10))
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 760 }] })
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200, y: 760 - (distance * i) / steps }] })
    await page.waitForTimeout(8)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

test.beforeEach(async ({ page }) => {
  await page.goto('/demo')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.waitForTimeout(500)
})

test('a photo takes about half a screen of scrolling to rise over the one before it', async ({ page }) => {
  const { top, total } = await geometry(page)
  const first = page.locator('[data-kind="open_area"]')
  let moving = 0
  const [from] = windows[1]
  for (let y = top + (from - 0.02) * total; y < top + (from + 0.2) * total; y += 10) {
    await page.evaluate((to) => window.scrollTo(0, to), y)
    const ty = await first.evaluate((el) => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(el).transform)
      return { ty: matrix.f, height: el.getBoundingClientRect().height }
    })
    if (ty.ty > 1 && ty.ty < ty.height - 1) moving += 10
  }
  const screen = 844
  expect(moving).toBeGreaterThanOrEqual(0.45 * screen) // it was about a quarter of a screen
})

test('a swipe that ends with a photo half risen finishes the move, and does not rest halfway', async ({ page }) => {
  const { top, total } = await geometry(page)
  const [from, to] = windows[2]
  const halfway = from + (to - from) * 0.55
  await swipeUp(page, Math.round(top + halfway * total))
  await expect
    .poll(async () => {
      const at = await progress(page)
      return windows.some(([a, b]: [number, number]) => at > a + 0.004 && at < b - 0.004)
    }, { timeout: 5000 })
    .toBe(false)
  expect(await progress(page)).toBeGreaterThan(from - 0.005) // it went on forward: past the middle
})

test('a scroll made by the page itself is left where it is', async ({ page }) => {
  const { top, total } = await geometry(page)
  const [from, to] = windows[2]
  const halfway = from + (to - from) * 0.5
  await page.evaluate((y) => window.scrollTo(0, y), top + halfway * total)
  await page.waitForTimeout(900)
  expect(Math.abs((await progress(page)) - halfway)).toBeLessThan(0.002)
})

test('below the story, a swipe goes as far as the finger, and nothing finishes it', async ({ page }) => {
  await page.goto('/demo#finder')
  await expect(page.getByRole('searchbox', { name: 'חיפוש מקום' })).toBeVisible()
  await page.waitForTimeout(800)
  const before = await page.evaluate(() => window.scrollY)
  await swipeUp(page, 150)
  await page.waitForTimeout(900)
  const moved = (await page.evaluate(() => window.scrollY)) - before
  expect(Math.abs(moved - 150)).toBeLessThan(25) // the finger's own slop, not a move of the page's own
})
