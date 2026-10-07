import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmButton } from './ConfirmButton'
import { Notice } from './Notice'

describe('ConfirmButton', () => {
  it('asks first, and acts only on the second press', async () => {
    const onConfirm = vi.fn()
    render(<ConfirmButton label="לבטל" confirmLabel="כן, לבטל" onConfirm={onConfirm} />)
    await userEvent.click(screen.getByRole('button', { name: 'לבטל' }))
    expect(onConfirm).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'כן, לבטל' }))
    expect(onConfirm).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'לבטל' })).toBeInTheDocument() // back to the start
  })

  it('"no" puts the first button back without acting', async () => {
    const onConfirm = vi.fn()
    render(<ConfirmButton label="לבטל" confirmLabel="כן, לבטל" onConfirm={onConfirm} />)
    await userEvent.click(screen.getByRole('button', { name: 'לבטל' }))
    await userEvent.click(screen.getByRole('button', { name: 'לא' }))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'כן, לבטל' })).not.toBeInTheDocument()
  })
})

describe('Notice', () => {
  it('announces an error at once, and leaves a warning in place', () => {
    const { rerender } = render(<Notice tone="error">נכשל</Notice>)
    expect(screen.getByRole('alert')).toHaveTextContent('נכשל')
    rerender(<Notice tone="warning">שים לב</Notice>)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
