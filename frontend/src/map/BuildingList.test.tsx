import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { building } from '../test/fixtures'
import { buildingSummary } from '../logic/places'
import { BuildingList } from './BuildingList'

describe('buildingSummary', () => {
  it('counts free seats', () => {
    expect(buildingSummary(building())).toBe('60 מקומות פנויים מתוך 65')
  })

  it('explains an empty count instead of showing 0 of 0', () => {
    expect(buildingSummary(building({ places_count: 0, capacity: 0, occupied: 0, available: 0 }))).toBe('אין עדיין מקומות לימוד')
    expect(buildingSummary(building({ capacity: 0, occupied: 0, available: 0 }))).toBe('אין עכשיו מקום פתוח לישיבה חופשית')
    expect(buildingSummary(building({ status: 'under_construction' }))).toBe('בבנייה')
  })
})

describe('BuildingList', () => {
  it('shows each building and reports the one chosen', async () => {
    const onSelect = vi.fn()
    render(
      <BuildingList
        buildings={[building(), building({ id: 2, code: 'EF', available: 120, capacity: 130 })]}
        selected="M"
        onSelect={onSelect}
      />,
    )
    expect(screen.getByRole('button', { name: /בניין M/ })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: /בניין EF/ }))
    expect(onSelect).toHaveBeenCalledWith('EF')
  })
})
