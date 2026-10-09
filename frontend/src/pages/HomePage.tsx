// The home page: the scroll story, then the finder. Both read the same
// live data, refreshed every 30 seconds.

import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation } from 'react-router'
import { getBuildings, getPlaces } from '../api/campus'
import { REFRESH_INTERVAL_MS } from '../config'
import { InstallTip } from '../components/InstallTip'
import { Finder } from '../features/finder/Finder'
import { FinderReveal } from '../features/finder/FinderReveal'
import { StoryPlaceholder, StoryScroller } from '../features/story/StoryScroller'
import { useApi } from '../hooks/useApi'
import { hasFilters, readFilters } from '../logic/filters'
import { useInstitution } from '../institution'

function toFinder(smooth: boolean) {
  const finder = document.getElementById('finder')
  if (!finder) return
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  finder.scrollIntoView({ behavior: smooth && !reduce ? 'smooth' : 'auto', block: 'start' })
  // The keyboard continues from the finder too.
  finder.focus({ preventScroll: true })
}

// The header's ask is done once acted on: taken out of this history entry
// (React Router keeps it in history.state.usr), so a reload starts at the
// story again and Back/Forward do not glide. Directly on history, not as a
// navigation, which would scroll the page back to the top.
function forgetToFinder() {
  const entry = window.history.state as { usr?: { toFinder?: number } } | null
  if (entry?.usr?.toFinder === undefined) return
  window.history.replaceState({ ...entry, usr: undefined }, '')
}

// One function for the life of the page, so the story is not drawn again
// on every keystroke in the search below it (it is memo'd).
const smoothToFinder = () => toFinder(true)

export function HomePage() {
  const { slug } = useInstitution()
  const buildings = useApi(() => getBuildings(slug), `buildings-${slug}`, REFRESH_INTERVAL_MS)
  const places = useApi(() => getPlaces(slug), `places-${slug}`, REFRESH_INTERVAL_MS)
  const location = useLocation()
  const ready = places.data !== null && buildings.data !== null

  // A shared link with filters, or #finder, opens straight on the results:
  // whoever sent it wants the list, not the story. Decided once, on arrival;
  // later typing in the search must not move the page.
  // "Search for a place" in the header asks for the search too (toFinder).
  const toFinderAsked = (location.state as { toFinder?: number } | null)?.toFinder
  const skipStory = useRef(
    location.hash === '#finder' || toFinderAsked !== undefined || hasFilters(readFilters(new URLSearchParams(location.search))),
  )
  // A layout effect: the jump happens before the browser paints the story
  // that just arrived above the finder, so the reader never sees it push
  // the results down (no layout shift).
  useLayoutEffect(() => {
    // Once the data is in, so the page has its full height.
    if (ready && skipStory.current) {
      skipStory.current = false
      toFinder(false)
      forgetToFinder()
    }
  }, [ready])

  // Asked again while already here: glide down to the search. (The first
  // ask, on arrival, is the jump above.)
  const firstAsk = useRef(toFinderAsked)
  useEffect(() => {
    if (toFinderAsked === undefined || toFinderAsked === firstAsk.current) return
    smoothToFinder()
    forgetToFinder()
  }, [toFinderAsked])

  return (
    <>
      {buildings.data && places.data ? (
        <StoryScroller buildings={buildings.data} places={places.data} onToFinder={smoothToFinder} />
      ) : (
        <StoryPlaceholder />
      )}
      <FinderReveal>
        <Finder
          places={places.data}
          buildings={buildings.data}
          error={places.error ?? buildings.error}
          onRetry={() => {
            places.reload()
            buildings.reload()
          }}
        />
      </FinderReveal>
      <InstallTip variant="card" />
    </>
  )
}
