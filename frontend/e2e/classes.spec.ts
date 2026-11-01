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
  await expect(page.getByRole('button', { name: 'התנתקות' })).toBeVisible() // signed in; not the name, which the login button contains too
  await page.getByRole('link', { name: 'האזור שלי' }).click()

  const week = page.getByRole('region', { name: 'מערכת השעות' })
  // Three classes on Sunday, and the breaks between them on the grid.
  await expect(week.getByRole('list', { name: 'יום ראשון' }).getByRole('button', { name: /^(?!הפסקה)/ })).toHaveCount(3)
  await expect(week.getByText(/לדוגמה, ומשותפת לכל המבקרים/)).toBeVisible()

  await week.getByLabel('יום', { exact: true }).selectOption({ label: 'יום חמישי' })
  await week.getByLabel('מתחיל').fill('16:00')
  await week.getByLabel('נגמר').fill('17:00')
  await week.getByLabel('בניין', { exact: true }).selectOption('M')
  // The demo student is shared: a new course name is not kept, the sample's are.
  await week.getByLabel(/שם הקורס/).fill('מבני נתונים')
  await week.getByRole('button', { name: 'הוספת שיעור' }).click()
  const added = week.getByRole('button', { name: 'מבני נתונים 16:00–17:00 M, יום חמישי' })
  await expect(added).toBeVisible()
  await added.click()
  const details = week.getByRole('region', { name: 'פרטי השיעור' })
  await details.getByRole('button', { name: 'הסרה' }).click()
  await details.getByRole('button', { name: 'כן, להסיר' }).click()
  await expect(added).toHaveCount(0)

  // From the college's file: previewed, then added; nothing kept before.
  const file = resolve(import.meta.dirname, '../test-results/yedion.xlsx')
  execFileSync(process.env.PYTHON ?? 'python', [`${import.meta.dirname}/make_yedion.py`, file], { cwd: backend })
  await week.getByLabel('העלאת קובץ').setInputFiles(file)
  await expect(week.getByRole('checkbox', { name: /יסודות המחשוב, תרגיל/ })).toBeChecked()
  await week.getByRole('button', { name: 'להוסיף שיעור אחד' }).click()
  await expect(week.getByText(/נוסף שיעור אחד מתוך 1/)).toBeVisible()
  // The shared demo student keeps only the sample's course names: "שיעור" here.
  const imported = week.getByRole('button', { name: /17:00–18:30.*יום חמישי/ })
  await expect(imported).toBeVisible()

  // A break on any day answers with its own places (another day: by the forecast).
  // Another day than today: its break is never over yet.
  const today = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'Asia/Jerusalem' }).format(new Date())
  const other = today === 'Wednesday' ? 'יום שני' : 'יום רביעי'
  await week.getByRole('list', { name: other }).getByRole('button', { name: /^הפסקה/ }).click()
  const gap = week.getByRole('region', { name: 'פרטי ההפסקה' })
  await expect(gap.getByText('טוען הצעות…')).toHaveCount(0)
  await expect(gap.getByText(/לא הצלחנו/)).toHaveCount(0)
  await expect(gap.getByRole('link').first()).toBeVisible()

  // What it says depends on the day and the hour; that it answers does not.
  await expect(page.getByRole('region', { name: 'בין שיעורים היום' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'בין שיעורים היום' }).getByRole('alert')).toHaveCount(0)
})
