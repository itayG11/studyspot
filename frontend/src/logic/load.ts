// The load chart: "usually" next to "today so far", hour by hour. Pure, so
// the tests read it without a page.

export interface LoadSlot {
  start: string // local "HH:MM:SS", a quarter hour
  usual: number | null // null: no forecast yet
  today: number | null // null: still to come
}

export interface LoadHour {
  hour: number // local, 0–23
  usual: number | null
  today: number | null
}

const mean = (values: number[]) => Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10

// Each hour is the average of its quarter hours; today, of those so far.
export function hourly(slots: LoadSlot[]): LoadHour[] {
  const hours = new Map<number, LoadSlot[]>()
  for (const slot of slots) {
    const hour = Number(slot.start.slice(0, 2))
    hours.set(hour, [...(hours.get(hour) ?? []), slot])
  }
  return [...hours].map(([hour, quarters]) => {
    const usual = quarters.map((q) => q.usual).filter((v): v is number => v !== null)
    const today = quarters.map((q) => q.today).filter((v): v is number => v !== null)
    return { hour, usual: usual.length ? mean(usual) : null, today: today.length ? mean(today) : null }
  })
}

// A place's page: its usual hours, and today's people hour by hour
// (forecast.today: hours only, a missing hour had nobody, or a few). Up to
// the hour under way at a local "HH:MM"; later hours have no today yet.
// With no forecast yet, today's hours alone.
export function withToday(usual: LoadHour[], today: { start: string; people: number }[], clock: string): LoadHour[] {
  const counted = new Map(today.map((t) => [Number(t.start.slice(0, 2)), t.people]))
  const current = Number(clock.slice(0, 2))
  const hours = usual.length > 0 ? usual : [...counted.keys()].sort((a, b) => a - b).map((hour) => ({ hour, usual: null, today: null }))
  return hours.map((h) => ({ ...h, today: h.hour <= current ? (counted.get(h.hour) ?? 0) : null }))
}

// Busier or quieter than usual: a quarter apart, and at least a few people.
export function compareToUsual(now: number, usual: number | null): 'busier' | 'quieter' | 'usual' | null {
  if (usual === null) return null
  if (Math.abs(now - usual) < 3) return 'usual'
  if (now >= usual * 1.25) return 'busier'
  if (now <= usual * 0.75) return 'quieter'
  return 'usual'
}
