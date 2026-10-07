import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PlaceKind } from '../api/types'
import type { CampusBuilding } from './campus'
import { CampusModel } from './CampusModel'
import { SpaceScene } from './SpaceScene'

const BUILDINGS: CampusBuilding[] = [
  { code: 'M', floors_count: 3, status: 'active', latitude: '32.912751', longitude: '35.282293' },
  { code: 'EM', floors_count: 4, status: 'active', latitude: '32.914079', longitude: '35.281250' },
  { code: 'NG', floors_count: 4, status: 'under_construction', latitude: '32.914383', longitude: '35.280751' },
  { code: 'Q', floors_count: 2, status: 'active', latitude: null, longitude: null },
]

describe('CampusModel', () => {
  it('says on screen and to screen readers that it is an illustration', () => {
    render(<CampusModel buildings={BUILDINGS} />)
    expect(screen.getByRole('img')).toHaveAccessibleName(/המחשה/)
    expect(screen.getByText(/המחשה · המיקומים והקומות אמיתיים, הצורות לא/)).toBeInTheDocument()
  })

  it('draws the buildings that are on the map, each with its code', () => {
    const { container } = render(<CampusModel buildings={BUILDINGS} />)
    const drawn = [...container.querySelectorAll('[data-building]')].map((g) => g.getAttribute('data-building'))
    expect(drawn.sort()).toEqual(['EM', 'M', 'NG'])
    expect(screen.getByText('EM')).toBeInTheDocument()
    expect(screen.queryByText('Q')).toBeNull()
  })

  it('stands the pin on the chosen building only', () => {
    const { container, rerender } = render(<CampusModel buildings={BUILDINGS} />)
    expect(container.querySelector('[data-layer="pin"]')).toBeNull()
    rerender(<CampusModel buildings={BUILDINGS} pinAt="EM" />)
    expect(container.querySelector('[data-layer="pin"]')).not.toBeNull()
  })

  it('draws nothing while no building is placed', () => {
    const { container } = render(<CampusModel buildings={[BUILDINGS[3]]} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('SpaceScene', () => {
  const KINDS: PlaceKind[] = ['open_area', 'computer_lab', 'group_room', 'library']

  it.each(KINDS)('draws %s with a name and the three layers the story moves', (kind) => {
    const { container } = render(<SpaceScene kind={kind} />)
    expect(screen.getByRole('img')).toHaveAccessibleName(/^איור: /)
    for (const layer of ['room', 'furniture', 'light']) {
      expect(container.querySelector(`[data-layer="${layer}"]`)).not.toBeNull()
    }
  })

  it('gives every light its own gradient id, so two scenes on a page do not clash', () => {
    const { container } = render(
      <>
        <SpaceScene kind="computer_lab" />
        <SpaceScene kind="computer_lab" />
      </>,
    )
    const ids = [...container.querySelectorAll('radialGradient')].map((g) => g.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
