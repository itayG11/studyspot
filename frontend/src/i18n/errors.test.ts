import { describe, expect, it } from 'vitest'
import { errorMessage } from './errors'

describe('errorMessage', () => {
  it('translates a known server code', () => {
    expect(errorMessage('institution_not_supported')).toContain('לא שייך למוסד')
  })

  it('falls back to a general message for an unknown code', () => {
    expect(errorMessage('something_new')).toBe(errorMessage('unknown_error'))
  })
})
