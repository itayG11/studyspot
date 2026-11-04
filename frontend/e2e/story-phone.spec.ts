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

// The last 220px of the way by a real swipe of the finger, ending still (no flick, so no
// momentum). The way up to there is made by the page (a scroll the story leaves alone),
// because the swipe's own stops on the way would be finished by the story too.
async function dragTo(page: Page, scrollY: number) {
  const piece = 220
  await page.evaluate((y) => window.scrollTo(0, y), scrollY - piece)
  await page.waitForTimeout(700)
  const cdp = await page.context().newCDPSession(page)
  const steps = 11
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 700 }] })
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200, y: 700 - (piece * i) / steps }] })
    await page.waitForTimeout(25)
  }
  await page.waitForTimeout(150) // held still before lifting: no flick
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

for (const [where, share, ends] of [['past the middle', 0.62, 'to'], ['before the middle', 0.38, 'from']] as const) {
  test(`a swipe that ends with a photo half risen, ${where}, finishes the move the way it was going`, async ({ page }) => {
    expect(await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches)).toBe(true)
    const { top, total } = await geometry(page)
    const [from, to] = windows[2]
    await dragTo(page, Math.round(top + (from + (to - from) * share) * total))
    const wanted = ends === 'to' ? to : from
    await expect.poll(async () => Math.abs((await progress(page)) - wanted), { timeout: 6000 }).toBeLessThan(0.01)
  })
}

test('a scroll made by the page itself is left where it is', async ({ page }) => {
  const { top, total } = await geometry(page)
  const [from, to] = windows[2]
  const halfway = from + (to - from) * 0.5
  await page.evaluate((y) => window.scrollTo(0, y), top + halfway * total)
  await page.waitForTimeout(900)
  expect(Math.abs((await progress(page)) - halfway)).toBeLessThan(0.002)
})

test('a tap with no swipe leaves a half-finished photo where it is', async ({ page }) => {
  const { top, total } = await geometry(page)
  const [from, to] = windows[2]
  const halfway = from + (to - from) * 0.5
  await page.evaluate((y) => window.scrollTo(0, y), top + halfway * total)
  await page.waitForTimeout(600)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 400 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForTimeout(900)
  expect(Math.abs((await progress(page)) - halfway)).toBeLessThan(0.003)
})
