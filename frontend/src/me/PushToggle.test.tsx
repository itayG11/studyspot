import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PushToggle } from './PushToggle'

const device = vi.hoisted(() => ({
  currentSubscription: vi.fn(),
  subscribeDevice: vi.fn(),
  permission: vi.fn(),
  askPermission: vi.fn(),
}))
vi.mock('./pushDevice', () => device)

const api = vi.hoisted(() => ({
  pushKey: vi.fn(() => Promise.resolve({ key: 'BAEC' })),
  subscribePush: vi.fn(() => Promise.resolve()),
  unsubscribePush: vi.fn(() => Promise.resolve()),
  testPush: vi.fn(() => Promise.resolve({ delivered: 1 })),
}))
vi.mock('../api/student', () => api)

const support = vi.hoisted(() => ({ value: 'supported' }))
vi.mock('../logic/push', async (original) => ({
  ...(await original<typeof import('../logic/push')>()),
  pushSupport: () => support.value,
}))

const subscription = (endpoint = 'https://fcm.googleapis.com/fcm/send/x') => ({
  endpoint,
  toJSON: () => ({ endpoint, keys: { p256dh: 'p', auth: 'a' } }),
  unsubscribe: vi.fn(() => Promise.resolve(true)),
})

beforeEach(() => {
  vi.clearAllMocks()
  support.value = 'supported'
  device.permission.mockReturnValue('default')
  device.currentSubscription.mockResolvedValue(null)
})

describe('notifications on this device', () => {
  it('turns on: asks permission, subscribes with the server key, and tells the server', async () => {
    device.askPermission.mockResolvedValue('granted')
    const sub = subscription()
    device.subscribeDevice.mockResolvedValue(sub)
    render(<PushToggle isDemo={false} />)
    await userEvent.click(await screen.findByRole('button', { name: 'להפעיל התראות' }))
    await screen.findByText('ההתראות פועלות במכשיר הזה.')
    expect(Array.from(device.subscribeDevice.mock.calls[0][0] as Uint8Array)).toEqual([4, 1, 2])
    expect(api.subscribePush).toHaveBeenCalledWith(sub.toJSON())
  })

  it('a refused permission says how to change it, and subscribes nothing', async () => {
    device.askPermission.mockResolvedValue('denied')
    render(<PushToggle isDemo={false} />)
    await userEvent.click(await screen.findByRole('button', { name: 'להפעיל התראות' }))
    expect(await screen.findByText(/חסומות בהגדרות הדפדפן/)).toBeInTheDocument()
    expect(device.subscribeDevice).not.toHaveBeenCalled()
  })

  it('when on: a test notification, and turning off removes it here and on the server', async () => {
    const sub = subscription()
    device.currentSubscription.mockResolvedValue(sub)
    device.permission.mockReturnValue('granted')
    render(<PushToggle isDemo={false} />)
    await userEvent.click(await screen.findByRole('button', { name: 'לשלוח התראת ניסיון' }))
    expect(await screen.findByText(/נשלחה התראת ניסיון/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'לכבות התראות' }))
    await screen.findByRole('button', { name: 'להפעיל התראות' })
    expect(api.unsubscribePush).toHaveBeenCalledWith(sub.endpoint)
    expect(sub.unsubscribe).toHaveBeenCalled()
  })

  it('an iPhone in a Safari tab is told to add the site to the home screen first', async () => {
    support.value = 'needs-install'
    render(<PushToggle isDemo={false} />)
    expect(await screen.findByText(/רק אחרי הוספה למסך הבית/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'להפעיל התראות' })).not.toBeInTheDocument()
  })

  it('a browser without push says so', async () => {
    support.value = 'unsupported'
    render(<PushToggle isDemo={false} />)
    expect(await screen.findByText(/לא תומך בהתראות/)).toBeInTheDocument()
  })

  it('the shared demo student is told why there are none', async () => {
    render(<PushToggle isDemo />)
    expect(await screen.findByText(/כל המבקרים חולקים אותו/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('a server refusal is shown, and the browser subscription is undone', async () => {
    device.askPermission.mockResolvedValue('granted')
    const sub = subscription()
    device.subscribeDevice.mockResolvedValue(sub)
    const { ApiError } = await import('../api/client')
    api.subscribePush.mockRejectedValueOnce(new ApiError(409, 'push_too_many'))
    render(<PushToggle isDemo={false} />)
    await userEvent.click(await screen.findByRole('button', { name: 'להפעיל התראות' }))
    expect(await screen.findByText(/בחמישה מכשירים/)).toBeInTheDocument()
    await waitFor(() => expect(sub.unsubscribe).toHaveBeenCalled())
  })
})
