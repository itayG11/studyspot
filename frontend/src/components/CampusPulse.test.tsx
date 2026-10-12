// The campus's pulse in the header: how many places are free right now.

import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import type { CampusToday } from '../api/types'
import { CampusPulse } from './CampusPulse'

const today = (over: Partial<CampusToday> = {}): CampusToday => ({
  weekday: 0, capacity: 315, occupied: 195, weeks: 8, simulated: false, slots: [], places: [], ...over,
})
const show = (data: CampusToday | null) =>
  render(<MemoryRouter><CampusPulse today={data} home="/demo" /></MemoryRouter>)

describe('CampusPulse', () => {
  it('says how many places are free now, from the live count, and leads to the search', () => {
    show(today())
    const link = screen.getByRole('link', { name: '120 מקומות פנויים עכשיו בקמפוס' })
    expect(link).toHaveAttribute('href', '/demo#finder')
  })

  it('on the demo campus it says the people are made up', () => {
    show(today({ simulated: true }))
    expect(screen.getByRole('link')).toHaveAccessibleName('120 מקומות פנויים עכשיו בקמפוס, נתוני דמו')
  })

  it('shows nothing before the numbers, or where nothing is counted', () => {
    const { container } = show(null)
    expect(container).toBeEmptyDOMElement()
    show(today({ capacity: 0, occupied: 0 }))
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('never says less than none', () => {
    show(today({ capacity: 10, occupied: 12 }))
    expect(screen.getByRole('link')).toHaveAccessibleName('0 מקומות פנויים עכשיו בקמפוס')
  })
})
