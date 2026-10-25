import { isMapTile } from './tiles.ts'
import { expect, test } from '@playwright/test'

// Wave 14.5: the demo admin sends a sample webhook over real HTTP to the
// built-in tester, sees its signature checked, makes the tester fail, sees
// the try again in the delivery log, and sends it again successfully.

test.beforeEach(async ({ page }) => {
  await page.route(isMapTile, (route) => route.abort())
})

test('a sample arrives signed; a failing tester shows a try again; sending again works', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: 'כניסה כמנהל מוסד לדוגמה' }).click()
  await page.getByRole('link', { name: 'ניהול' }).click()
  await page.getByRole('button', { name: 'חיבורים' }).click()
  await page.getByText('לאנשי המחשוב של המוסד: מפתחות API ו-webhooks').click() // folded by default
  const tester = page.getByRole('region', { name: 'בודק webhooks' })
  await tester.getByRole('button', { name: 'עונה 200' }).click() // shared demo: start working

  await tester.getByRole('button', { name: 'לשלוח אירוע לדוגמה' }).click()
  const latest = tester.getByRole('list', { name: 'מה התקבל' }).getByRole('listitem').first()
  await expect(latest).toContainText('checkin.started')
  await expect(latest).toContainText('החתימה תקינה ✓')
  await expect(latest).toContainText('ענה 200')

  await tester.getByRole('button', { name: 'נכשל, 503' }).click()
  await expect(tester.getByText(/הבודק עונה עכשיו 503/)).toBeVisible()
  await tester.getByRole('button', { name: 'לשלוח אירוע לדוגמה' }).click()
  await expect(latest).toContainText('ענה 503')

  // The built-in address's delivery log: waiting for its next try.
  const builtIn = page.getByRole('listitem', { name: /כתובת: .*\/v1\/webhook-tester\// })
  await builtIn.getByText('יומן משלוחים').click()
  const waiting = builtIn.getByRole('row').filter({ hasText: 'ממתין לניסיון הבא' }).first()
  await expect(waiting).toBeVisible()

  await tester.getByRole('button', { name: 'עונה 200' }).click()
  await waiting.getByRole('button', { name: 'לשלוח שוב' }).click()
  await expect(latest).toContainText('ענה 200')
})
