// Back to the search the student came from, with its words and chips (the
// card puts them in the link's state). Opened from elsewhere, for example a
// shared link: the finder, sorted by distance from this building.
export function backToFinder(state: unknown, slug: string, buildingCode: string): string {
  const from = (state as { finder?: unknown } | null)?.finder
  if (typeof from === 'string' && (from === '' || from.startsWith('?'))) return `/${slug}${from}#finder`
  return `/${slug}?near=${encodeURIComponent(buildingCode)}#finder`
}
