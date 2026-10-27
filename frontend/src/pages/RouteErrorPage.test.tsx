import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { reportError } from '../logic/errorReport'
import { RouteErrorPage } from './RouteErrorPage'

vi.mock('../logic/errorReport', () => ({ reportError: vi.fn() }))

function Boom(): never {
  throw new Error('render failed')
}

function crashingSite() {
  const router = createMemoryRouter([{ path: '/', Component: Boom, ErrorBoundary: RouteErrorPage }])
  render(<RouterProvider router={router} />)
}

describe('RouteErrorPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('says in Hebrew that something went wrong, instead of the router’s English page', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined) // React and the router log the crash
    crashingSite()
    expect(await screen.findByRole('heading', { name: 'משהו השתבש' })).toBeInTheDocument()
    expect(screen.queryByText(/Unexpected Application Error/)).not.toBeInTheDocument()
  })

  it('reports the crash, and offers a reload', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    crashingSite()
    await userEvent.click(await screen.findByRole('button', { name: 'לטעון את הדף מחדש' }))
    expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ message: 'render failed' }))
    expect(reload).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })
})
