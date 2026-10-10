// The load forecast on a real page: the demo campus's made-up history,
// labelled as such, day by day.

import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'

const API = 'http://localhost:8001'

test('a place shows how busy it usually is, labelled as demo data, for any day', async ({ page, request }) => {
  // The simulated history, as the live site's daily reset makes it.
  const backend = resolve(import.meta.dirname, '../../backend')
  execFileSync(process.env.PYTHON ?? 'python', [`${import.meta.dirname}/reset_demo.py`], {
    cwd: backend,
    env: { ...process.env, PYTHONPATH: backend },
  })
  const places = await (await request.get(`${API}/institutions/demo/places?building=EF`)).json()
  const library = places.find((p: { name: string }) => p.name === 'ספרייה')

  await page.goto(`/demo/spaces/${library.id}`)
  const section = page.getByRole('region', { name: 'עומס צפוי' })
  await page.getByRole('button', { name: 'יום שני' }).click()
  await expect(section.getByText(/נתוני דמו: ההיסטוריה כאן מדומה/)).toBeVisible()
  await expect(section.getByRole('list', { name: 'העומס לפי שעה' }).getByRole('listitem').first()).toHaveText(/^\d\d:00: /)
  await page.getByRole('button', { name: 'יום שבת' }).click()
  await expect(section.getByText('סגור ביום הזה.')).toBeVisible()
})
