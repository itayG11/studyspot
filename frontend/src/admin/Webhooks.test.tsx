import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Webhook, WebhookDelivery } from '../api/types'
import { Webhooks } from './Webhooks'

const api = vi.hoisted(() => ({
  getWebhooks: vi.fn(),
  addWebhook: vi.fn(),
  updateWebhook: vi.fn(),
  newWebhookSecret: vi.fn(),
  deleteWebhook: vi.fn(),
  testWebhook: vi.fn(),
  getDeliveries: vi.fn(),
  redeliver: vi.fn(),
}))
vi.mock('../api/admin', () => api)
vi.mock('../institution', () => ({ useInstitution: () => ({ slug: 'braude', timezone: 'Asia/Jerusalem' }) }))

const hook: Webhook = {
  id: 3,
  url: 'https://hooks.example.edu/studyspot',
  events: ['checkin.started', 'checkin.ended'],
  active: true,
  built_in: false,
  created_at: '2026-10-19T08:00:00Z',
}
const failed: WebhookDelivery = {
  id: 9,
  event_id: 'evt_1',
  event_type: 'checkin.started',
  status: 'pending',
  attempts: 1,
  last_status_code: 503,
  last_error: 'HTTP 503',
  created_at: '2026-10-19T08:00:00Z',
  delivered_at: null,
  next_attempt_at: '2026-10-19T08:01:00Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  api.getWebhooks.mockResolvedValue([hook])
  api.getDeliveries.mockResolvedValue([failed])
})

describe('Webhooks', () => {
  it('adds an address with the chosen events and shows its secret once', async () => {
    api.getWebhooks.mockResolvedValueOnce([])
    api.addWebhook.mockResolvedValue({ secret: 'whsec_abc', webhook: hook })
    const user = userEvent.setup()
    render(<Webhooks />)
    await user.type(await screen.findByLabelText('הכתובת, ב-https'), 'https://hooks.example.edu/studyspot')
    await user.click(screen.getByRole('checkbox', { name: /הזמנה בוטלה/ }))
    await user.click(screen.getByRole('button', { name: 'להוסיף כתובת' }))
    expect(api.addWebhook).toHaveBeenCalledWith('braude', 'https://hooks.example.edu/studyspot', [
      'checkin.started',
      'checkin.ended',
      'booking.created',
    ])
    expect(await screen.findByText('whsec_abc')).toBeInTheDocument()
  })

  it('sends a test and says how it went', async () => {
    api.testWebhook.mockResolvedValue({ ...failed, status: 'sent', last_status_code: 200, last_error: null })
    const user = userEvent.setup()
    render(<Webhooks />)
    const row = await screen.findByRole('listitem', { name: `כתובת: ${hook.url}` })
    await user.click(within(row).getByRole('button', { name: 'לשלוח בדיקה' }))
    expect(api.testWebhook).toHaveBeenCalledWith(3)
    expect(await within(row).findByText('הבדיקה הגיעה: הכתובת ענתה 200.')).toBeInTheDocument()
  })

  it('shows the log with the next try, and sends a failed one again', async () => {
    api.redeliver.mockResolvedValue({ ...failed, status: 'sent' })
    const user = userEvent.setup()
    render(<Webhooks />)
    const row = await screen.findByRole('listitem', { name: `כתובת: ${hook.url}` })
    await user.click(within(row).getByText('יומן משלוחים'))
    expect(await within(row).findByText(/ממתין לניסיון הבא/)).toHaveTextContent('11:01')
    expect(within(row).getByText('HTTP 503')).toBeInTheDocument()
    await user.click(within(row).getByRole('button', { name: 'לשלוח שוב' }))
    expect(api.redeliver).toHaveBeenCalledWith(9)
  })

  it('asks before a new secret or deleting, and hides both on the built-in tester', async () => {
    api.newWebhookSecret.mockResolvedValue({ secret: 'whsec_new', webhook: hook })
    const user = userEvent.setup()
    const { unmount } = render(<Webhooks />)
    const row = await screen.findByRole('listitem', { name: `כתובת: ${hook.url}` })
    await user.click(within(row).getByRole('button', { name: 'סוד חדש' }))
    expect(api.newWebhookSecret).not.toHaveBeenCalled()
    await user.click(within(row).getByRole('button', { name: 'כן, הסוד הישן יפסיק לעבוד' }))
    expect(await screen.findByText('whsec_new')).toBeInTheDocument()
    unmount()

    api.getWebhooks.mockResolvedValue([{ ...hook, built_in: true }])
    render(<Webhooks />)
    const builtIn = await screen.findByRole('listitem', { name: `כתובת: ${hook.url}` })
    expect(within(builtIn).getByText('מובנה')).toBeInTheDocument()
    expect(within(builtIn).queryByRole('button', { name: 'למחוק' })).not.toBeInTheDocument()
    expect(within(builtIn).getByRole('button', { name: 'לשלוח בדיקה' })).toBeInTheDocument()
  })
})

describe('Webhooks on the demo campus', () => {
  it('has no form to add an address, and says why', async () => {
    render(<Webhooks demo />)
    expect(await screen.findByText(/בקמפוס ההדגמה אי אפשר להוסיף כתובת/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'להוסיף כתובת' })).not.toBeInTheDocument()
  })
})
