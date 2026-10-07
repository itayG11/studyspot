import { render as rtlRender, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionConfig } from 'motion/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { building, place } from '../../test/fixtures'
import { StoryScroller } from './StoryScroller'

const BUILDINGS = [building({ code: 'M', available: 38 }), building({ id: 2, code: 'EM', available: 12, latitude: '32.914079', longitude: '35.281250' })]
const PLACES = [
  place({ kind: 'computer_lab', available: 38 }),
  place({ id: 2, kind: 'group_room', free_now: true }),
  place({ id: 3, kind: 'library', available: 12 }),
]

// The app's MotionConfig decides; here it is set directly.
let reduceMotion = false
const render = (ui: ReactNode) => rtlRender(<MotionConfig reducedMotion={reduceMotion ? 'always' : 'never'}>{ui}</MotionConfig>)
function stubReducedMotion(reduce: boolean) {
  reduceMotion = reduce
}

describe.each([false, true])('StoryScroller (reduce motion: %s)', (reduce) => {
  it('tells the whole story in the page text, with the live numbers', () => {
    stubReducedMotion(reduce)
    render(<StoryScroller buildings={BUILDINGS} places={PLACES} onToFinder={vi.fn()} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('יש לך מקום בקמפוס.')
    expect(screen.getByText('50', { exact: true })).toBeInTheDocument() // 38 + 12 free on campus
    for (const kind of ['מתחם לימוד פתוח', 'חוות מחשבים', 'חדר לימוד קבוצתי', 'ספרייה']) {
      expect(screen.getAllByText(kind).length).toBeGreaterThan(0)
    }
    expect(screen.getByText('תאים פנויים עכשיו')).toBeInTheDocument()
    expect(screen.getByText('חדר פנוי עכשיו')).toBeInTheDocument()
  })

  it('leads to the search with one button', async () => {
    stubReducedMotion(reduce)
    const onToFinder = vi.fn()
    render(<StoryScroller buildings={BUILDINGS} places={PLACES} onToFinder={onToFinder} />)
    await userEvent.click(screen.getByRole('button', { name: 'לחיפוש מקום' }))
    expect(onToFinder).toHaveBeenCalledOnce()
  })
})

describe('StoryScroller', () => {
  it('starts with a skip link for keyboards and return visits', () => {
    stubReducedMotion(false)
    render(<StoryScroller buildings={BUILDINGS} places={PLACES} onToFinder={vi.fn()} />)
    expect(screen.getByRole('link', { name: 'דלג לחיפוש' })).toHaveAttribute('href', '#finder')
  })

  it('shows the still version when the device asks for less motion', () => {
    stubReducedMotion(true)
    const { container } = render(<StoryScroller buildings={BUILDINGS} places={PLACES} onToFinder={vi.fn()} />)
    expect(screen.queryByRole('link', { name: 'דלג לחיפוש' })).toBeNull()
    // The campus and the four places, each with its picture.
    expect(container.querySelectorAll('img')).toHaveLength(5)
  })
})
