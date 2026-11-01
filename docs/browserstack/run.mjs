// Runs read-only checks on the live demo site in real browsers on BrowserStack
// (wave 16.7). Needs BROWSERSTACK_USERNAME and BROWSERSTACK_ACCESS_KEY in the
// environment: they are read here and never printed or written anywhere.
//
// Run from the repository root:
//   NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node docs/browserstack/run.mjs [only]
// "only" is a part of a browser's label (for example "chrome"), to run one.
// Screenshots go to $SHOTS_DIR (default: ./browserstack-shots, not committed).
//
// Only reads pages. It never signs in and never books, because the demo
// campus's data is shared by everyone.

import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'

const require = createRequire(new URL('../../frontend/package.json', import.meta.url))
const { chromium } = require('playwright-core')

const user = process.env.BROWSERSTACK_USERNAME
const key = process.env.BROWSERSTACK_ACCESS_KEY
if (!user || !key) {
  console.error('BROWSERSTACK_USERNAME and BROWSERSTACK_ACCESS_KEY must be set.')
  process.exit(2)
}

const SITE = process.env.SITE_URL ?? 'https://getstudyspot.me'
const SHOTS = process.env.SHOTS_DIR ?? './browserstack-shots'
mkdirSync(SHOTS, { recursive: true })

// Real browsers on desktop. Real phones and tablets go through BrowserStack's
// SDK instead (docs/browserstack/CHECKS.md). "playwright-webkit" is Safari's
// engine, not Safari itself.
const MATRIX = [
  { label: 'chrome-win11', browser: 'chrome', os: 'Windows', os_version: '11', browser_version: 'latest' },
  { label: 'edge-win11', browser: 'edge', os: 'Windows', os_version: '11', browser_version: 'latest' },
  { label: 'webkit-sonoma', browser: 'playwright-webkit', os: 'osx', os_version: 'sonoma', browser_version: 'latest' },
  { label: 'firefox-win11', browser: 'playwright-firefox', os: 'Windows', os_version: '11', browser_version: 'latest' },
]

const only = process.argv[2]

function endpoint(entry, name) {
  const caps = {
    browser: entry.browser,
    browser_version: entry.browser_version,
    os: entry.os,
    os_version: entry.os_version,
    name,
    build: `studyspot-16.7-${new Date().toISOString().slice(0, 10)}`,
    'browserstack.username': user,
    'browserstack.accessKey': key,
    'browserstack.console': 'errors',
  }
  return `wss://cdp.browserstack.com/playwright?caps=${encodeURIComponent(JSON.stringify(caps))}`
}

async function check(page, label, errors) {
  const results = []
  const ok = (name, pass, detail = '') => results.push({ name, pass, detail })

  await page.goto(`${SITE}/demo`, { waitUntil: 'networkidle', timeout: 60_000 })
  ok('title says StudySpot', /StudySpot|סטאדי/i.test(await page.title()), await page.title())
  ok('page is right to left', (await page.evaluate(() => getComputedStyle(document.documentElement).direction)) === 'rtl')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  ok('nothing sticks out sideways', overflow <= 1, `${overflow}px`)

  // The header must not jump while the numbers load (wave 16.3 fix).
  const heights = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const header = document.querySelector('header')
        const seen = new Set()
        const t0 = performance.now()
        const tick = () => {
          if (header) seen.add(Math.round(header.getBoundingClientRect().height))
          if (performance.now() - t0 < 1500) requestAnimationFrame(tick)
          else resolve([...seen])
        }
        tick()
      }),
  )
  ok('header height is steady', heights.length <= 1, heights.join(','))

  await page.screenshot({ path: `${SHOTS}/${label}-home.png` })

  const placeLink = page.locator('a[href*="/spaces/"]').first()
  if (await placeLink.count()) {
    await placeLink.click()
    await page.waitForLoadState('networkidle')
    ok('a place page opens', /\/spaces\/\d+/.test(page.url()), new URL(page.url()).pathname)
    // The week's day buttons sit in the forecast card, which draws after the page loads.
    const days = page.getByRole('group', { name: 'יום בשבוע' }).getByRole('button')
    await days.first().waitFor({ timeout: 10_000 }).catch(() => {})
    const dayCount = await days.count()
    ok('day buttons are there', dayCount >= 5, `${dayCount}`)
    if (dayCount) {
      const box = await days.first().boundingBox()
      ok('a day button is big enough to tap', !!box && box.width >= 24 && box.height >= 24, box ? `${Math.round(box.width)}x${Math.round(box.height)}` : 'none')
    }
    await page.screenshot({ path: `${SHOTS}/${label}-place.png` })
  } else {
    ok('a place link exists on the home page', false)
  }

  await page.goto(`${SITE}/login`, { waitUntil: 'networkidle', timeout: 60_000 })
  const buttons = await page.getByRole('button').count()
  ok('the sign-in page has buttons', buttons > 0, `${buttons}`)
  await page.screenshot({ path: `${SHOTS}/${label}-login.png` })

  ok('no errors in the console', errors.length === 0, errors.slice(0, 3).join(' | '))
  return results
}

const summary = []
for (const entry of MATRIX.filter((e) => !only || e.label.includes(only))) {
  const started = Date.now()
  let browser
  let results = []
  let failure = null
  try {
    browser = await chromium.connect(endpoint(entry, entry.label), { timeout: 120_000 })
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    // A visitor who is not signed in gets 401 from the token refresh, by design.
    page.on('console', (m) => m.type() === 'error' && !/status of 401/.test(m.text()) && errors.push(m.text()))
    results = await check(page, entry.label, errors)
    const passed = results.every((r) => r.pass)
    await page
      .evaluate(
        `browserstack_executor: ${JSON.stringify({ action: 'setSessionStatus', arguments: { status: passed ? 'passed' : 'failed', reason: passed ? 'all checks passed' : 'a check failed' } })}`,
      )
      .catch(() => {})
  } catch (error) {
    failure = String(error.message ?? error).split('\n')[0].replace(key, '***')
  } finally {
    await browser?.close().catch(() => {})
  }
  summary.push({ entry, results, failure, seconds: Math.round((Date.now() - started) / 1000) })
  console.log(`\n## ${entry.label}  (${Math.round((Date.now() - started) / 1000)}s)`)
  if (failure) console.log(`  could not run: ${failure}`)
  for (const r of results) console.log(`  ${r.pass ? 'ok  ' : 'FAIL'} ${r.name}${r.detail ? `  [${r.detail}]` : ''}`)
}

const failed = summary.filter((s) => s.failure || s.results.some((r) => !r.pass))
console.log(`\n${summary.length - failed.length} of ${summary.length} browsers fully passed.`)
process.exit(failed.length ? 1 : 0)
