import { Navigate, useLocation } from 'react-router'

// /places?kind=library (old links) opens the finder with the same filter.
export function PlacesRedirect() {
  const { search } = useLocation()
  return <Navigate to={{ pathname: '/', search, hash: '#finder' }} replace />
}
