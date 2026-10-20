import { isMapTile } from './tiles.ts'
import { expect, test } from '@playwright/test'

// Wave 14.2: the demo admin makes an API key in the "Connections" tab, and a
// script with only that key reads the campus's places; once revoked, it is 401.

const API = 'http://localhost:8001'

test.beforeEach(async ({ page }) => {
  await page.route(isMapTile, (route) => route.abort())
})

test('an admin makes an API key, a script reads the places with it, and revoking ends it', async ({ page, playwright }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: 'כניסה כמנהל מוסד לדוגמה' }).click()
  await page.getByRole('link', { name: 'ניהול' }).click()
  await page.getByRole('button', { name: 'חיבורים' }).click()
  const name = `e2e ${Date.now()}`
  await page.getByLabel(/למה המפתח/).fill(name)
  await page.getByRole('button', { name: 'ליצור מפתח' }).click()
  const key = (await page.getByRole('status').getByText(/^ss_live_/).textContent())!.trim()

  const script = await playwright.request.newContext() // no cookies: only the key
  const places = await script.get(`${API}/v1/places`, { headers: { Authorization: `Bearer ${key}` } })
  expect(places.status()).toBe(200)
  expect((await places.json()).length).toBeGreaterThan(0)

  const row = page.getByRole('listitem', { name: `מפתח: ${name}` })
  await row.getByRole('button', { name: 'לבטל' }).click()
  await row.getByRole('button', { name: 'כן, לבטל את המפתח' }).click()
  // Out of the active list, into the folded list of revoked keys.
  await expect(page.getByRole('list', { name: 'המפתחות' }).getByRole('listitem', { name: `מפתח: ${name}` })).toHaveCount(0)
  await expect(page.getByText(/^מפתחות שבוטלו/)).toBeVisible()
  const after = await script.get(`${API}/v1/places`, { headers: { Authorization: `Bearer ${key}` } })
  expect(after.status()).toBe(401)
})
