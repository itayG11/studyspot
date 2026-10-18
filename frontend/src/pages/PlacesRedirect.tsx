import { useParams } from 'react-router'
import { ToHomeInstitution } from '../institutionRoutes'

// /places?kind=library (old links) opens the finder with the same filter.
export function PlacesRedirect() {
  return <ToHomeInstitution hash="#finder" />
}

// /places/7 and /spaces/7 (old links) are now /<institution>/spaces/7.
export function PlaceRedirect() {
  const { placeId } = useParams()
  return <ToHomeInstitution path={`/spaces/${encodeURIComponent(placeId ?? '')}`} />
}
