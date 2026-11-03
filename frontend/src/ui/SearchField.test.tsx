import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SearchField } from './SearchField'

describe('SearchField', () => {
  it('without onSubmit the magnifier is only a picture', () => {
    render(<SearchField label="חיפוש מקום" value="" onChange={() => {}} />)
    expect(screen.queryByRole('button', { name: 'חפש' })).not.toBeInTheDocument()
  })

  it('"Enter", the keyboard\'s search key, submits and closes the keyboard', async () => {
    const onSubmit = vi.fn()
    render(<SearchField label="חיפוש מקום" value="שקט" onChange={() => {}} onSubmit={onSubmit} />)
    const box = screen.getByRole('searchbox', { name: 'חיפוש מקום' })
    await userEvent.click(box)
    expect(box).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(box).not.toHaveFocus() // the keyboard is closed, so the results are in view
  })

  it('the magnifier is a "search" button that does the same', async () => {
    const onSubmit = vi.fn()
    render(<SearchField label="חיפוש מקום" value="שקט" onChange={() => {}} onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole('searchbox', { name: 'חיפוש מקום' }))
    await userEvent.click(screen.getByRole('button', { name: 'חפש' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('searchbox', { name: 'חיפוש מקום' })).not.toHaveFocus()
  })
})
