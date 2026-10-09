import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InstallTip } from './InstallTip'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36'

function asDevice(userAgent: string, standalone = false) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent)
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: standalone && query.includes('standalone'), media: query, addEventListener() {}, removeEventListener() {} }))
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('InstallTip', () => {
  it('shows an iPhone the steps by hand', () => {
    asDevice(IPHONE)
    render(<InstallTip variant="card" />)
    expect(screen.getByRole('heading', { name: /במסך הבית/ })).toBeInTheDocument()
    expect(screen.getByText(/הוספה למסך הבית/)).toBeInTheDocument()
    expect(screen.getByLabelText('שיתוף')).toBeInTheDocument()
  })

  it('gives Android one install button when Chrome offers it', async () => {
    asDevice(ANDROID)
    const { listenForInstallPrompt } = await import('../logic/install')
    listenForInstallPrompt()
    render(<InstallTip variant="card" />)
    const prompt = vi.fn(() => Promise.resolve())
    act(() => {
      const event = Object.assign(new Event('beforeinstallprompt'), { prompt, userChoice: Promise.resolve({ outcome: 'accepted' }) })
      window.dispatchEvent(event)
    })
    await userEvent.click(screen.getByRole('button', { name: 'התקנה' }))
    expect(prompt).toHaveBeenCalled()
  })

  it('is not shown once the site opens from the home screen', () => {
    asDevice(IPHONE, true)
    const { container } = render(<InstallTip variant="section" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('"not now" hides the home page card, also next time', async () => {
    asDevice(IPHONE)
    const first = render(<InstallTip variant="card" />)
    await userEvent.click(screen.getByRole('button', { name: 'לא עכשיו' }))
    expect(first.container).toBeEmptyDOMElement()
    first.unmount()
    expect(render(<InstallTip variant="card" />).container).toBeEmptyDOMElement()
    // The personal area still has it.
    render(<InstallTip variant="section" />)
    expect(screen.getByRole('heading', { name: /במסך הבית/ })).toBeInTheDocument()
  })

  it('a computer sees it only in the personal area', () => {
    asDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0')
    expect(render(<InstallTip variant="card" />).container).toBeEmptyDOMElement()
    render(<InstallTip variant="section" />)
    expect(screen.getByText(/התקנת אפליקציה/)).toBeInTheDocument()
  })
})
