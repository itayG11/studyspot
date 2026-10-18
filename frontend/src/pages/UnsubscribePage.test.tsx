import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { UnsubscribePage } from './UnsubscribePage'

const api = vi.hoisted(() => ({ unsubscribeEmail: vi.fn() }))
vi.mock('../api/student', () => api)

function open(hash: string) {
  window.history.replaceState(null, '', `/unsubscribe${hash}`)
  return render(
    <MemoryRouter>
      <UnsubscribePage />
    </MemoryRouter>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('UnsubscribePage', () => {
  it('sends the token once, and takes it out of the address', async () => {
    api.unsubscribeEmail.mockResolvedValue(undefined)
    open('#t=7.abc')
    expect(await screen.findByText('ההתראות במייל כבויות')).toBeInTheDocument()
    expect(api.unsubscribeEmail).toHaveBeenCalledTimes(1)
    expect(api.unsubscribeEmail).toHaveBeenCalledWith('7.abc')
    expect(window.location.hash).toBe('')
  })

  it('says so when the link is not valid', async () => {
    api.unsubscribeEmail.mockRejectedValue(new ApiError(404, 'unsubscribe_invalid'))
    open('#t=7.bad')
    expect(await screen.findByText('לא הצלחנו לכבות')).toBeInTheDocument()
    expect(screen.getByText(/הקישור הזה לא תקין/)).toBeInTheDocument()
  })

  it('without a token, sends nothing', async () => {
    open('')
    expect(await screen.findByText('לא הצלחנו לכבות')).toBeInTheDocument()
    expect(api.unsubscribeEmail).not.toHaveBeenCalled()
  })
})
