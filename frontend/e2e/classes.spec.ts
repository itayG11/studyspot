// A place between classes, on a real page: the demo student's sample
// week, a class added and removed, and today's suggestions section.

import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'

test('the demo student sees a sample week, adds and removes a class, and gets suggestions', async ({ page }) => {
  const backend = resolve(import.meta.dirname, '../../backend')
  execFileSync(process.env.PYTHON ?? 'python', [`${import.meta.dirname}/reset_demo.py`], {
    cwd: backend,
    env: { ...process.env, PYTHONPATH: backend },
  })
  await page.goto('/login')
  await page.getByRole('button', { name: 'כניסה כסטודנט לדוגמה' }).click()
  await expect(page.getByText('סטודנט לדוגמה')).toBeVisible()
  await page.getByRole('link', { name: 'האזור שלי' }).click()

  const week = page.getByRole('region', { name: 'מערכת השעות' })
  await expect(week.getByRole('list', { name: 'יום ראשון' }).getByRole('listitem')).toHaveCount(3)
  await expect(week.getByText(/לדוגמה, ומשותפת לכל המבקרים/)).toBeVisible()

  await week.getByLabel('יום', { exact: true }).selectOption({ label: 'יום חמישי' })
  await week.getByLabel('מתחיל').fill('16:00')
  await week.getByLabel('נגמר').fill('17:00')
  await week.getByLabel('בניין').selectOption('M')
  // The demo student is shared: a new course name is not kept, the sample's are.
  await week.getByLabel(/שם הקורס/).fill('מבני נתונים')
  await week.getByRole('button', { name: 'הוספת שיעור' }).click()
  const added = week.getByRole('list', { name: 'יום חמישי' }).getByRole('listitem').filter({ hasText: '16:00–17:00' })
  await expect(added).toHaveText(/16:00–17:00 · בניין M · מבני נתונים/)
  await added.getByRole('button', { name: 'הסרה' }).click()
  await added.getByRole('button', { name: 'כן, להסיר' }).click()
  await expect(added).toHaveCount(0)

  // What it says depends on the day and the hour; that it answers does not.
  await expect(page.getByRole('region', { name: 'בין שיעורים היום' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'בין שיעורים היום' }).getByRole('alert')).toHaveCount(0)
})
