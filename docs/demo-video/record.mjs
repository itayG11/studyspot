// Usage: node record2.mjs <en|he> <outDir>   (scene windows are fixed by the narration)
import { chromium, request as pwRequest } from '/home/user/studyspot/frontend/node_modules/playwright/index.mjs'
import fs from 'node:fs'
const [lang, out] = [process.argv[2], process.argv[3]]
const SITE = 'https://getstudyspot.me'
const he = lang === 'he'
fs.mkdirSync(out, { recursive: true })
const WINDOWS = { hero: 5.6, search: 9.2, book: 5.7, mine: 5.6, extras: 5.9, admin: 7.9, outro: 4.5 }
const CAPS = {
  en: {
    hero: 'Find a free place to study on campus, right now',
    search: 'Search, or tap Quick finder: perfect between classes',
    book: 'Pick a seat, book a day and time. No double bookings',
    mine: 'My Area: bookings, reminders, calendar, a shareable link',
    extras: 'QR check-in, waiting list, live forecast',
    admin: 'For institutions: admin area, QR signs, API and webhooks',
    outro: 'Try the demo: getstudyspot.me',
  },
  he: {
    hero: 'מוצאים מקום פנוי ללמוד בקמפוס, עכשיו',
    search: 'חיפוש, או חיפוש מהיר: מושלם בין שיעורים',
    book: 'בוחרים מושב, יום ושעה. בלי הזמנות כפולות',
    mine: 'האזור שלי: הזמנות, תזכורות, יומן, קישור לשיתוף',
    extras: 'כניסה בקוד QR, רשימת המתנה, חיזוי עומס',
    admin: 'למוסדות: אזור ניהול, שלטי QR, API ו-webhooks',
    outro: 'מנסים את ההדגמה: getstudyspot.me',
  },
}[lang]

async function cleanup(request) {
  const login = await request.post(`${SITE}/api/auth/demo/login`, { data: { persona: 'student' }, headers: { Origin: SITE } })
  const headers = { Authorization: `Bearer ${(await login.json()).access_token}` }
  for (const b of await (await request.get(`${SITE}/api/me/bookings`, { headers })).json())
    if (b.status === 'booked' && b.source === 'advance') await request.post(`${SITE}/api/bookings/${b.id}/cancel`, { headers })
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', proxy: { server: process.env.HTTPS_PROXY } })
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 720 }, locale: 'he-IL', timezoneId: 'Asia/Jerusalem',
  recordVideo: { dir: out, size: { width: 1280, height: 720 } },
  storageState: { cookies: [], origins: [{ origin: SITE, localStorage: [{ name: 'studyspot:cookie-note-seen', value: '1' }] }] },
})
const api = await pwRequest.newContext({ proxy: { server: process.env.HTTPS_PROXY } })
await cleanup(api)
await ctx.addInitScript(() => {
  const add = () => {
    if (document.getElementById('__cur')) return
    const c = document.createElement('div'); c.id = '__cur'
    c.style.cssText = 'position:fixed;z-index:2147483647;width:26px;height:26px;pointer-events:none;left:-60px;top:-60px;filter:drop-shadow(1px 2px 2px rgba(0,0,0,.35))'
    c.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M5 2l14 9-6.2 1.4L16 20l-3 1.2-3.2-7.4L5 17z" fill="#111" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>'
    const bar = document.createElement('div'); bar.id = '__cap'
    bar.style.cssText = 'position:fixed;z-index:2147483646;left:50%;bottom:34px;transform:translateX(-50%);max-width:82%;padding:12px 22px;border-radius:12px;background:rgba(15,20,40,.88);color:#fff;font:600 24px/1.3 system-ui,sans-serif;text-align:center;pointer-events:none;opacity:0'
    document.documentElement.append(c, bar)
    window.addEventListener('mousemove', (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px' }, true)
    window.addEventListener('mousedown', (e) => {
      const r = document.createElement('div')
      r.style.cssText = `position:fixed;z-index:2147483645;left:${e.clientX - 18}px;top:${e.clientY - 18}px;width:36px;height:36px;border-radius:50%;border:3px solid rgba(40,110,255,.8);pointer-events:none;transition:transform .45s,opacity .45s`
      document.documentElement.append(r)
      requestAnimationFrame(() => { r.style.transform = 'scale(1.7)'; r.style.opacity = '0' })
      setTimeout(() => r.remove(), 500)
    }, true)
    window.__cap = (t, dir) => {
      bar.dir = dir; bar.textContent = t; bar.style.opacity = t ? '1' : '0'
      try { sessionStorage.setItem('__cap', JSON.stringify([t, dir])) } catch {}
    }
    try { const [t, d] = JSON.parse(sessionStorage.getItem('__cap') || 'null') || []; if (t) { bar.dir = d; bar.textContent = t; bar.style.opacity = '1' } } catch {}
  }
  document.addEventListener('DOMContentLoaded', add); if (document.readyState !== 'loading') add()
})
const page = await ctx.newPage()
const t0 = Date.now()
const scenes = []
const pause = (ms) => page.waitForTimeout(ms)
const cap = (t) => page.evaluate(([t, d]) => window.__cap && window.__cap(t, d), [t, he ? 'rtl' : 'ltr']).catch(() => {})
const goto = (path) => page.goto(`${SITE}${path}`, { waitUntil: 'networkidle' })
async function scene(name, prep, action) {
  await prep(); await cap(CAPS[name]); await pause(450) // settle; the cut starts after this
  const start = (Date.now() - t0) / 1000
  const end = start + WINDOWS[name]
  await action()
  const left = (end - (Date.now() - t0) / 1000) * 1000
  if (left > 0) await pause(left); else console.log(`scene ${name} overran by ${Math.round(-left)} ms`)
  scenes.push({ name, start, end })
  await cap('')
}
async function glide(locator, fast = false) {
  await locator.scrollIntoViewIfNeeded()
  const b = await locator.boundingBox()
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: fast ? 10 : 22 })
}
async function click(locator, fast = false) { await glide(locator, fast); await pause(fast ? 100 : 200); await locator.click() }
async function smoothScroll(px, ms) {
  const start = Date.now(); let sent = 0
  while (Date.now() - start < ms) {
    const target = Math.min(px, (px * (Date.now() - start)) / ms)
    if (target - sent >= 1) { await page.mouse.wheel(0, target - sent); sent = target }
    await pause(30)
  }
}
async function login(persona) {
  await goto('/login')
  const out = page.getByRole('button', { name: 'התנתקות' })
  if (await out.count()) { await out.click(); await pause(500); await goto('/login') }
  await page.getByRole('button', { name: persona === 'admin' ? 'כניסה כמנהל מוסד לדוגמה' : 'כניסה כסטודנט לדוגמה' }).click()
  await page.getByRole('button', { name: 'התנתקות' }).waitFor()
}

