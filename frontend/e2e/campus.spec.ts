import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  // Map tiles come from outside servers; the test does not need them.
  await page.route(/tile\.openstreetmap\.org|arcgisonline\.com/, (route) => route.abort())
})

test('a demo student finds a free station in a computer lab', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: 'כניסה כסטודנט לדוגמה' }).click()

  // The home page opens on the hero; its button leads down to the live map.
  await expect(page).toHaveURL('/')
  await expect(page.getByText('סטודנט לדוגמה')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('איפה יש מקום עכשיו?')
  await page.getByRole('button', { name: 'למפה החיה' }).click()
  const liveMap = page.getByRole('region', { name: 'מפת הקמפוס' })
  await expect(liveMap).toBeInViewport()

  // The seven Braude buildings on the board.
  const board = page.getByRole('list', { name: 'בניינים' })
  await expect(board.getByRole('button')).toHaveCount(7)
  // Five buildings have places and two do not; every one is on the map.
  await expect(liveMap.locator('.leaflet-interactive')).toHaveCount(7)

  await board.getByRole('button', { name: /בניין M/ }).click()
  await expect(page).toHaveURL('/?building=M')
  await page.getByRole('link', { name: /M206/ }).click()

  await expect(page.getByRole('heading', { name: 'M206' })).toBeVisible()
  const seats = page.getByRole('list', { name: 'תאים' }).getByRole('listitem')
  await expect(seats).toHaveCount(40) // 5 rows of 8, as in docs/CAMPUS_DATA.md

  // A reload keeps the session: the HttpOnly cookie brings a new token.
  await page.reload()
  await expect(page.getByText('סטודנט לדוגמה')).toBeVisible()

  await page.getByRole('button', { name: 'התנתקות' }).click()
  await expect(page.getByRole('link', { name: 'התחברות' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('link', { name: 'התחברות' })).toBeVisible()
})

test('the places list filters by kind', async ({ page }) => {
  await page.goto('/places')
  await page.getByRole('button', { name: 'ספרייה' }).click()
  await expect(page).toHaveURL('/places?kind=library')
  await expect(page.getByRole('link', { name: /ספרייה.*בניין EF/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /M206/ })).toHaveCount(0)
})
