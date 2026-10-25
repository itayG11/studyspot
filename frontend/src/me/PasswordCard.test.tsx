import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Me } from '../api/types'
import { PasswordCard } from './PasswordCard'

const auth = {
  user: null as Me | null,
  emailStart: vi.fn(async () => 1200),
  emailVerify: vi.fn(),
  passwordSet: vi.fn(async () => {}),
}
vi.mock('../auth/AuthContext', () => ({ useAuth: () => auth }))

const NOA: Me = {
  id: 1,
  email: 'noa@e.braude.ac.il',
  display_name: 'נועה',
  role: 'student',
  institution_slug: 'braude',
  is_demo: false,
  has_password: false,
  can_set_password: true,
}

beforeEach(() => {
  auth.user = NOA
  vi.clearAllMocks()
})

describe('PasswordCard', () => {
  it('sets one with a code to the account address, and says the other devices were signed out', async () => {
    render(<PasswordCard />)
    await userEvent.click(screen.getByRole('button', { name: 'להגדיר סיסמה' }))
    expect(screen.queryByLabelText('כתובת המייל של המכללה')).not.toBeInTheDocument()
    expect(screen.getByText(/הקוד יישלח אל/)).toHaveTextContent('noa@e.braude.ac.il')
    await userEvent.click(screen.getByRole('button', { name: 'שליחת קוד' }))
    expect(auth.emailStart).toHaveBeenCalledWith('noa@e.braude.ac.il')
    await userEvent.type(await screen.findByLabelText('הקוד מהמייל'), '123456')
    await userEvent.type(screen.getByLabelText('סיסמה חדשה'), 'Kfar-Tavor 7 rain')
    await userEvent.click(screen.getByRole('button', { name: 'שמירת הסיסמה' }))
    expect(auth.passwordSet).toHaveBeenCalledWith('noa@e.braude.ac.il', '123456', 'Kfar-Tavor 7 rain')
    expect(await screen.findByRole('status')).toHaveTextContent('הסיסמה נשמרה. שאר המכשירים נותקו.')
  })

  it('offers to change one that exists', () => {
    auth.user = { ...NOA, has_password: true }
    render(<PasswordCard />)
    expect(screen.getByRole('button', { name: 'להחליף או לאפס סיסמה' })).toBeInTheDocument()
  })

  it('is not there without a code sign-in, or for the shared demo student', () => {
    auth.user = { ...NOA, can_set_password: false }
    const { container, rerender } = render(<PasswordCard />)
    expect(container).toBeEmptyDOMElement()
    auth.user = { ...NOA, is_demo: true }
    rerender(<PasswordCard />)
    expect(container).toBeEmptyDOMElement()
  })
})
