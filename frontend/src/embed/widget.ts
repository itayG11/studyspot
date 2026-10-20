// The occupancy widget (wave 14.4): what an institution shows inside its own
// site, in a frame. Plain DOM, no React: it is its own small build
// (embed.html), and every name is set as text, never as HTML.

import type { Place } from '../api/types'

export interface WidgetOptions {
  slug: string
  building: string | null
  siteUrl: string // where "all the places" leads
}

export interface Summary {
  open: number // places open now that a student walks into
  free: number // free seats in them
}

// Group rooms are booked, not walked into: left out of the count, as on the map.
export function summary(places: Place[]): Summary {
  const walkIn = places.filter((p) => p.is_open && p.kind !== 'group_room')
  return { open: walkIn.length, free: walkIn.reduce((sum, p) => sum + p.available, 0) }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function line(place: Place): HTMLLIElement {
  const row = el('li', 'place')
  const name = el('span', 'name', place.name)
  const where = el('span', 'where', `בניין ${place.building_code}`)
  let state: HTMLSpanElement
  if (!place.is_open) state = el('span', 'state closed', 'סגור')
  else if (place.kind === 'group_room') state = el('span', 'state', place.free_now ? 'פנוי עכשיו' : 'תפוס')
  else if (place.available === 0) state = el('span', 'state full', 'מלא')
  else state = el('span', 'state free', `${place.available} פנויים מתוך ${place.capacity}`)
  row.append(name, where, state)
  return row
}

export function render(root: HTMLElement, places: Place[], options: WidgetOptions, now: Date): void {
  const { open, free } = summary(places)
  const head = el('header', 'head')
  head.append(
    el('strong', 'total', open === 0 ? 'הכול סגור עכשיו' : `${free} מקומות פנויים עכשיו`),
    el('span', 'updated', `עודכן ב-${now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`),
  )
  const list = el('ul', 'places')
  list.setAttribute('aria-label', 'המקומות')
  // Open first, then by name: what a student can use now is on top.
  const sorted = [...places].sort((a, b) => Number(b.is_open) - Number(a.is_open) || a.name.localeCompare(b.name, 'he'))
  for (const place of sorted) list.append(line(place))
  const link = el('a', 'more', 'לכל המקומות ב-StudySpot')
  const query = options.building ? `?building=${encodeURIComponent(options.building)}` : ''
  link.href = `${options.siteUrl}/${encodeURIComponent(options.slug)}${query}`
  link.target = '_blank'
  link.rel = 'noopener'
  root.replaceChildren(head, list, link)
}

export function renderError(root: HTMLElement): void {
  root.replaceChildren(el('p', 'error', 'אי אפשר לטעון את התפוסה כרגע. ננסה שוב בעוד דקה.'))
}

// The address: /embed/<slug>?building=L&theme=dark
export function readOptions(location: Location): { slug: string | null; building: string | null; theme: string | null } {
  const slug = location.pathname.split('/').filter(Boolean)[1] ?? null
  const params = new URLSearchParams(location.search)
  return { slug, building: params.get('building'), theme: params.get('theme') }
}
