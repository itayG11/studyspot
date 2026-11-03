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
