/**
 * AttachmentSlideshow.test.jsx — paging contract for multi-attachment posts.
 *
 * The single-attachment case must stay visually identical to the pre-
 * multi-attachment card, so the arrows/counter only appear from two files up.
 */
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import AttachmentSlideshow from '../AttachmentSlideshow'

const THREE = [
  { id: 1, name: 'week1.pdf', type: 'pdf', sizeBytes: 1024, position: 0 },
  { id: 2, name: 'chart.png', type: 'image', sizeBytes: 2048, position: 1 },
  { id: 3, name: 'data.json', type: 'text', sizeBytes: 512, position: 2 },
]

afterEach(() => {
  cleanup()
})

describe('AttachmentSlideshow', () => {
  it('renders nothing when there are no attachments', () => {
    const { container } = render(<AttachmentSlideshow postId={7} attachments={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('hides paging chrome for a single attachment', () => {
    render(<AttachmentSlideshow postId={7} attachments={[THREE[0]]} />)
    expect(screen.queryByRole('button', { name: /next attachment/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /previous attachment/i })).not.toBeInTheDocument()
    expect(screen.queryByText('1 / 1')).not.toBeInTheDocument()
  })

  it('shows arrows and a counter for multiple attachments', () => {
    render(<AttachmentSlideshow postId={7} attachments={THREE} />)
    expect(screen.getByRole('button', { name: /next attachment/i })).toBeInTheDocument()
    expect(screen.getByText('1 / 3')).toBeInTheDocument()
    expect(screen.getByText('week1.pdf')).toBeInTheDocument()
  })

  it('advances and wraps with the arrow controls', async () => {
    const user = userEvent.setup()
    render(<AttachmentSlideshow postId={7} attachments={THREE} />)

    await user.click(screen.getByRole('button', { name: /next attachment/i }))
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
    expect(screen.getByText('chart.png')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /previous attachment/i }))
    expect(screen.getByText('1 / 3')).toBeInTheDocument()

    // Wrapping backwards from the first slide lands on the last.
    await user.click(screen.getByRole('button', { name: /previous attachment/i }))
    expect(screen.getByText('3 / 3')).toBeInTheDocument()
    expect(screen.getByText('data.json')).toBeInTheDocument()
  })
})
