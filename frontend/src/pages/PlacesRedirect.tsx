import { Navigate, useLocation, useParams } from 'react-router'

// /places?kind=library (old links) opens the finder with the same filter.
export function PlacesRedirect() {
  const { search } = useLocation()
  return <Navigate to={{ pathname: '/', search, hash: '#finder' }} replace />
}

// /places/7 (old links) is now /spaces/7.
export function PlaceRedirect() {
  const { placeId } = useParams()
  return <Navigate to={`/spaces/${encodeURIComponent(placeId ?? '')}`} replace />
}
