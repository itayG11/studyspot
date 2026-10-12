import { describe, expect, it } from 'vitest'
import { scrollKey } from './scroll'

describe('scrollKey', () => {
  it('keys a page loaded afresh by its address, not by the shared "default"', () => {
    // React Router gives every full page load the key "default": without
    // this, a refresh or the return from Google would get the scroll of
    // whatever page was loaded afresh before it.
    expect(scrollKey({ key: 'default', pathname: '/me' })).toBe('/me')
    expect(scrollKey({ key: 'default', pathname: '/spaces/3' })).toBe('/spaces/3')
  })

  it('keeps one position per visit when moving inside the site, as before', () => {
    expect(scrollKey({ key: 'a1b2', pathname: '/me' })).toBe('a1b2')
  })
})
