// Starts the widget: reads its address, loads the places, and again every
// minute while the page is seen (backend app/site.py serves embed.html).

import './embed.css'
import type { Place } from '../api/types'
import { API_URL } from '../config'
import { readOptions, render, renderError } from './widget'

const REFRESH_MS = 60_000
const root = document.getElementById('widget')!
const { slug, building, theme } = readOptions(window.location)
if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme

async function load(): Promise<void> {
  if (!slug) return renderError(root)
  const query = building ? `?building=${encodeURIComponent(building)}` : ''
  try {
    // Marked as the widget: a lobby screen asking all day is not a visitor,
    // and must not keep the server's database awake (backend app/main.py).
    const answer = await fetch(`${API_URL}/institutions/${encodeURIComponent(slug)}/places${query}`, {
      headers: { 'X-StudySpot-Widget': '1' },
    })
    if (!answer.ok) throw new Error(String(answer.status))
    render(root, (await answer.json()) as Place[], { slug, building, siteUrl: window.location.origin }, new Date())
  } catch {
    renderError(root)
  }
}

void load()
setInterval(() => {
  if (document.visibilityState === 'visible') void load()
}, REFRESH_MS)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void load()
})
