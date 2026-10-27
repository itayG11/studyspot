import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildReport, createReporter, installErrorReporting, sendReport } from './errorReport'

describe('buildReport', () => {
  it('takes the message and the stack of an error, and the page path only', () => {
    window.history.pushState({}, '', '/demo/spaces/3?code=123456#x')
    const error = new Error('x is not a function')
    expect(buildReport(error)).toEqual({ message: 'x is not a function', stack: error.stack, path: '/demo/spaces/3' })
  })

  it('cuts a long message and a long stack to what the server accepts', () => {
    const error = new Error('m'.repeat(900))
    error.stack = 's'.repeat(9000)
    const report = buildReport(error)
    expect(report.message).toHaveLength(500)
    expect(report.stack).toHaveLength(4000)
  })

  it('accepts a thrown string, and something that is not an error at all', () => {
    expect(buildReport('boom').message).toBe('boom')
    expect(buildReport(undefined).message).toBe('שגיאה לא ידועה')
    expect(buildReport({ weird: true }).message).toBe('שגיאה לא ידועה')
  })

  it('never sends an empty message', () => {
    expect(buildReport(new Error('')).message).toBe('שגיאה לא ידועה')
  })
})

describe('createReporter', () => {
  it('sends one report per message', () => {
    const send = vi.fn()
    const report = createReporter(send)
    report(new Error('a'))
    report(new Error('a'))
    report(new Error('b'))
    expect(send.mock.calls.map(([r]) => r.message)).toEqual(['a', 'b'])
  })

  it('stops after five reports in one page load, so a loop cannot flood the server', () => {
    const send = vi.fn()
    const report = createReporter(send)
    for (let i = 0; i < 20; i++) report(new Error(`e${i}`))
    expect(send).toHaveBeenCalledTimes(5)
  })

  it('leaves out noise that says nothing', () => {
    const send = vi.fn()
    const report = createReporter(send)
    report(new Error('ResizeObserver loop completed with undelivered notifications.'))
    report('Script error.') // a script from another address: the browser hides what happened
    expect(send).not.toHaveBeenCalled()
  })

  it('is never the cause of another error', () => {
    const report = createReporter(() => {
      throw new Error('send failed')
    })
    expect(() => report(new Error('a'))).not.toThrow()
  })
})

describe('installErrorReporting', () => {
  it('reports an error and a refused promise from the window, and stops when asked', () => {
    const send = vi.fn()
    const stop = installErrorReporting(createReporter(send))
    window.dispatchEvent(new ErrorEvent('error', { message: 'from window', error: new Error('from window') }))
    const rejection = new Event('unhandledrejection')
    Object.assign(rejection, { reason: new Error('refused') })
    window.dispatchEvent(rejection)
    expect(send.mock.calls.map(([r]) => r.message)).toEqual(['from window', 'refused'])
    stop()
    // Nobody listens any more, so the test runner would call this one an uncaught error: say it is handled.
    const handled = (event: Event) => event.preventDefault()
    window.addEventListener('error', handled)
    window.dispatchEvent(new ErrorEvent('error', { message: 'after', error: new Error('after'), cancelable: true }))
    window.removeEventListener('error', handled)
    expect(send).toHaveBeenCalledTimes(2)
  })
})

describe('sendReport', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('posts the report to our own server, without cookies', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    sendReport({ message: 'm', stack: 's', path: '/p' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('http://localhost:8000/client-errors')
    expect(options).toMatchObject({ method: 'POST', credentials: 'omit', keepalive: true })
    expect(JSON.parse(options.body)).toEqual({ message: 'm', stack: 's', path: '/p' })
  })

  it('swallows a refused or failed request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    expect(() => sendReport({ message: 'm', path: '/p' })).not.toThrow()
    await Promise.resolve()
  })
})
