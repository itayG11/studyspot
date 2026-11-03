// The finder on a phone: what was typed or chosen has its answer in view, the map and the
// list do not overlap. (The phone's keyboard is not simulated here: the position without it.)
import { expect, test, type Page } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

// Where the results start, and where the sticky search (under the header) ends.
async function resultsInView(page: Page) {
  return page.evaluate(() => {
    const results = document.getElementById('finder-results')!.getBoundingClientRect()
    // The sticky bar is the box around the search field and the chips.
    const bar = document.querySelector('input[type="search"]')!.parentElement!.parentElement!
    const barBottom = bar.getBoundingClientRect().bottom
    return { top: results.top, barBottom, view: window.innerHeight }
  })
}

test('typing a search brings its answer into view, without scrolling by hand', async ({ page }) => {
  await page.goto('/demo#finder')
  const search = page.getByRole('searchbox', { name: 'חיפוש מקום' })
  await search.click()
  await search.fill('שקט')
  await expect
    .poll(async () => {
      const at = await resultsInView(page)
      return at.top >= at.barBottom - 1 && at.top < at.view - 120
    })
    .toBe(true)
  await page.screenshot({ path: 'test-results/phone-search-typed.png' })
})

test('the keyboard\'s search key closes the keyboard and goes to the results', async ({ page }) => {
  await page.goto('/demo#finder')
  const search = page.getByRole('searchbox', { name: 'חיפוש מקום' })
  await search.click()
  await search.fill('M')
  await search.press('Enter')
  await expect(search).not.toBeFocused()
  await expect
    .poll(async () => {
      const at = await resultsInView(page)
      return at.top < at.view - 120
    })
    .toBe(true)
})

test('the expanded filters end with "show", which closes the panel and shows the results', async ({ page }) => {
  await page.goto('/demo#finder')
  await page.getByRole('button', { name: 'סינון מורחב' }).click()
  const panel = page.getByRole('group', { name: 'סינון מורחב' })
  await panel.getByRole('button', { name: 'שקעים' }).click()
  const show = panel.getByRole('button', { name: /^הצג/ })
  await show.click()
  await expect(page.getByRole('button', { name: 'סינון מורחב' })).toHaveAttribute('aria-expanded', 'false')
  await expect
    .poll(async () => {
      const at = await resultsInView(page)
      return at.top >= at.barBottom - 1 && at.top < at.view - 120
    })
    .toBe(true)
  await page.screenshot({ path: 'test-results/phone-filters-shown.png' })
})

test('on the map, the list stays under the map and does not rise over it', async ({ page }) => {
  await page.goto('/demo?view=map#finder')
  const map = page.locator('#finder-map')
  await expect(map).toBeVisible()
  const list = map.locator('xpath=../ul')
  await expect(list).toBeVisible()
  const [mapBox, listBox] = [await map.boundingBox(), await list.boundingBox()]
  expect(listBox!.y).toBeGreaterThanOrEqual(mapBox!.y + mapBox!.height - 1)
  await page.screenshot({ path: 'test-results/phone-map-list.png' })
})
