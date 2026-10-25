// Every page of the site, as each kind of visitor, on a computer, a tablet
// and a phone (playwright.edge.config.ts): the production build with its
// real headers. On each page:
// - no error in the page's console and no uncaught exception;
// - no answer of 500 or more from the API;
// - nothing wider than the screen (no sideways scrolling);
// - every button and link big enough to tap on a touch screen (24px,
//   WCAG 2.2's "target size, minimum");
// - no serious or critical problem that axe finds automatically;
// - a full-page screenshot, in test-results/sweep/<device>/.
//
// The system admin's page is not here: the demo has no system admin to sign
// in as. Its parts are covered by unit tests (src/system/SystemPage.test.tsx).

/// <reference lib="dom" />

import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { isMapTile } from './tiles.ts'

const SITE = 'http://localhost:8002'
const API = `${SITE}/api`

interface Problems {
  console: string[]
  server: string[]
}

function watch(page: Page): Problems {
  const problems: Problems = { console: [], server: [] }
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    // A refused request is reported by the browser too; the server check below covers it.
    if (/Failed to load resource/.test(text)) return
    problems.console.push(text.slice(0, 200))
  })
  page.on('pageerror', (error) => problems.console.push(`uncaught: ${error.message.slice(0, 200)}`))
  page.on('response', (response) => {
    if (response.url().startsWith(API) && response.status() >= 500) problems.server.push(`${response.status()} ${response.url()}`)
  })
  return problems
}

async function settle(page: Page) {
  await page.waitForLoadState('networkidle').catch(() => null)
  // Wait for the entrance animations (see e2e/a11y.spec.ts): text still fading in measures as faint.
  await page
    .waitForFunction(
      "document.getAnimations().every((a) => !(a.timeline instanceof DocumentTimeline) || a.effect?.getTiming().iterations === Infinity || a.playState !== 'running')",
      undefined,
      { timeout: 5_000 },
    )
    .catch(() => null)
}

// What is wider than the screen, and what is too small to tap.
async function layout(page: Page, touch: boolean) {
  return page.evaluate((touch) => {
    const width = document.documentElement.clientWidth
    const sideways = document.documentElement.scrollWidth > width + 1
    const wide: string[] = []
    const small: string[] = []
    const name = (el: Element) =>
      `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}"`
    for (const el of document.querySelectorAll('body *')) {
      const style = getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden') continue
      const box = el.getBoundingClientRect()
      if (box.width === 0 || box.height === 0) continue
      // Inside something that scrolls sideways on purpose (a row of chips, a code block): fine.
      let inScroller = false
      for (let p = el.parentElement; p; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX
        if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') {
          inScroller = true
          break
        }
      }
      if (!inScroller && (box.right > width + 1 || box.left < -1)) wide.push(name(el))
      if (touch && el.matches('a[href], button, [role="button"], input:not([type="hidden"]), select, summary')) {
        // Exempt, as in WCAG 2.5.8: a link inside a sentence. Not the real
        // target: a field hidden behind its label (the label is tapped, as
        // with a file picker), and a link whose ::after covers a whole card.
        const inline = el.tagName === 'A' && style.display === 'inline'
        const hidden = el.classList.contains('visually-hidden') && el.closest('label') !== null
        const card = getComputedStyle(el, '::after').position === 'absolute'
        if (!inline && !hidden && !card && (box.width < 24 || box.height < 24)) {
          small.push(`${name(el)} ${Math.round(box.width)}x${Math.round(box.height)}`)
        }
      }
    }
    return { sideways, wide: [...new Set(wide)].slice(0, 8), small: [...new Set(small)].slice(0, 8) }
  }, touch)
}

async function axe(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  return result.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`)
}

async function visit(page: Page, path: string, label: string, device: string, touch: boolean) {
  const problems = watch(page)
  await page.goto(path)
  await settle(page)
  await page.screenshot({ path: `test-results/sweep/${device}/${label}.png`, fullPage: true })
  const shape = await layout(page, touch)
  const found = {
    console: problems.console,
    server: problems.server,
    sideways: shape.sideways ? shape.wide : [],
    small: shape.small,
    axe: await axe(page),
  }
  expect.soft(found, `${label} on ${device}`).toEqual({ console: [], server: [], sideways: [], small: [], axe: [] })
}

async function signIn(page: Page, persona: 'student' | 'admin') {
  await page.goto('/login')
  await page.getByRole('button', { name: persona === 'student' ? 'כניסה כסטודנט לדוגמה' : 'כניסה כמנהל מוסד לדוגמה' }).click()
  await expect(page.getByRole('button', { name: 'התנתקות' }).first()).toBeVisible()
}

async function placeIds(page: Page) {
  const places: { id: number; kind: string }[] = await (await page.request.get(`${API}/institutions/demo/places`)).json()
  const first = (kind: string) => places.find((p) => p.kind === kind)!.id
  return { area: first('open_area'), room: first('group_room'), lab: first('computer_lab') }
}

test.beforeEach(async ({ page }) => {
  await page.route(isMapTile, (route) => route.abort())
})

test('every page, as a guest', async ({ page }, info) => {
  test.setTimeout(180_000)
  const device = info.project.name
  const touch = device !== 'computer'
  const ids = await placeIds(page)
  const pages: [string, string][] = [
    ['/demo', 'guest-home'],
    [`/demo/spaces/${ids.area}`, 'guest-place-area'],
    [`/demo/spaces/${ids.room}`, 'guest-place-room'],
    [`/demo/spaces/${ids.lab}`, 'guest-place-lab'],
    ['/login', 'guest-login'],
    ['/institutions', 'guest-institutions'],
    ['/developers', 'guest-developers'],
    ['/terms', 'guest-terms'],
    ['/privacy', 'guest-privacy'],
    ['/accessibility', 'guest-accessibility'],
    ['/licenses', 'guest-licenses'],
    ['/s/not-a-real-link', 'guest-share-bad'],
    ['/invite', 'guest-invite-no-token'],
    ['/demo/no-such-page', 'guest-not-found'],
  ]
  for (const [path, label] of pages) await visit(page, path, label, device, touch)
})

test('every page, as a student', async ({ page }, info) => {
  test.setTimeout(180_000)
  const device = info.project.name
  const touch = device !== 'computer'
  const ids = await placeIds(page)
  await signIn(page, 'student')
  const pages: [string, string][] = [
    ['/demo', 'student-home'],
    ['/me', 'student-me'],
    ['/scan', 'student-scan'],
    [`/demo/spaces/${ids.room}`, 'student-place-room'],
    [`/demo/spaces/${ids.lab}`, 'student-place-lab'],
    ['/institutions', 'student-institutions'],
  ]
  for (const [path, label] of pages) await visit(page, path, label, device, touch)
})

test('every tab of the admin page', async ({ page }, info) => {
  test.setTimeout(180_000)
  const device = info.project.name
  const touch = device !== 'computer'
  await signIn(page, 'admin')
  for (const tab of ['setup', 'signs', 'placing', 'adding', 'connections']) {
    await visit(page, `/demo/admin?tab=${tab}`, `admin-${tab}`, device, touch)
  }
})
