// useAction: one action at a time. The second press can come before React
// draws the button as busy, so the guard is a ref, checked at once.

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/client'
import { useAction } from './useAction'

describe('useAction', () => {
  it('a second run while the first is on its way does nothing', async () => {
    const { result } = renderHook(() => useAction())
    let calls = 0
    let finish = () => {}
    const work = () => {
      calls += 1
      return new Promise<string>((resolve) => (finish = () => resolve('done')))
    }
    let first: Promise<string | undefined> = Promise.resolve(undefined)
    let second: Promise<string | undefined> = Promise.resolve(undefined)
    act(() => {
      first = result.current.run(work)
      second = result.current.run(work) // same tick: before any re-render
    })
    expect(calls).toBe(1)
    await act(async () => finish())
    expect(await first).toBe('done')
    expect(await second).toBeUndefined()
  })

  it('a failure gives its message and code, and the next run may start', async () => {
    const { result } = renderHook(() => useAction())
    await act(async () => {
      await result.current.run(() => Promise.reject(new ApiError(0, 'network_error')))
    })
    expect(result.current.errorCode).toBe('network_error')
    expect(result.current.error).toContain('אין חיבור לשרת')
    let ran = false
    await act(async () => {
      await result.current.run(async () => (ran = true))
    })
    expect(ran).toBe(true)
  })
})
