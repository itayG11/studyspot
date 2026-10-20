import { beforeEach, describe, expect, it } from 'vitest'
import type { Place } from '../api/types'
import { readOptions, render, renderError, summary } from './widget'

const base = { floor: 0, location_note: null, bookable: false, counted: true, building_code: 'L', occupied: 0 }
const places = [
  { ...base, id: 1, kind: 'open_area', name: 'מתחם לימוד', capacity: 40, available: 12, is_open: true },
  { ...base, id: 2, kind: 'library', name: 'ספרייה', capacity: 80, available: 0, is_open: true },
  { ...base, id: 3, kind: 'group_room', name: 'L201', capacity: 6, available: 6, is_open: true, free_now: true },
  { ...base, id: 4, kind: 'open_area', name: 'אולם ערב', capacity: 30, available: 30, is_open: false },
] as unknown as Place[]

const options = { slug: 'braude', building: 'L', siteUrl: 'https://getstudyspot.me' }
let root: HTMLElement

beforeEach(() => {
  document.body.innerHTML = '<main id="widget"></main>'
  root = document.getElementById('widget')!
})

describe('the widget', () => {
  it('counts free seats in open places a student walks into', () => {
    expect(summary(places)).toEqual({ open: 2, free: 12 })
  })

  it('shows the total, each place, and a link that opens a new window', () => {
    render(root, places, options, new Date('2026-10-20T09:30:00Z'))
    expect(root.querySelector('.total')!.textContent).toBe('12 מקומות פנויים עכשיו')
    const states = [...root.querySelectorAll('.place')].map((row) => row.textContent)
    expect(states).toContain('מתחם לימודבניין L12 פנויים מתוך 40')
    expect(states).toContain('ספרייהבניין Lמלא')
    expect(states).toContain('L201בניין Lפנוי עכשיו')
    expect(states.at(-1)).toBe('אולם ערבבניין Lסגור') // closed last
    const link = root.querySelector('a')!
    expect(link.getAttribute('href')).toBe('https://getstudyspot.me/braude?building=L')
    expect([link.target, link.rel]).toEqual(['_blank', 'noopener'])
  })

  it('says when everything is closed', () => {
    render(root, places.map((p) => ({ ...p, is_open: false })), options, new Date())
    expect(root.querySelector('.total')!.textContent).toBe('הכול סגור עכשיו')
  })

  it('puts a name in as text, never as HTML', () => {
    render(root, [{ ...places[0], name: '<img src=x onerror=alert(1)>' }], options, new Date())
    expect(root.querySelector('img')).toBeNull()
    expect(root.querySelector('.name')!.textContent).toBe('<img src=x onerror=alert(1)>')
  })

  it('says it cannot load', () => {
    renderError(root)
    expect(root.textContent).toContain('אי אפשר לטעון')
  })

  it('reads the institution, the building and the look from its address', () => {
    const location = new URL('https://getstudyspot.me/embed/braude?building=L&theme=dark') as unknown as Location
    expect(readOptions(location)).toEqual({ slug: 'braude', building: 'L', theme: 'dark' })
  })
})
