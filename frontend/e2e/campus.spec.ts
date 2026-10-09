import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  // Map tiles come from outside servers; the test does not need them.
  await page.route(/tile\.openstreetmap\.org|arcgisonline\.com/, (route) => route.abort())
})

test('a demo student finds a computer lab through the story and the search', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: 'כניסה כסטודנט לדוגמה' }).click()

  // The home page opens on the story; its button leads down to the finder.
  await expect(page).toHaveURL('/demo') // the visitor's institution, at its own address
  await expect(page.getByText('סטודנט לדוגמה')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('יש לך מקום בקמפוס.')
  await page.getByRole('button', { name: 'לחיפוש מקום' }).click()
  const search = page.getByRole('searchbox', { name: 'חיפוש מקום' })
  await expect(search).toBeInViewport()

  // Ten Braude places, then one after searching.
  await expect(page.getByText('10 מקומות')).toBeVisible()
  // Fast typing keeps every letter (the box must not wait for the address).
  await search.pressSequentially('מחשבים', { delay: 15 })
  await expect(search).toHaveValue('מחשבים')
  await expect(page.getByText('4 מקומות')).toBeVisible()
  await search.fill('m206')
  await expect(page.getByText('מקום אחד')).toBeVisible()
  await expect(page).toHaveURL('/demo?q=m206')
  await page.getByRole('link', { name: 'M206' }).click()

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

test('an old places link opens the finder with its filter', async ({ page }) => {
  await page.goto('/places?kind=library')
  await expect(page).toHaveURL('/demo?kind=library#finder')
  await expect(page.getByRole('button', { name: 'ספרייה' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('link', { name: 'ספרייה' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'M206' })).toHaveCount(0)
  // The shared link skips the story and lands on the results.
  await expect(page.getByRole('searchbox', { name: 'חיפוש מקום' })).toBeInViewport()
})

test('an old place link, from before every institution had its own address, opens the place at its institution', async ({ page }) => {
  await page.goto('/places?q=M206')
  await page.getByRole('link', { name: 'M206' }).first().click()
  await expect(page).toHaveURL(/\/demo\/spaces\/\d+$/)
  const id = new URL(page.url()).pathname.split('/').pop()
  await page.goto(`/spaces/${id}`) // what a link shared before this change looks like
  await expect(page).toHaveURL(`/demo/spaces/${id}`)
  await expect(page.getByRole('heading', { name: 'M206' })).toBeVisible()
})

test('"search for a place" in the header takes you to the search, from the top of home and from another page', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  const search = page.getByRole('searchbox', { name: 'חיפוש מקום' })
  await page.getByRole('navigation', { name: 'ניווט ראשי' }).getByRole('link', { name: 'חיפוש מקום' }).click()
  await expect(search).toBeInViewport()

  await page.goto('/login')
  await page.getByRole('navigation', { name: 'ניווט ראשי' }).getByRole('link', { name: 'חיפוש מקום' }).click()
  await expect(search).toBeInViewport()
})

test('the header link keeps the browser\'s own ways: ctrl-click opens a tab, and a reload starts at the story', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  const link = page.getByRole('navigation', { name: 'ניווט ראשי' }).getByRole('link', { name: 'חיפוש מקום' })
  const [tab] = await Promise.all([page.context().waitForEvent('page'), link.click({ modifiers: ['ControlOrMeta'] })])
  await tab.close()

  await link.click()
  await expect(page.getByRole('searchbox', { name: 'חיפוש מקום' })).toBeInViewport()
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toBeInViewport()
})
