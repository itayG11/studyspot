import { expect, test } from '@playwright/test'

// Wave 14.4: another site embeds the occupancy widget in a frame, and sees
// the places; the rest of StudySpot still refuses to be framed.

const SITE = 'http://localhost:5174'

test('a page of another site shows the widget in a frame', async ({ page }) => {
  // A page standing for the institution's own site, with the widget in a
  // frame. On the test server's own address: the test browser aborts a frame
  // between two local origins, and about:blank is no http(s) page, which
  // "frame-ancestors *" does not match. That any site may frame the widget,
  // and no other page, is the second test here and backend/tests/test_site.py.
  await page.route(`${SITE}/college`, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><title>College</title><iframe title="StudySpot" src="${SITE}/embed/demo?building=L" width="360" height="420"></iframe>`,
    }),
  )
  await page.goto('/college', { waitUntil: 'commit' })
  const widget = page.frameLocator('iframe[title="StudySpot"]')
  // The first load compiles the widget on the dev server: a longer wait.
  await expect(widget.locator('.total')).toHaveText(/מקומות פנויים עכשיו|הכול סגור עכשיו/, { timeout: 20_000 })
  await expect(widget.getByRole('list', { name: 'המקומות' }).getByRole('listitem').first()).toBeVisible()
  await expect(widget.getByRole('link', { name: 'לכל המקומות ב-StudySpot' })).toHaveAttribute('target', '_blank')
})

test('only the widget may be framed', async ({ request }) => {
  const widget = await request.get(`${SITE}/embed/demo`)
  expect(widget.headers()['x-frame-options']).toBeUndefined()
  expect(widget.headers()['content-security-policy']).toContain('frame-ancestors *')
  const home = await request.get(`${SITE}/demo`)
  expect(home.headers()['x-frame-options']).toBe('DENY')
})
