// The campus's pulse in the header: how many places are free right now.

import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import type { CampusToday } from '../api/types'
import { CampusPulse } from './CampusPulse'

const today = (over: Partial<CampusToday> = {}): CampusToday => ({
  weekday: 0, capacity: 315, occupied: 195, free_now: 120, weeks: 8, simulated: false, slots: [], places: [], ...over,
})
const show = (data: CampusToday | null, loading = false) =>
  render(<MemoryRouter><CampusPulse today={data} home="/demo" loading={loading} /></MemoryRouter>)

describe('CampusPulse', () => {
  it('says how many places are free now, from the live count, and leads to the search', () => {
    show(today())
    const link = screen.getByRole('link', { name: '120 פנויים עכשיו, מקומות בקמפוס' })
    expect(link).toHaveAttribute('href', '/demo#finder')
  })

  it('with every place closed, it says none is free, not the campus\'s size', () => {
    show(today({ occupied: 0, free_now: 0 }))
    expect(screen.getByRole('link')).toHaveAccessibleName('0 פנויים עכשיו, מקומות בקמפוס')
  })

  it('on the demo campus it says the people are made up', () => {
    show(today({ simulated: true }))
    expect(screen.getByRole('link')).toHaveAccessibleName('120 פנויים עכשיו · דמו, מקומות בקמפוס')
  })

  it('shows nothing before the numbers, or where nothing is counted', () => {
    const { container } = show(null)
    expect(container).toBeEmptyDOMElement()
    show(today({ capacity: 0, occupied: 0 }))
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('while the numbers load, keeps its place with an invisible, silent copy, so the header does not grow later', () => {
    const { container } = show(null, true)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    const holder = container.firstElementChild as HTMLElement
    expect(holder).toHaveAttribute('aria-hidden', 'true')
    expect(holder).toHaveTextContent('פנויים')
    expect(getComputedStyle(holder).visibility).toBe('hidden')
  })

  it('after a failed load it keeps no place', () => {
    const { container } = show(null, false)
    expect(container).toBeEmptyDOMElement()
  })

  it('never says less than none', () => {
    show(today({ capacity: 10, occupied: 12, free_now: -2 }))
    expect(screen.getByRole('link')).toHaveAccessibleName('0 פנויים עכשיו, מקומות בקמפוס')
  })
})
