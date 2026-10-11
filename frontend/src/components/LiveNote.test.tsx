// The "live" mark next to numbers that refresh on their own.

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LiveNote } from './LiveNote'

describe('LiveNote', () => {
  it('says the numbers are live', () => {
    render(<LiveNote simulated={false} />)
    expect(screen.getByText('חי')).toBeInTheDocument()
    expect(screen.queryByText(/מדומה/)).not.toBeInTheDocument()
  })

  it('says when the people counted are made up', () => {
    render(<LiveNote simulated />)
    expect(screen.getByText(/נתוני דמו: נוכחות מדומה/)).toBeInTheDocument()
  })
})
