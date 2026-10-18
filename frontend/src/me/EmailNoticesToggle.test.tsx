import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EmailNoticesToggle } from './EmailNoticesToggle'

const api = vi.hoisted(() => ({ emailNotices: vi.fn(), setEmailNotices: vi.fn() }))
vi.mock('../api/student', () => api)

const state = (over: object = {}) => ({ enabled: false, available: true, reason: null, address: 'noa@e.braude.ac.il', ...over })

beforeEach(() => {
  vi.clearAllMocks()
  api.setEmailNotices.mockResolvedValue(state({ enabled: true }))
})

describe('EmailNoticesToggle', () => {
  it('turns email notices on, showing the address they go to', async () => {
    api.emailNotices.mockResolvedValueOnce(state()).mockResolvedValue(state({ enabled: true }))
    render(<EmailNoticesToggle />)
    expect(await screen.findByText('noa@e.braude.ac.il')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'להפעיל התראות במייל' }))
    expect(api.setEmailNotices).toHaveBeenCalledWith(true)
    expect(await screen.findByRole('button', { name: 'לכבות התראות במייל' })).toBeInTheDocument()
  })

  it('turns them off', async () => {
    api.emailNotices.mockResolvedValue(state({ enabled: true }))
    render(<EmailNoticesToggle />)
    await userEvent.click(await screen.findByRole('button', { name: 'לכבות התראות במייל' }))
    expect(api.setEmailNotices).toHaveBeenCalledWith(false)
  })

  it('explains why an unproved address cannot get them, with no button', async () => {
    api.emailNotices.mockResolvedValue(state({ available: false, reason: 'unverified' }))
    render(<EmailNoticesToggle />)
    expect(await screen.findByText(/רק לכתובת שאומתה/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('says nothing more for the demo account', async () => {
    api.emailNotices.mockResolvedValue(state({ available: false, reason: 'demo' }))
    const { container } = render(<EmailNoticesToggle />)
    await vi.waitFor(() => expect(api.emailNotices).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })
})
