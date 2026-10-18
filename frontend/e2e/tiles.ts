// The map's tile servers: tests block them, so a run never depends on the
// internet. Matched on the exact host, not a pattern that could match a
// look-alike address (CodeQL's "missing regular expression anchor").
const TILE_HOSTS = new Set(['tile.openstreetmap.org', 'server.arcgisonline.com'])

export const isMapTile = (url: URL) => TILE_HOSTS.has(url.hostname)
