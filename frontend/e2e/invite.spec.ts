import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'

// An admin invite link. The way to accept one needs a real personal Google
// or Microsoft account (covered by the server's and the site's own tests);
// here, the shared demo student, whom every visitor uses, is refused.

const python = process.env.PYTHON ?? 'python'
const backend = resolve(import.meta.dirname, '../../backend')

function newInvite(): string {
  return execFileSync(python, [`${import.meta.dirname}/make_invite.py`], {
    cwd: backend,
    env: { ...process.env, PYTHONPATH: backend },
  }).toString().trim()
}

test('an invite link names the institution, keeps the token out of the address, and refuses the demo student', async ({ page }) => {
  const token = newInvite()
  await page.goto('/login')
  await page.getByRole('button', { name: 'כניסה כסטודנט לדוגמה' }).click()
  await expect(page.getByText('סטודנט לדוגמה')).toBeVisible()

  await page.goto(`/invite#t=${encodeURIComponent(token)}`)
  await expect(page.getByRole('heading', { name: 'הוזמנת לנהל את מוסד לבדיקה' })).toBeVisible()
  await expect(page).toHaveURL('/invite') // the token left the address
  await page.getByRole('button', { name: 'לקבל את ההזמנה' }).click()
  await expect(page.getByRole('alert')).toContainText('חשבון לדוגמה')
})
