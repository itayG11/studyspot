// The site without a mouse, and for someone who asked their device for
// less motion.

import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route(/tile\.openstreetmap\.org|arcgisonline\.com/, (route) => route.abort())
})

test('the keyboard can skip the story, search and open a place', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  // The skip link comes before the long story.
  const skip = page.getByRole('link', { name: 'דלג לחיפוש' })
  for (let i = 0; i < 8 && !(await skip.evaluate((el) => el === el.ownerDocument.activeElement)); i++) await page.keyboard.press('Tab')
  await expect(skip).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('searchbox', { name: 'חיפוש מקום' })).toBeInViewport()

  // The search box, by keyboard.
  await page.getByRole('searchbox', { name: 'חיפוש מקום' }).focus()
  await page.keyboard.type('EM107')
  const card = page.getByRole('link', { name: 'EM107' })
  await expect(card).toBeVisible()
  await card.focus()
  // A visible focus ring is drawn around the whole card.
  const ring = await page.locator('li', { has: card }).evaluate((li) => li.ownerDocument.defaultView!.getComputedStyle(li).outlineStyle)
  expect(ring).toBe('solid')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'EM107' })).toBeVisible()
})

test.describe('with less motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('the story is a still page with all four kinds of place, and nothing is pinned to the screen', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('יש לך מקום בקמפוס.')
    for (const kind of ['מתחם לימוד פתוח', 'חוות מחשבים', 'חדר לימוד קבוצתי', 'ספרייה']) {
      await expect(page.getByRole('heading', { name: kind }).first()).toBeAttached()
    }
    // The still story is about as tall as its content, not 5-6 screens.
    const height = await page.locator('section[aria-label="סיפור: המקום שלך בקמפוס"]').evaluate((el) => el.getBoundingClientRect().height)
    expect(height).toBeLessThan(3 * 844)
  })
})