await goto('/demo'); await page.mouse.move(640, 360)

await scene('hero', async () => { await goto('/demo') }, async () => {
  await pause(900); await smoothScroll(1500, 3600)
})

await scene('search', async () => {
  await goto('/demo')
  await page.getByRole('heading', { name: 'איפה תלמד היום?' }).evaluate((e) => e.scrollIntoView({ block: 'start' }))
}, async () => {
  await click(page.getByRole('button', { name: /עם מחשבים/ })); await pause(1100)
  await click(page.getByRole('button', { name: /מהיר: איפה ללמוד עכשיו/ })); await pause(2200)
  await pause(2500)
})

await login('student')
const places = await (await api.get(`${SITE}/api/institutions/demo/places?building=M`)).json()
const lab = places.find((p) => p.name === 'M206')
let dayIdx = 1
await scene('book', async () => {
  await goto(`/places/${lab.id}`)
  const days = page.getByRole('group', { name: 'יום' }).getByRole('button')
  const starts = page.getByRole('group', { name: 'שעת התחלה' }).getByRole('button', { disabled: false })
  for (let d = 1; d < (await days.count()); d++) { await days.nth(d).click(); await pause(700); if ((await starts.count()) > 0) { dayIdx = d; break } }
  await goto(`/places/${lab.id}`)
}, async () => {
  const days = page.getByRole('group', { name: 'יום' }).getByRole('button')
  const starts = page.getByRole('group', { name: 'שעת התחלה' }).getByRole('button', { disabled: false })
  await click(page.getByRole('button', { name: /^A1:/ }), true)
  await click(days.nth(dayIdx), true); await pause(500)
  await click(starts.first(), true)
  await click(page.getByRole('button', { name: 'רבע שעה' }), true)
  await click(page.getByRole('button', { name: 'להזמין' }), true)
  await page.getByRole('status').filter({ hasText: 'ההזמנה נקלטה' }).waitFor()
})

await scene('mine', async () => { await goto('/me') }, async () => {
  const item = page.getByRole('listitem', { name: /M206, תא A1/ })
  await item.scrollIntoViewIfNeeded(); await pause(600)
  await click(item.getByRole('button', { name: 'לשתף' })); await pause(1500)
})

const library = places.length ? (await (await api.get(`${SITE}/api/institutions/demo/places`)).json()).find((p) => p.kind === 'library') : null
await scene('extras', async () => { await goto(`/demo/spaces/${library.id}`) }, async () => {
  await pause(600); await smoothScroll(900, 3600)
})

await scene('admin', async () => { await login('admin'); await goto('/demo/admin?tab=setup') }, async () => {
  await pause(1500)
  await click(page.getByText('שלטים להדפסה', { exact: true }).first()); await pause(1800)
  await click(page.getByText('חיבורים', { exact: true }).first()); await pause(1500)
})

await scene('outro', async () => { await goto('/demo'); await page.evaluate(() => window.scrollTo(0, 0)) }, async () => {
  await page.mouse.move(640, 300, { steps: 15 }); await pause(1200)
})
await cleanup(api)
fs.writeFileSync(`${out}/scenes.json`, JSON.stringify(scenes, null, 1))
const vid = await page.video().path()
await ctx.close(); await browser.close()
console.log('video', vid); console.log(JSON.stringify(scenes))
