import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WebhookTester as Tester } from '../api/types'
import { WebhookTester } from './WebhookTester'

const api = vi.hoisted(() => ({ getTester: vi.fn(), setTesterFailing: vi.fn(), sendTesterSample: vi.fn() }))
vi.mock('../api/admin', () => api)
vi.mock('../institution', () => ({ useInstitution: () => ({ slug: 'demo', timezone: 'Asia/Jerusalem' }) }))

const webhook = {
  id: 1,
  url: 'https://getstudyspot.me/api/v1/webhook-tester/1',
  events: ['checkin.started' as const],
  active: true,
  built_in: true,
  created_at: '2026-10-20T08:00:00Z',
}
const hit = {
  id: 5,
  received_at: '2026-10-20T08:30:00Z',
  event_type: 'checkin.started',
  event_id: 'evt_1',
  headers: { 'studyspot-signature': 't=1,v1=ab' },
  body: '{\n  "occupied": 3\n}',
  signature_ok: true,
  answered: 200,
}
const empty: Tester = { webhook, failing: false, hits: [] }

beforeEach(() => {
  vi.clearAllMocks()
  api.sendTesterSample.mockResolvedValue({})
})

describe('WebhookTester', () => {
  it('sends a sample and shows what arrived, with the signature checked', async () => {
    api.getTester.mockResolvedValueOnce(empty).mockResolvedValue({ ...empty, hits: [hit] })
    const user = userEvent.setup()
    render(<WebhookTester />)
    expect(await screen.findByText('עוד לא התקבל כלום.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'לשלוח אירוע לדוגמה' }))
    expect(api.sendTesterSample).toHaveBeenCalledWith('demo')
    const row = await screen.findByRole('listitem', { name: 'התקבל: checkin.started' })
    expect(within(row).getByText('החתימה תקינה ✓')).toBeInTheDocument()
    expect(within(row).getByText(/11:30 · ענה 200/)).toBeInTheDocument()
    expect(within(row).getByText(/"occupied": 3/)).toBeInTheDocument()
  })

  it('a wrong signature says so', async () => {
    api.getTester.mockResolvedValue({ ...empty, hits: [{ ...hit, signature_ok: false }] })
    render(<WebhookTester />)
    expect(await screen.findByText('החתימה שגויה')).toBeInTheDocument()
  })

  it('plays broken, and explains the try again', async () => {
    api.getTester.mockResolvedValueOnce(empty).mockResolvedValue({ ...empty, failing: true })
    api.setTesterFailing.mockResolvedValue({ ...empty, failing: true })
    const user = userEvent.setup()
    render(<WebhookTester />)
    await user.click(await screen.findByRole('button', { name: 'נכשל, 503' }))
    expect(api.setTesterFailing).toHaveBeenCalledWith('demo', true)
    expect(await screen.findByText(/הבודק עונה עכשיו 503/)).toBeInTheDocument()
  })
})
