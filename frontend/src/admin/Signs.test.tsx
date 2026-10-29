import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlaceCode } from '../api/types'
import { Signs } from './Signs'

const api = vi.hoisted(() => ({
  getCodes: vi.fn(),
  revokeCode: vi.fn(),
  setCheckInMode: vi.fn(),
  makeScreenLink: vi.fn(),
  removeScreenLink: vi.fn(),
}))
vi.mock('../api/admin', () => api)
vi.mock('../institution', () => ({ useInstitution: () => ({ slug: 'demo', timezone: 'Asia/Jerusalem' }) }))
vi.mock('./useQrImage', () => ({ useQrImage: () => 'data:image/png;base64,AAAA' }))

const code = (suffix: string): string => `p18.v1.${suffix.repeat(43)}`
const sign: PlaceCode = {
  place_id: 18, building_code: 'EF', place_name: 'ספרייה', code: code('A'),
  check_in_mode: 'sign', screen_active: false, screen_last_seen_at: null, suspected_shared: false,
}

beforeEach(() => vi.clearAllMocks())

describe('Signs', () => {
  it('marks a printed sign whose photo may be going round, and not a quiet one, and drops the mark once the code is replaced', async () => {
    const user = userEvent.setup()
    api.getCodes.mockResolvedValue([{ ...sign, suspected_shared: true }, { ...sign, place_id: 19, place_name: 'מעבדה', suspected_shared: false }])
    api.revokeCode.mockResolvedValue({ ...sign, code: code('B'), suspected_shared: false })

    render(<MemoryRouter><Signs /></MemoryRouter>)
    const flagged = await screen.findByRole('listitem', { name: /ספרייה/ })
    expect(flagged).toHaveTextContent('חשד: ייתכן שהקוד משותף. כדאי להחליף אותו.')
    expect(screen.getByRole('listitem', { name: /מעבדה/ })).not.toHaveTextContent('חשד')

    const [revoke] = screen.getAllByRole('button', { name: 'לבטל את הקוד' })
    await user.click(revoke!)
    await user.click(screen.getByRole('button', { name: 'כן, קוד חדש' }))
    expect(await screen.findByText(/קוד חדש. השלט הישן כבר לא עובד/)).toBeInTheDocument()
    expect(screen.queryByText(/חשד: ייתכן/)).toBeNull()
  })

  it('a place switched to a screen, its code revoked, and switched back, ends on a sign with the new code', async () => {
    const user = userEvent.setup()
    api.getCodes.mockResolvedValue([sign])
    api.setCheckInMode
      .mockResolvedValueOnce({ ...sign, check_in_mode: 'screen' })
      .mockResolvedValueOnce({ ...sign, code: code('B'), check_in_mode: 'sign' })
    api.revokeCode.mockResolvedValue({ ...sign, code: code('B'), check_in_mode: 'screen' })

    render(<MemoryRouter><Signs /></MemoryRouter>)
    const card = (await screen.findByRole('listitem', { name: /ספרייה/ }))
    expect(await screen.findByAltText('קוד QR לכניסה לספרייה')).toBeInTheDocument()

    // To a screen: the sign has nothing to print.
    await user.click(screen.getByRole('button', { name: 'מסך' }))
    await user.click(screen.getByRole('button', { name: 'כן, לעבור' }))
    expect(await screen.findByText('נכנסים עם הקוד שעל המסך ליד הדלת')).toBeInTheDocument()
    expect(screen.queryByAltText('קוד QR לכניסה לספרייה')).toBeNull()

    // Revoking while on a screen: still a screen, with the new-code note for a screen.
    await user.click(screen.getByRole('button', { name: 'לבטל את הקוד' }))
    await user.click(screen.getByRole('button', { name: 'כן, קוד חדש' }))
    expect(await screen.findByText('קוד חדש. המסך עובר אליו לבד, ואין מה להדפיס.')).toBeInTheDocument()
    expect(screen.getByText('נכנסים עם הקוד שעל המסך ליד הדלת')).toBeInTheDocument()
    expect(api.revokeCode).toHaveBeenCalledWith(18)

    // Back to a printed sign: the QR returns, and the note now says to print the new one.
    await user.click(screen.getByRole('button', { name: 'שלט מודפס' }))
    await user.click(screen.getByRole('button', { name: 'כן, לעבור' }))
    expect(await screen.findByAltText('קוד QR לכניסה לספרייה')).toBeInTheDocument()
    expect(screen.getByText('קוד חדש. השלט הישן כבר לא עובד, צריך להדפיס את זה.')).toBeInTheDocument()
    expect(card).toHaveTextContent('סרקו כדי להיכנס')
    expect(api.setCheckInMode).toHaveBeenNthCalledWith(2, 18, 'sign')
  })
})
