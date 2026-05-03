// AttachmentPreview.test — covers kind inference + the modal's keyboard /
// backdrop / button-close paths.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import AttachmentPreview, { AttachmentPreviewModal } from './AttachmentPreview'

describe('AttachmentPreview kind inference', () => {
  // The bug Codex flagged: name + space + MIME concat broke
  // `startsWith('image/')` whenever a filename was present. These
  // assertions cover both the extension-derived and the MIME-derived
  // path so a future regression fails the suite. KIND_LABELS returns
  // title-case ("Image", "PDF", "Video", "Audio", "Document", "File");
  // visual uppercasing is CSS-only so the DOM text is title-case.
  it('classifies by file extension when no MIME type is supplied', () => {
    render(<AttachmentPreview attachment={{ url: '/x/photo.png', name: 'photo.png' }} />)
    expect(screen.getByText('Image')).toBeInTheDocument()
  })

  it('classifies by MIME type even when a filename is present', () => {
    // `name='photo'` has no extension — only the MIME tells us this is
    // an image. Pre-fix, this resolved to `other`.
    render(<AttachmentPreview attachment={{ url: 'blob:abc', name: 'photo', type: 'image/png' }} />)
    expect(screen.getByText('Image')).toBeInTheDocument()
  })

  it('classifies PDFs from extension', () => {
    render(<AttachmentPreview attachment={{ url: '/notes/handout.pdf', name: 'handout.pdf' }} />)
    expect(screen.getByText('PDF')).toBeInTheDocument()
  })

  it('classifies videos from MIME type with a non-extension filename', () => {
    render(<AttachmentPreview attachment={{ url: 'blob:abc', name: 'clip', type: 'video/mp4' }} />)
    expect(screen.getByText('Video')).toBeInTheDocument()
  })

  it('falls back to File when nothing matches', () => {
    render(<AttachmentPreview attachment={{ url: '/raw.bin', name: 'raw.bin' }} />)
    expect(screen.getByText('File')).toBeInTheDocument()
  })
})

describe('AttachmentPreviewModal close paths', () => {
  // jsdom doesn't implement requestFullscreen — stub it so toggleFullscreen
  // doesn't throw during render and the test stays focused on close paths.
  Element.prototype.requestFullscreen = vi.fn().mockResolvedValue(undefined)

  it('closes when Escape is pressed', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <AttachmentPreviewModal attachment={{ url: '/x.png', name: 'x.png' }} onClose={onClose} />,
    )
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes when the close button is clicked', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <AttachmentPreviewModal attachment={{ url: '/x.png', name: 'x.png' }} onClose={onClose} />,
    )
    await user.click(screen.getByLabelText('Close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders an <img> for image kind', () => {
    render(
      <AttachmentPreviewModal attachment={{ url: '/x.png', name: 'x.png' }} onClose={() => {}} />,
    )
    const img = screen.getByRole('img', { name: 'x.png' })
    expect(img).toBeInTheDocument()
    expect(img.getAttribute('src')).toBe('/x.png')
  })

  it('renders a sandboxed iframe for PDF kind', () => {
    render(
      <AttachmentPreviewModal
        attachment={{ url: '/handout.pdf', name: 'handout.pdf' }}
        onClose={() => {}}
      />,
    )
    // The modal renders via createPortal(..., document.body), so the
    // render `container` is just an empty wrapper. Query the actual
    // portal target. Both the header filename span and the iframe have
    // title="handout.pdf"; we want the iframe specifically.
    const frame = document.body.querySelector('iframe')
    expect(frame).not.toBeNull()
    expect(frame.getAttribute('title')).toBe('handout.pdf')
    expect(frame.getAttribute('sandbox')).toBe('allow-same-origin')
    expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer')
  })

  it('shows the download CTA when no preview is available', () => {
    render(
      <AttachmentPreviewModal
        attachment={{ url: '/raw.bin', name: 'raw.bin' }}
        onClose={() => {}}
      />,
    )
    expect(screen.getByText('Preview isn’t available for this file type.')).toBeInTheDocument()
    expect(screen.getByText(/Download raw.bin/)).toBeInTheDocument()
  })
})
