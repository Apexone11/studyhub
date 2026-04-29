import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ContentPane } from './ContentPreviewModal'

describe('ContentPane attachments', () => {
  it('renders image attachments from backend MIME type through the API origin', () => {
    render(
      <ContentPane
        preview={{
          attachments: [{ type: 'image/png', url: '/api/posts/1/attachment/preview' }],
        }}
      />,
    )

    expect(screen.getByRole('img', { name: 'Attachment' })).toHaveAttribute(
      'src',
      'http://localhost:4000/api/posts/1/attachment/preview',
    )
  })

  it('renders PDF previews only from backend-relative URLs', () => {
    const { rerender } = render(
      <ContentPane
        preview={{
          attachments: [{ type: 'application/pdf', url: '/api/sheets/2/attachment/preview' }],
        }}
      />,
    )

    expect(screen.getByTitle('PDF Preview')).toHaveAttribute(
      'src',
      'http://localhost:4000/api/sheets/2/attachment/preview',
    )

    rerender(
      <ContentPane
        preview={{
          attachments: [{ type: 'application/pdf', url: 'https://evil.example.com/file.pdf' }],
        }}
      />,
    )

    expect(screen.queryByTitle('PDF Preview')).toBeNull()
  })
})
