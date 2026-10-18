import { afterEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ unsubscribePush: vi.fn(() => Promise.resolve()) }))
vi.mock('../api/student', () => api)

import { forgetPushHere } from './pushDevice'

function withWorker(subscription: unknown) {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { getRegistration: () => Promise.resolve({ pushManager: { getSubscription: () => Promise.resolve(subscription) } }) },
  })
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'serviceWorker')
  vi.clearAllMocks()
})

describe('signing out forgets push on this browser', () => {
  it('the server and the browser both drop the subscription', async () => {
    const sub = { endpoint: 'https://fcm.googleapis.com/x', unsubscribe: vi.fn(() => Promise.resolve(true)) }
    withWorker(sub)
    await forgetPushHere()
    expect(api.unsubscribePush).toHaveBeenCalledWith(sub.endpoint)
    expect(sub.unsubscribe).toHaveBeenCalled()
  })

  it('the browser drops it even when the server cannot be reached', async () => {
    api.unsubscribePush.mockRejectedValueOnce(new Error('offline'))
    const sub = { endpoint: 'https://fcm.googleapis.com/x', unsubscribe: vi.fn(() => Promise.resolve(true)) }
    withWorker(sub)
    await forgetPushHere()
    expect(sub.unsubscribe).toHaveBeenCalled()
  })

  it('nothing to do without a subscription, or without service workers', async () => {
    withWorker(null)
    await expect(forgetPushHere()).resolves.toBeUndefined()
    Reflect.deleteProperty(navigator, 'serviceWorker')
    await expect(forgetPushHere()).resolves.toBeUndefined()
    expect(api.unsubscribePush).not.toHaveBeenCalled()
  })
})
