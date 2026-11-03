// "Where is it": a small map of its building on every place's page, for every kind of place
// (walk-in, booked room, booked lab) and every kind of screen (phone, tablet, computer).
// Real map pictures are not fetched (tiles.ts): the map, its frame and its pin are what is checked.

import { expect, test, type Page } from '@playwright/test'
import { isMapTile } from './tiles.ts'

const API = 'http://localhost:8001'

test.beforeEach(async ({ page }) => {
  await page.route(isMapTile, (route) => route.abort())
})

async function open(page: Page, name: string) {
  const places = await (await page.request.get(`${API}/institutions/demo/places`)).json()
  const id = places.find((p: { name: string }) => p.name === name).id
  await page.goto(`/spaces/${id}`)
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
}

const box = async (page: Page, name: string, role: 'region' | 'complementary' = 'region') => (await page.getByRole(role, { name }).boundingBox())!

const SCREENS = [
  { label: 'phone', viewport: { width: 390, height: 844 }, touch: true, wide: false },
  { label: 'tablet', viewport: { width: 820, height: 1180 }, touch: true, wide: true },
  { label: 'computer', viewport: { width: 1280, height: 860 }, touch: false, wide: true },
]
// walk-in (no booking), a group room and a lab (both booked ahead)
const PLACES = [
  { name: 'ספרייה', building: 'EF', booked: false },
  { name: 'EM107', building: 'EM', booked: true },
  { name: 'M206', building: 'M', booked: true },
]

for (const screen of SCREENS) {
  test.describe(`on a ${screen.label}`, () => {
    test.use({ viewport: screen.viewport, hasTouch: screen.touch, isMobile: screen.touch })

    for (const place of PLACES) {
      test(`${place.name}: the map of building ${place.building}, in the right place and not in the way`, async ({ page }) => {
        await open(page, place.name)
        const card = page.getByRole('region', { name: 'איפה זה' })
        await expect(card).toBeVisible()
        // A real Leaflet map, with the building's pin and its code.
        const map = card.locator('.leaflet-container')
        await expect(map).toBeVisible()
        await expect(card.locator('.map-code')).toHaveText(place.building)
        const mapBox = (await map.boundingBox())!
        const cardBox = (await card.boundingBox())!
        expect(mapBox.height, 'a fixed height').toBeGreaterThanOrEqual(200)
        expect(mapBox.width, 'inside its card').toBeLessThanOrEqual(cardBox.width)
        // The page does not grow sideways.
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
        // A finger scrolls the page past the map; a mouse can drag it.
        if (screen.touch) await expect(map).not.toHaveClass(/leaflet-grab/)
        else await expect(map).toHaveClass(/leaflet-grab/)

        const facts = await box(page, 'מה יש כאן')
        if (!screen.wide) {
          // One column: straight after what is here, in the same column.
          expect(cardBox.y).toBeGreaterThanOrEqual(facts.y + facts.height - 1)
          expect(Math.abs(cardBox.x - facts.x)).toBeLessThan(2)
        } else {
          // Two columns: in the side column, beside the page and not under it.
          const beside = cardBox.x + cardBox.width <= facts.x + 1 || cardBox.x >= facts.x + facts.width - 1
          expect(beside, 'beside the page').toBe(true)
          if (place.booked) {
            // The booking stays on top; the map is under it.
            const booking = await box(page, 'הזמנה מראש', 'complementary')
            expect(cardBox.y).toBeGreaterThanOrEqual(booking.y + booking.height - 1)
          } else {
            // The walk-in steps are under the map.
            const walkIn = await box(page, 'בלי הזמנה מראש')
            expect(walkIn.y).toBeGreaterThanOrEqual(cardBox.y + cardBox.height - 1)
          }
          // Reachable: the side column scrolls inside, so the card can be brought fully into view.
          await card.scrollIntoViewIfNeeded()
          await expect(card).toBeInViewport({ ratio: 0.99 })
        }
      })
    }

    test('booking still works beside the map: a room can be booked, a lab opens its seats', async ({ page }) => {
      await open(page, 'M206')
      if (screen.wide) {
        await expect(page.getByRole('complementary', { name: 'הזמנה מראש' }).getByRole('list', { name: 'תאים' })).toBeVisible()
      } else {
        await page.getByRole('button', { name: 'בחר תא והזמן' }).click()
        await expect(page.getByRole('dialog').getByRole('list', { name: 'תאים' })).toBeVisible()
      }
      await open(page, 'EM107')
      if (screen.wide) await expect(page.getByRole('complementary', { name: 'הזמנה מראש' })).toBeVisible()
      else await expect(page.getByRole('button', { name: 'להזמין' })).toBeVisible()
    })

    test('the link leads to the campus map', async ({ page }) => {
      await open(page, 'ספרייה')
      await page.getByRole('link', { name: 'לכל המקומות במפת הקמפוס' }).click()
      await expect(page).toHaveURL(/\/demo\?view=map/)
      await expect(page.locator('.leaflet-container')).toBeVisible()
    })
  })
}
