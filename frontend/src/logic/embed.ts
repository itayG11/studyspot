// The occupancy widget's address (src/embed/, wave 14.4), as the admin's
// "Connections" tab builds it: /embed/<slug>?building=L&theme=dark

export type Theme = 'auto' | 'light' | 'dark'

export function embedAddress(site: string, slug: string, building: string, theme: Theme): string {
  const params = new URLSearchParams()
  if (building) params.set('building', building)
  if (theme !== 'auto') params.set('theme', theme)
  const query = params.toString()
  return `${site}/embed/${encodeURIComponent(slug)}${query ? `?${query}` : ''}`
}
