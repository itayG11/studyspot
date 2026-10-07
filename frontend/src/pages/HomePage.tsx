// The home page: the scroll story, then the finder. Both read the same
// live data, refreshed every 30 seconds.

import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router'
import { getBuildings, getPlaces } from '../api/campus'
import { REFRESH_INTERVAL_MS } from '../config'
import { Finder } from '../features/finder/Finder'
import { FinderReveal } from '../features/finder/FinderReveal'
import { StoryPlaceholder, StoryScroller } from '../features/story/StoryScroller'
import { useApi } from '../hooks/useApi'
import { hasFilters, readFilters } from '../logic/filters'

function toFinder(smooth: boolean) {
  const finder = document.getElementById('finder')
  if (!finder) return
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  finder.scrollIntoView({ behavior: smooth && !reduce ? 'smooth' : 'auto', block: 'start' })
  // The keyboard continues from the finder too.
  finder.focus({ preventScroll: true })
}

export function HomePage() {
  const buildings = useApi(getBuildings, 'buildings', REFRESH_INTERVAL_MS)
  const places = useApi(() => getPlaces(), 'places', REFRESH_INTERVAL_MS)
  const location = useLocation()
  const ready = places.data !== null && buildings.data !== null

  // A shared link with filters, or #finder, opens straight on the results:
  // whoever sent it wants the list, not the story. Decided once, on arrival;
  // later typing in the search must not move the page.
  const skipStory = useRef(location.hash === '#finder' || hasFilters(readFilters(new URLSearchParams(location.search))))
  useEffect(() => {
    // Once the data is in, so the page has its full height.
    if (ready && skipStory.current) {
      skipStory.current = false
      toFinder(false)
    }
  }, [ready])

  return (
    <>
      {buildings.data && places.data ? (
        <StoryScroller buildings={buildings.data} places={places.data} onToFinder={() => toFinder(true)} />
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
    </>
  )
}
