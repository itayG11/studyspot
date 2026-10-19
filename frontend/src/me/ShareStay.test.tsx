import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../ui'
import { ShareStay } from './ShareStay'

const api = vi.hoisted(() => ({ makeShare: vi.fn() }))
vi.mock('../api/share', () => api)

const URL_ = 'https://getstudyspot.me/s/c42.n0.' + 'A'.repeat(43)

function show() {
  return render(
    <ToastProvider>
      <ShareStay kind="check_in" id={42} placeName="ספרייה" />
    </ToastProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  api.makeShare.mockResolvedValue({ url: URL_ })
})

afterEach(() => {
  Reflect.deleteProperty(navigator, 'share')
})

describe('ShareStay', () => {
  it('opens the phone share menu, without the name unless chosen', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })
    const user = userEvent.setup()
    show()
    await user.click(screen.getByRole('button', { name: 'לשתף' }))
    expect(screen.getByRole('checkbox', { name: 'להציג את השם שלי' })).not.toBeChecked()
    await user.click(screen.getByRole('button', { name: 'ליצור קישור ולשתף' }))
    expect(api.makeShare).toHaveBeenCalledWith('check_in', 42, false)
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: URL_ }))
  })

  it('asks for the name when it is chosen', async () => {
    Object.defineProperty(navigator, 'share', { value: vi.fn().mockResolvedValue(undefined), configurable: true })
    const user = userEvent.setup()
    show()
    await user.click(screen.getByRole('button', { name: 'לשתף' }))
    await user.click(screen.getByRole('checkbox', { name: 'להציג את השם שלי' }))
    await user.click(screen.getByRole('button', { name: 'ליצור קישור ולשתף' }))
    expect(api.makeShare).toHaveBeenCalledWith('check_in', 42, true)
  })

  it('copies the link where there is no share menu', async () => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    show()
    await user.click(screen.getByRole('button', { name: 'לשתף' }))
    await user.click(screen.getByRole('button', { name: 'ליצור קישור ולשתף' }))
    expect(writeText).toHaveBeenCalledWith(URL_)
    expect(await screen.findByText(/הקישור הועתק/)).toBeInTheDocument()
  })

  it('shows the link to copy by hand when copying is blocked', async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('blocked'))
    show()
    await user.click(screen.getByRole('button', { name: 'לשתף' }))
    await user.click(screen.getByRole('button', { name: 'ליצור קישור ולשתף' }))
    expect(await screen.findByRole('textbox', { name: 'הקישור לשיתוף' })).toHaveValue(URL_)
  })
})
