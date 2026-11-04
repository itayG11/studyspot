// The phone's tab bar: "map" leads to the map itself, not only to the top of the search,
// where the map is still far below (the search, the filters and today's load come first).
import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

const tabBar = (page: import('@playwright/test').Page) => page.getByRole('navigation', { name: 'ניווט מהיר' })

// The map is really seen: whole on the screen, and not under the sticky search bar
// (what stands at the map's middle point is the map itself).
async function expectMapSeen(page: import('@playwright/test').Page) {
  const map = page.locator('.leaflet-container')
  await expect(map).toBeInViewport({ ratio: 0.95 })
  await expect
    .poll(() => page.evaluate(() => {
      const box = document.querySelector('.leaflet-container')!.getBoundingClientRect()
      return Boolean(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)?.closest('.leaflet-container'))
    }))
    .toBe(true)
}

test('on a phone, the "map" tab brings the map into view, from the front page', async ({ page }) => {
  await page.goto('/demo')
  await tabBar(page).getByRole('link', { name: 'מפה' }).click()
  await expect(page).toHaveURL(/view=map/)
  await expectMapSeen(page)
  await page.screenshot({ path: 'test-results/tab-map-from-home.png' })
})

test('on a phone, the "map" tab brings the map into view, from another page', async ({ page }) => {
  await page.goto('/institutions')
  await tabBar(page).getByRole('link', { name: 'מפה' }).click()
  await expect(page).toHaveURL(/view=map/)
  await expectMapSeen(page)
  await page.screenshot({ path: 'test-results/tab-map-from-other-page.png' })
})

test('the "search" tab still goes to the search, not to the map', async ({ page }) => {
  await page.goto('/demo')
  await tabBar(page).getByRole('link', { name: 'חיפוש' }).click()
  await expect(page.getByRole('heading', { name: 'איפה תלמד היום?' })).toBeInViewport()
})

test('on a phone, the header drops the two links the tab bar repeats, and is not three rows', async ({ page }) => {
  await page.goto('/demo')
  const nav = page.getByRole('navigation', { name: 'ניווט ראשי' })
  await expect(nav.getByRole('link', { name: 'חיפוש מקום' })).toBeHidden()
  await expect(nav.getByRole('link', { name: 'כל המוסדות' })).toBeHidden()
  const height = await page.locator('header').first().evaluate((el) => el.getBoundingClientRect().height)
  expect(height).toBeLessThan(110) // was 135 with the third row
  await expect(tabBar(page).getByRole('link', { name: 'חיפוש' })).toBeVisible()
})

test('on a page without the bar, the header keeps its links', async ({ page }) => {
  await page.goto('/login')
  const nav = page.getByRole('navigation', { name: 'ניווט ראשי' })
  await expect(nav.getByRole('link', { name: 'חיפוש מקום' })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'כל המוסדות' })).toBeVisible()
})

test('on a computer, the header keeps its links', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  await page.goto('http://localhost:5174/demo')
  const nav = page.getByRole('navigation', { name: 'ניווט ראשי' })
  await expect(nav.getByRole('link', { name: 'חיפוש מקום' })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'כל המוסדות' })).toBeVisible()
  await context.close()
})

test('on a phone, a signed-in student keeps "all institutions" in the header: the bar has no tab for it', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: 'כניסה כסטודנט לדוגמה' }).click()
  await expect(page.getByRole('button', { name: 'התנתקות' })).toBeVisible()
  await page.goto('/demo')
  const nav = page.getByRole('navigation', { name: 'ניווט ראשי' })
  await expect(tabBar(page).getByRole('link', { name: 'מוסדות' })).toHaveCount(0)
  await expect(nav.getByRole('link', { name: 'כל המוסדות' })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'חיפוש מקום' })).toBeHidden()
})

// Found as the "search" tab test failing one run in ten: a scroll made while the page is
// frozen by the tab's view transition is dropped, and the page stayed at the top. Here the
// first scroll to the search is swallowed on purpose (what the frozen page does); the page
// must still end at the search.
test('on a phone, the "search" tab reaches the search even when the first scroll is lost', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Element.prototype.scrollIntoView
    let lost = false
    Element.prototype.scrollIntoView = function (...args: []) {
      if (!lost && (this as HTMLElement).id === 'finder') {
        lost = true
        return
      }
      return original.apply(this, args)
    }
  })
  await page.goto('/demo')
  await tabBar(page).getByRole('link', { name: 'חיפוש' }).click()
  await expect(page.getByRole('heading', { name: 'איפה תלמד היום?' })).toBeInViewport()
})
