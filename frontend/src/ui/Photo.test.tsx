import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Photo } from './Photo'

describe('Photo', () => {
  it('offers AVIF and WebP, a tall picture for phones, and the illustration mark', () => {
    const { container } = render(<Photo name="library" />)
    const sources = [...container.querySelectorAll('source')]
    expect(sources.map((s) => s.getAttribute('type'))).toEqual(['image/avif', 'image/webp', 'image/avif', 'image/webp'])
    expect(sources[0]).toHaveAttribute('media', '(max-width: 760px)')
    expect(sources[0].getAttribute('srcset')).toContain('library-mobile-600.avif 600w')
    expect(sources[2].getAttribute('srcset')).toContain('library-1600.avif 1600w')
    expect(screen.getByText('הדמיה')).toBeInTheDocument()
  })

  it('says in its alt text that it is an illustration', () => {
    render(<Photo name="hero" />)
    expect(screen.getByRole('img')).toHaveAccessibleName(/^הדמיה:/)
  })

  it('is empty for screen readers next to text that names the place', () => {
    const { container } = render(<Photo name="computer-lab" variant="card" decorative />)
    expect(container.querySelector('img')).toHaveAttribute('alt', '')
    expect(container.querySelectorAll('source')).toHaveLength(2)
  })

  it('loads lazily, except the first picture on the page', () => {
    const { container, rerender } = render(<Photo name="hero" />)
    expect(container.querySelector('img')).toHaveAttribute('loading', 'lazy')
    rerender(<Photo name="hero" priority />)
    expect(container.querySelector('img')).toHaveAttribute('loading', 'eager')
    expect(container.querySelector('img')).toHaveAttribute('fetchpriority', 'high')
  })
})
