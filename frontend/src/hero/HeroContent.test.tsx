import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { HeroContent } from './HeroContent'

function renderHero(onToMap = vi.fn()) {
  const router = createMemoryRouter(
    [{ path: '/', element: <HeroContent freeNow={315} openBuildings={5} institutionName="מכללת בראודה" onToMap={onToMap} /> }],
    { initialEntries: ['/'] },
  )
  render(<RouterProvider router={router} />)
  return onToMap
}

describe('HeroContent', () => {
  it('asks the question and answers it with the live number', () => {
    renderHero()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('איפה יש מקום עכשיו?')
    expect(screen.getByText('315')).toBeInTheDocument()
    expect(screen.getByText(/מקומות פנויים עכשיו ב-5 בניינים/)).toBeInTheDocument()
  })

  it('the map button takes the visitor down to the live map', async () => {
    const onToMap = renderHero()
    await userEvent.click(screen.getByRole('button', { name: 'למפה החיה' }))
    expect(onToMap).toHaveBeenCalledOnce()
  })

  it('links to the full list of places', () => {
    renderHero()
    expect(screen.getByRole('link', { name: 'כל המקומות' })).toHaveAttribute('href', '/places')
  })
})
