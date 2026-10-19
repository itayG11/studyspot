import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiKey } from '../api/types'
import { Connections } from './Connections'

const api = vi.hoisted(() => ({ getApiKeys: vi.fn(), makeApiKey: vi.fn(), revokeApiKey: vi.fn() }))
vi.mock('../api/admin', () => api)
vi.mock('../institution', () => ({ useInstitution: () => ({ slug: 'braude', timezone: 'Asia/Jerusalem' }) }))

const RAW = 'ss_live_' + 'A'.repeat(43)
const key: ApiKey = {
  id: 7,
  name: 'המסך בספרייה',
  prefix: 'ss_live_AAAA',
  created_at: '2026-10-19T08:00:00Z',
  last_used_at: null,
  revoked_at: null,
}

function show() {
  return render(
    <MemoryRouter>
      <Connections />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  api.revokeApiKey.mockResolvedValue(undefined)
})

describe('Connections', () => {
  it('makes a key and shows it once, with a curl example', async () => {
    api.getApiKeys.mockResolvedValueOnce([]).mockResolvedValue([key])
    api.makeApiKey.mockResolvedValue({ key: RAW, api_key: key })
    const user = userEvent.setup()
    show()
    expect(await screen.findByText('עדיין אין מפתחות.')).toBeInTheDocument()
    await user.type(screen.getByLabelText(/למה המפתח/), 'המסך בספרייה')
    await user.click(screen.getByRole('button', { name: 'ליצור מפתח' }))
    expect(api.makeApiKey).toHaveBeenCalledWith('braude', 'המסך בספרייה')
    expect(await screen.findByText(RAW)).toBeInTheDocument()
    expect(screen.getByText(/curl -H "Authorization: Bearer ss_live_/)).toBeInTheDocument()
    expect(await screen.findByRole('listitem', { name: 'מפתח: המסך בספרייה' })).toHaveTextContent('עוד לא היה בשימוש')
  })

  it('asks before revoking a key', async () => {
    api.getApiKeys.mockResolvedValue([key])
    const user = userEvent.setup()
    show()
    const row = await screen.findByRole('listitem', { name: 'מפתח: המסך בספרייה' })
    await user.click(within(row).getByRole('button', { name: 'לבטל' }))
    expect(api.revokeApiKey).not.toHaveBeenCalled()
    await user.click(within(row).getByRole('button', { name: 'כן, לבטל את המפתח' }))
    expect(api.revokeApiKey).toHaveBeenCalledWith('braude', 7)
  })

  it('keeps revoked keys apart, folded away', async () => {
    api.getApiKeys.mockResolvedValue([{ ...key, revoked_at: '2026-10-19T09:00:00Z' }])
    show()
    expect(await screen.findByText('מפתחות שבוטלו (1)')).toBeInTheDocument()
    expect(screen.getByText('עדיין אין מפתחות.')).toBeInTheDocument()
  })
})
