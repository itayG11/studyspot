// The API's full address, for examples a developer copies (curl, the docs):
// in production the site and the API share one address, under /api.
import { API_URL } from '../config'

export function apiAddress(origin: string = window.location.origin): string {
  return new URL(API_URL.endsWith('/') ? API_URL : `${API_URL}/`, `${origin}/`).href.replace(/\/$/, '')
}
