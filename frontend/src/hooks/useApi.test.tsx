import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { resetActivityForTests } from '../logic/idle'
import { useApi } from './useApi'

function Probe({ load, id, refreshMs }: { load: (id: string) => Promise<string>; id: string | null; refreshMs?: number }) {
  const state = useApi(() => load(id!), id === null ? null : `item-${id}`, refreshMs)
  return (
    <p>
      {state.loading ? 'loading' : 'ready'}|{state.data ?? '-'}|{state.error?.code ?? '-'}
    </p>
  )
}

const text = () => screen.getByText(/\|/).textContent

beforeEach(() => {
  vi.useFakeTimers()
  resetActivityForTests()
})
afterEach(() => vi.useRealTimers())

describe('useApi', () => {
  it('stops refreshing after 15 minutes with no one at the page, and starts again at once on a key', async () => {
    // A tab left open must not keep the database awake all night.
    const load = vi.fn().mockResolvedValue('x')
    render(<Probe load={load} id="1" refreshMs={30_000} />)
    await act(() => vi.advanceTimersByTimeAsync(16 * 60_000))
    const calls = load.mock.calls.length
    expect(calls).toBeLessThanOrEqual(31) // the first load and up to 15 minutes of refreshes
    await act(() => vi.advanceTimersByTimeAsync(10 * 60_000))
    expect(load).toHaveBeenCalledTimes(calls)
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown'))
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(load).toHaveBeenCalledTimes(calls + 1) // fresh numbers, no wait
  })

  it('loads, then refreshes on the interval', async () => {
    const load = vi.fn().mockResolvedValueOnce('one').mockResolvedValueOnce('two')
    render(<Probe load={load} id="1" refreshMs={1000} />)
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(text()).toBe('ready|one|-')
    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(text()).toBe('ready|two|-')
  })

  it('keeps the data on screen when one refresh fails', async () => {
    const load = vi.fn().mockResolvedValueOnce('one').mockRejectedValueOnce(new ApiError(0, 'network_error'))
    render(<Probe load={load} id="1" refreshMs={1000} />)
    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(text()).toBe('ready|one|network_error')
  })

  it('drops the old data at once when the key changes', async () => {
    let finishSecond: (v: string) => void = () => {}
    const load = vi
      .fn()
      .mockResolvedValueOnce('first page')
      .mockReturnValueOnce(new Promise<string>((resolve) => (finishSecond = resolve)))
    const { rerender } = render(<Probe load={load} id="1" />)
    await act(() => vi.advanceTimersByTimeAsync(0))
    rerender(<Probe load={load} id="2" />)
    expect(text()).toBe('loading|-|-') // never the first page's data under the second address
    await act(async () => finishSecond('second page'))
    expect(text()).toBe('ready|second page|-')
  })

  it('does not start a refresh while the last one is still on its way', async () => {
    const load = vi.fn(() => new Promise<string>(() => {})) // never answers
    render(<Probe load={load} id="1" refreshMs={1000} />)
    await act(() => vi.advanceTimersByTimeAsync(5000))
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('loads nothing for a null key', async () => {
    const load = vi.fn()
    render(<Probe load={load} id={null} refreshMs={1000} />)
    await act(() => vi.advanceTimersByTimeAsync(3000))
    expect(load).not.toHaveBeenCalled()
    expect(text()).toBe('ready|-|-')
  })
})
