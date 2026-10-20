import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { EmbedCode } from './EmbedCode'

vi.mock('../api/campus', () => ({ getBuildings: vi.fn().mockResolvedValue([{ id: 1, code: 'L', name: 'ספרייה' }]) }))
vi.mock('../institution', () => ({ useInstitution: () => ({ slug: 'braude' }) }))
vi.mock('../config', () => ({ SITE_URL: 'https://getstudyspot.me' }))

describe('EmbedCode', () => {
  it('builds the iframe code from the choices and shows the same page in the preview', async () => {
    const user = userEvent.setup()
    render(<EmbedCode />)
    await user.selectOptions(await screen.findByLabelText('בניין'), 'L')
    await user.click(screen.getByRole('button', { name: 'כהה' }))
    const address = 'https://getstudyspot.me/embed/braude?building=L&amp;theme=dark'
    expect(screen.getByText(/<iframe src=/).innerHTML).toContain(address)
    expect(screen.getByTitle("תצוגה מקדימה של הווידג'ט")).toHaveAttribute(
      'src',
      'https://getstudyspot.me/embed/braude?building=L&theme=dark',
    )
  })
})
