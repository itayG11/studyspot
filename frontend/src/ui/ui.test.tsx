import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { MotionProvider } from '../design/MotionProvider'
import { Badge, Button, Chip, EmptyState, ErrorState, SearchField, Sheet, ToastProvider, useToast } from '.'

describe('Button', () => {
  it('runs its action when clicked', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>הזמנה</Button>)
    await userEvent.click(screen.getByRole('button', { name: 'הזמנה' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('stays focusable but ignores clicks while busy', async () => {
    const onClick = vi.fn()
    render(
      <Button busy onClick={onClick}>
        הזמנה
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'הזמנה' })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).toBeEnabled()
    await userEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('does not submit its form while busy', async () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault())
    render(
      <form onSubmit={onSubmit}>
        <input aria-label="שם" />
        <Button type="submit" busy>
          שליחה
        </Button>
      </form>,
    )
    await userEvent.type(screen.getByLabelText('שם'), 'א{Enter}')
    await userEvent.click(screen.getByRole('button', { name: 'שליחה' }))
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe('Chip', () => {
  it('tells assistive technology whether it is on', async () => {
    function Toggle() {
      const [on, setOn] = useState(false)
      return (
        <Chip selected={on} count={4} onClick={() => setOn(!on)}>
          פנוי עכשיו
        </Chip>
      )
    }
    render(<Toggle />)
    const chip = screen.getByRole('button', { name: /פנוי עכשיו/ })
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    expect(chip).toHaveTextContent('4')
  })
})

describe('Badge', () => {
  it('shows words and a shape, not colour alone', () => {
    const { container } = render(<Badge tone="filling">מתמלא</Badge>)
    expect(screen.getByText('מתמלא')).toBeInTheDocument()
    expect(container.querySelector('svg')).toHaveAttribute('data-shape', 'filling')
  })
})

describe('SearchField', () => {
  function Controlled({ onChange }: { onChange?: (v: string) => void }) {
    const [value, setValue] = useState('')
    return (
      <SearchField
        label="חיפוש מקום"
        value={value}
        onChange={(v) => {
          setValue(v)
          onChange?.(v)
        }}
      />
    )
  }

  it('is labelled, and reports each keystroke', async () => {
    const onChange = vi.fn()
    render(<Controlled onChange={onChange} />)
    await userEvent.type(screen.getByRole('searchbox', { name: 'חיפוש מקום' }), 'מעבדה')
    expect(onChange).toHaveBeenLastCalledWith('מעבדה')
  })

  it('clears with one button and keeps the focus in the box', async () => {
    render(<Controlled />)
    const box = screen.getByRole('searchbox', { name: 'חיפוש מקום' })
    expect(screen.queryByRole('button', { name: 'ניקוי החיפוש' })).toBeNull()
    await userEvent.type(box, 'ספרייה')
    await userEvent.click(screen.getByRole('button', { name: 'ניקוי החיפוש' }))
    expect(box).toHaveValue('')
    expect(box).toHaveFocus()
  })
})

describe('Sheet', () => {
  function Host({ onClose }: { onClose: () => void }) {
    const [open, setOpen] = useState(true)
    return (
      <>
        <button type="button" onClick={() => setOpen(false)}>
          סגירה מבחוץ
        </button>
        <Sheet
          open={open}
          title="הזמנת חדר"
          onClose={() => {
            onClose()
            setOpen(false)
          }}
        >
          <p>תוכן</p>
        </Sheet>
      </>
    )
  }

  it('opens as a dialog named by its title', () => {
    render(<Host onClose={vi.fn()} />)
    const dialog = screen.getByRole('dialog', { name: 'הזמנת חדר' })
    expect(dialog).toHaveAttribute('open')
  })

  it('closes from its own button and from the dim area, not from inside', async () => {
    const onClose = vi.fn()
    render(<Host onClose={onClose} />)
    await userEvent.click(screen.getByText('תוכן'))
    expect(onClose).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('dialog', { hidden: true }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('closes from the close button', async () => {
    const onClose = vi.fn()
    render(<Host onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'סגירה' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(screen.getByRole('dialog', { hidden: true })).not.toHaveAttribute('open')
  })

  it('does not report a close the parent asked for', async () => {
    const onClose = vi.fn()
    render(<Host onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'סגירה מבחוץ' }))
    expect(screen.getByRole('dialog', { hidden: true })).not.toHaveAttribute('open')
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('EmptyState and ErrorState', () => {
  it('says what is missing and offers a way out', () => {
    render(<EmptyState title="אין תוצאות" action={<Button>ניקוי הסינון</Button>} />)
    expect(screen.getByRole('heading', { name: 'אין תוצאות' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ניקוי הסינון' })).toBeInTheDocument()
  })

  it('names a lost connection, and retries', async () => {
    const onRetry = vi.fn()
    render(<ErrorState error={new ApiError(0, 'network_error')} onRetry={onRetry} />)
    expect(screen.getByRole('alert')).toHaveTextContent('אין חיבור')
    await userEvent.click(screen.getByRole('button', { name: 'נסה שוב' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('shows the server reason in Hebrew for other errors', () => {
    render(<ErrorState error={new ApiError(500, 'unknown_error')} onRetry={vi.fn()} compact />)
    expect(screen.getByRole('alert')).not.toHaveTextContent('unknown_error')
  })
})

describe('Toast', () => {
  function Trigger({ message, tone }: { message: string; tone?: 'success' | 'error' }) {
    const show = useToast()
    return (
      <button type="button" onClick={() => show(message, tone)}>
        {message}
      </button>
    )
  }

  function renderWithToasts(ui: React.ReactNode) {
    return render(
      <MotionProvider>
        <ToastProvider>{ui}</ToastProvider>
      </MotionProvider>,
    )
  }

  it('announces a message in a live region and closes on request', async () => {
    renderWithToasts(<Trigger message="ההזמנה בוטלה" tone="success" />)
    await userEvent.click(screen.getByRole('button', { name: 'ההזמנה בוטלה' }))
    const list = screen.getByRole('region', { name: 'הודעות' }).querySelector('ol')!
    expect(list).toHaveAttribute('aria-live', 'polite')
    expect(list).toHaveTextContent('ההזמנה בוטלה')
    await userEvent.click(screen.getByRole('button', { name: 'סגירת ההודעה' }))
    await vi.waitFor(() => expect(list).not.toHaveTextContent('ההזמנה בוטלה'))
  })

  it('goes away by itself after a few seconds', async () => {
    // Only the timers are faked; the exit animation runs on real frames.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      renderWithToasts(<Trigger message="נשמר" />)
      act(() => screen.getByRole('button', { name: 'נשמר' }).click())
      const list = screen.getByRole('region', { name: 'הודעות' }).querySelector('ol')!
      expect(list).toHaveTextContent('נשמר')
      await act(() => vi.advanceTimersByTimeAsync(4000))
      expect(list).toHaveTextContent('נשמר')
      await act(() => vi.advanceTimersByTimeAsync(1000))
      vi.useRealTimers()
      await vi.waitFor(() => expect(list).not.toHaveTextContent('נשמר'))
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps at most three messages', () => {
    renderWithToasts(<Trigger message="הודעה" />)
    const button = screen.getByRole('button', { name: 'הודעה' })
    for (let i = 0; i < 5; i++) act(() => button.click())
    expect(screen.getAllByRole('button', { name: 'סגירת ההודעה' })).toHaveLength(3)
  })

  it('needs its provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Trigger message="x" />)).toThrow(/ToastProvider/)
    vi.restoreAllMocks()
  })
})
