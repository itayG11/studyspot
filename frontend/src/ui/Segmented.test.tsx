// A row of buttons for one choice, with a mark that slides to the chosen one.

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { MotionProvider } from '../design/MotionProvider'
import { Segmented } from './Segmented'

function Views() {
  const [view, setView] = useState<'list' | 'map'>('list')
  return (
    <MotionProvider>
      <Segmented label="תצוגה" value={view} onChange={setView} options={[{ value: 'list', label: 'רשימה' }, { value: 'map', label: 'מפה' }]} />
      <output>{view}</output>
    </MotionProvider>
  )
}

describe('Segmented', () => {
  it('is a group of pressed or not pressed buttons, named', () => {
    render(<Views />)
    expect(screen.getByRole('group', { name: 'תצוגה' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'רשימה' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'מפה' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('a press chooses, and the mark moves with it', async () => {
    const user = userEvent.setup()
    const { container } = render(<Views />)
    await user.click(screen.getByRole('button', { name: 'מפה' }))
    expect(screen.getByText('map')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'מפה' })).toHaveAttribute('aria-pressed', 'true')
    const marks = container.querySelectorAll('[data-segmented-mark]')
    expect(marks).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'מפה' }).contains(marks[0])).toBe(true)
  })
})
