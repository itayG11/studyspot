const { test, expect } = require('@playwright/test')
const fs = require('fs')
test('demo home, a place and sign-in, read only', async ({ page }, info) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && !/status of 401/.test(m.text()) && errors.push(m.text()))
  await page.goto('https://getstudyspot.me/demo', { waitUntil: 'networkidle' })
  const facts = await page.evaluate(() => ({
    rtl: getComputedStyle(document.documentElement).direction,
    w: innerWidth, h: innerHeight, dpr: devicePixelRatio, touch: navigator.maxTouchPoints,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ua: navigator.userAgent.slice(0, 80),
  }))
  const header = await page.evaluate(() => new Promise((r) => { const h = document.querySelector('header'); const s = new Set(); const t0 = performance.now(); const f = () => { s.add(Math.round(h.getBoundingClientRect().height)); performance.now() - t0 < 1500 ? requestAnimationFrame(f) : r([...s]) }; f() }))
  await page.screenshot({ path: `shots-${info.project.name.replace(/\W+/g, '_')}-home.png` })
  await page.locator('a[href*="/spaces/"]').first().click()
  await page.waitForLoadState('networkidle')
  const days = page.getByRole('group', { name: 'יום בשבוע' }).getByRole('button')
  await days.first().waitFor({ timeout: 15000 }).catch(() => {})
  const dayCount = await days.count()
  const box = dayCount ? await days.first().boundingBox() : null
  await page.screenshot({ path: `shots-${info.project.name.replace(/\W+/g, '_')}-place.png` })
  await page.goto('https://getstudyspot.me/login', { waitUntil: 'networkidle' })
  const buttons = await page.getByRole('button').count()
  console.log('RESULT ' + JSON.stringify({ project: info.project.name, facts, header, dayCount, dayBox: box && `${Math.round(box.width)}x${Math.round(box.height)}`, buttons, errors: errors.slice(0, 3) }))
  expect(facts.rtl).toBe('rtl'); expect(facts.overflow).toBeLessThanOrEqual(1); expect(dayCount).toBeGreaterThanOrEqual(5); expect(errors).toEqual([])
})
