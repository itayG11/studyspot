import { render as baseRender, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import type { LoginRule } from '../api/types'
import { DomainProof } from './DomainProof'
import { itMessage } from './itMessage'

const api = vi.hoisted(() => ({ verifyLoginRule: vi.fn() }))
vi.mock('../api/admin', () => api)
const verify = api.verifyLoginRule

const RULE: LoginRule = {
  id: 9,
  provider: 'email',
  value: 'telhai.ac.il',
  approved: false,
  verify_record: '_studyspot.telhai.ac.il',
  verify_value: 'studyspot-verify=' + 'ab'.repeat(16),
}

beforeEach(() => verify.mockReset())

// The error notice may offer a way out (a link): it needs a router.
const render = (ui: ReactElement) => baseRender(<MemoryRouter>{ui}</MemoryRouter>)

describe('DomainProof', () => {
  it('shows the exact record to add', () => {
    render(<DomainProof rule={RULE} institution="מכללת תל חי" onApproved={() => {}} />)
    expect(screen.getByText('_studyspot.telhai.ac.il')).toBeInTheDocument()
    expect(screen.getByText(RULE.verify_value!)).toBeInTheDocument()
    expect(screen.getByText('TXT')).toBeInTheDocument()
  })

  it('copies a ready message for the IT people, with the record in it', async () => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    render(<DomainProof rule={RULE} institution="מכללת תל חי" onApproved={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'העתקת הודעה למחלקת המחשוב' }))
    const text = writeText.mock.calls[0][0]
    expect(text).toContain('מכללת תל חי')
    expect(text).toContain('Name: _studyspot.telhai.ac.il')
    expect(text).toContain(`Value: ${RULE.verify_value}`)
    expect(screen.getByRole('status')).toHaveTextContent('ההודעה הועתקה')
  })

  it('checks now: approved, the setup reloads', async () => {
    const user = userEvent.setup()
    const approved = vi.fn()
    verify.mockResolvedValue({ ...RULE, approved: true, verify_record: null, verify_value: null })
    render(<DomainProof rule={RULE} institution="מכללת תל חי" onApproved={approved} />)
    await user.click(screen.getByRole('button', { name: 'לבדוק עכשיו' }))
    expect(verify).toHaveBeenCalledWith(9)
    expect(approved).toHaveBeenCalled()
  })

  it('not there yet: says so in Hebrew, and that it can take an hour', async () => {
    const user = userEvent.setup()
    const approved = vi.fn()
    verify.mockRejectedValueOnce(new ApiError(409, 'dns_record_not_found'))
    render(<DomainProof rule={RULE} institution="מכללת תל חי" onApproved={approved} />)
    await user.click(screen.getByRole('button', { name: 'לבדוק עכשיו' }))
    expect(await screen.findByText(/הרשומה עוד לא נמצאה/)).toHaveTextContent('עד שעה')
    expect(approved).not.toHaveBeenCalled()
  })

  it('the message reads well on its own', () => {
    const text = itMessage('מכללת תל חי', 'telhai.ac.il', '_studyspot.telhai.ac.il', 'studyspot-verify=x')
    expect(text.split('\n')[0]).toBe('שלום,')
    expect(text).toContain('Type: TXT')
  })
})
