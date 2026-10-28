// Takes the README's pictures from the live demo site (read only: the demo
// student signs in, nothing is booked). Run in the day, when the campus is open,
// so the "free now" numbers are not zero:
//   NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node docs/screenshots/capture.mjs
// Needs Playwright (from ../../frontend), ffmpeg and Pillow (python3).
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'

const require = createRequire(new URL('../../frontend/package.json', import.meta.url))
const { chromium } = require('playwright-core')
const SITE = process.env.SITE_URL ?? 'https://getstudyspot.me'
const OUT = new URL('.', import.meta.url).pathname
const TMP = process.env.TMP_DIR ?? '/tmp/studyspot-shots'
mkdirSync(TMP, { recursive: true })

const launch = { executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined }
const seen = { cookies: [], origins: [{ origin: SITE, localStorage: [{ name: 'studyspot:cookie-note-seen', value: '1' }] }] }
const browser = await chromium.launch(launch)

async function context(width, height, extra = {}) {
  return browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'he-IL', timezoneId: 'Asia/Jerusalem', storageState: seen, ...extra })
}
async function placeId(page, name) {
  const places = await (await page.request.get(`${SITE}/api/institutions/demo/places`)).json()
  return places.find((p) => p.name === name).id
}
async function settle(page, ms = 2500) {
  await page.waitForLoadState('networkidle')
  await page.waitForFunction("document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity)", null, { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(ms)
}
const shot = (page, name, opts = {}) => page.screenshot({ path: `${TMP}/${name}.png`, ...opts })

// Computer: the finder and the place page
{
  const ctx = await context(1280, 800)
  const page = await ctx.newPage()
  await page.goto(`${SITE}/demo#finder`)
  await settle(page, 3500)
  await shot(page, 'finder')
  const id = await placeId(page, 'M206')
  await page.goto(`${SITE}/demo/spaces/${id}`)
  await settle(page, 3000)
  await page.setViewportSize({ width: 1280, height: 1000 })
  await page.waitForTimeout(800)
  await shot(page, 'space')
  // The timetable, signed in as the demo student
  await page.goto(`${SITE}/login`)
  await page.getByRole('button', { name: 'כניסה כסטודנט לדוגמה' }).click()
  await page.getByRole('button', { name: 'התנתקות' }).waitFor()
  await page.goto(`${SITE}/me`)
  await settle(page, 3000)
  // The page's own header sticks to the top and would cut across the picture.
  await page.evaluate(() => document.querySelectorAll('header').forEach((h) => { h.style.position = 'static' })) // by script: the site's policy refuses a style tag
  const week = page.locator('#my-timetable')
  await week.scrollIntoViewIfNeeded()
  await page.waitForTimeout(800)
  // A little air around the block, so the heading is not cut at the top edge
  const box = await week.boundingBox()
  const top = await page.evaluate(() => window.scrollY)
  const pad = 28
  await page.screenshot({
    path: `${TMP}/timetable.png`,
    fullPage: true,
    clip: { x: Math.max(0, box.x - pad), y: Math.max(0, box.y + top - pad), width: box.width + 2 * pad, height: box.height + 2 * pad },
  })
  await ctx.close()
}

// Phone
{
  const ctx = await context(390, 844, { isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  await page.goto(`${SITE}/demo`)
  await settle(page, 3000)
  await shot(page, 'phone-home')
  const id = await placeId(page, 'M206')
  await page.goto(`${SITE}/demo/spaces/${id}`)
  await settle(page, 3000)
  await shot(page, 'phone-space')
  await ctx.close()
}

// The short film, as still frames (Playwright's own video recording needs an
// encoder this machine's browser build lacks): search for a lab, open its page.
const frames = []
{
  const ctx = await context(900, 562, { deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  mkdirSync(`${TMP}/frames`, { recursive: true })
  const frame = async (ms) => {
    const file = `${TMP}/frames/${String(frames.length).padStart(3, '0')}.png`
    await page.screenshot({ path: file })
    frames.push([file, ms])
  }
  await page.goto(`${SITE}/demo#finder`)
  await settle(page, 2500)
  await frame(1200)
  const search = page.getByLabel(/חיפוש|שם, בניין/).first()
  await search.click()
  for (const text of ['M', 'M2', 'M20', 'M206']) {
    await search.fill(text)
    await page.waitForTimeout(450)
    await frame(text === 'M206' ? 1400 : 380)
  }
  await page.getByRole('link', { name: /M206/ }).first().click()
  await settle(page, 1800)
  await frame(1400)
  for (const y of [140, 280, 420]) {
    await page.evaluate((top) => window.scrollTo(0, top), y)
    await page.waitForTimeout(500)
    await frame(y === 420 ? 2200 : 600)
  }
  await ctx.close()
}
await browser.close()

// Pictures: webp for the stills, gif for the film
execFileSync('python3', ['-I', '-c', `
from PIL import Image
T='${TMP}'; O='${OUT}'
def save(name, size=None):
    im=Image.open(f'{T}/{name}.png').convert('RGB')
    if size: im=im.resize(size, Image.LANCZOS)
    im.save(f'{O}/{name}.webp','WEBP',quality=82,method=6)
save('finder',(1600,1000)); save('space',(1600,1250)); save('phone-home',(780,1688)); save('phone-space',(780,1688))
im=Image.open(f'{T}/timetable.png').convert('RGB'); w=1440; im=im.resize((w,int(im.height*w/im.width)),Image.LANCZOS).crop((0,0,w,1330)); im.save(f'{O}/timetable.webp','WEBP',quality=82,method=6)
`])
execFileSync('python3', ['-I', '-c', `
from PIL import Image
frames=${JSON.stringify(frames)}
ims=[Image.open(f).convert('RGB').resize((720,450),Image.LANCZOS).quantize(colors=128,method=Image.Quantize.MEDIANCUT) for f,_ in frames]
ims[0].save('${OUT}/flow.gif',save_all=True,append_images=ims[1:],duration=[ms for _,ms in frames],loop=0,optimize=True)
`])
console.log('done')
