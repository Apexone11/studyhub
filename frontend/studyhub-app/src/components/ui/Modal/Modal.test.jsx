import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { useRef } from 'react'
import Modal, { ModalFooter } from './Modal'

describe('Modal', () => {
  it('renders nothing when open is false', () => {
    const { container } = render(
      <Modal open={false} onClose={() => {}} ariaLabel="x">
        body
      </Modal>,
    )
    // Portal target is document.body, not container. Verify no dialog anywhere.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(container.firstChild).toBeNull()
  })

  it('renders into a portal on document.body when open', () => {
    render(
      <Modal open onClose={() => {}} ariaLabel="test">
        body content
      </Modal>,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(document.body.contains(dialog)).toBe(true)
  })

  it('renders title and description when provided and wires aria attributes', () => {
    render(
      <Modal open onClose={() => {}} title="Delete exam?" description="This cannot be undone.">
        body
      </Modal>,
    )
    const dialog = screen.getByRole('dialog')
    expect(screen.getByText('Delete exam?')).toBeInTheDocument()
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument()
    expect(dialog).toHaveAttribute('aria-labelledby')
    expect(dialog).toHaveAttribute('aria-describedby')
    // aria-label is NOT set when title is present.
    expect(dialog).not.toHaveAttribute('aria-label')
  })

  it('uses ariaLabel when no title is given', () => {
    render(
      <Modal open onClose={() => {}} ariaLabel="Add exam dialog">
        body
      </Modal>,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-label', 'Add exam dialog')
    expect(dialog).not.toHaveAttribute('aria-labelledby')
  })

  it('fires onClose when the overlay is clicked', () => {
    const onClose = vi.fn()
    render(
      <Modal open onClose={onClose} ariaLabel="x">
        body
      </Modal>,
    )
    // The overlay is the parent of the dialog.
    const overlay = screen.getByRole('dialog').parentElement
    fireEvent.click(overlay)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does NOT fire onClose when clicking inside the modal body', () => {
    const onClose = vi.fn()
    render(
      <Modal open onClose={onClose} ariaLabel="x">
        <div data-testid="body">body</div>
      </Modal>,
    )
    fireEvent.click(screen.getByTestId('body'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('does NOT fire onClose on overlay click when closeOnOverlayClick=false', () => {
    const onClose = vi.fn()
    render(
      <Modal open onClose={onClose} ariaLabel="x" closeOnOverlayClick={false}>
        body
      </Modal>,
    )
    const overlay = screen.getByRole('dialog').parentElement
    fireEvent.click(overlay)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('fires onClose on Escape key', () => {
    const onClose = vi.fn()
    render(
      <Modal open onClose={onClose} ariaLabel="x">
        body
      </Modal>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does NOT fire onClose on Escape when closeOnEscape=false', () => {
    const onClose = vi.fn()
    render(
      <Modal open onClose={onClose} ariaLabel="x" closeOnEscape={false}>
        body
      </Modal>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('close button fires onClose', () => {
    const onClose = vi.fn()
    render(
      <Modal open onClose={onClose} ariaLabel="x">
        body
      </Modal>,
    )
    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('applies the wide size class', () => {
    render(
      <Modal open onClose={() => {}} ariaLabel="x" size="wide">
        body
      </Modal>,
    )
    expect(screen.getByRole('dialog').className).toMatch(/modal--wide/)
  })

  it('locks body scroll while open and restores it on unmount', () => {
    const prev = document.body.style.overflow
    const { unmount } = render(
      <Modal open onClose={() => {}} ariaLabel="x">
        body
      </Modal>,
    )
    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.overflow).toBe(prev)
  })

  it('focuses initialFocusRef on open', () => {
    function Harness() {
      const ref = useRef(null)
      return (
        <Modal open onClose={() => {}} ariaLabel="x" initialFocusRef={ref}>
          <button type="button">first</button>
          <input ref={ref} data-testid="target" />
        </Modal>
      )
    }
    render(<Harness />)
    expect(document.activeElement).toBe(screen.getByTestId('target'))
  })

  it('focuses the first focusable descendant when no initialFocusRef is given', () => {
    render(
      <Modal open onClose={() => {}} ariaLabel="x">
        <button type="button" data-testid="first">
          primary
        </button>
        <button type="button">secondary</button>
      </Modal>,
    )
    // The close button in the header is the first focusable DOM node.
    // Assert focus landed on it (proves auto-focus worked).
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Close dialog')
  })

  it('restores focus to the previously-focused element on close', () => {
    function Harness() {
      return (
        <>
          <button type="button" data-testid="trigger">
            open
          </button>
        </>
      )
    }
    render(<Harness />)
    const trigger = screen.getByTestId('trigger')
    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    const { unmount } = render(
      <Modal open onClose={() => {}} ariaLabel="x">
        body
      </Modal>,
    )
    // Focus moved into the modal.
    expect(document.activeElement).not.toBe(trigger)
    act(() => unmount())
    expect(document.activeElement).toBe(trigger)
  })

  it('ModalFooter forwards ref and renders children', () => {
    const ref = { current: null }
    render(
      <Modal open onClose={() => {}} ariaLabel="x">
        <ModalFooter ref={ref} data-testid="footer">
          <span>btn</span>
        </ModalFooter>
      </Modal>,
    )
    expect(screen.getByTestId('footer')).toBeInTheDocument()
    expect(ref.current).toBeInstanceOf(HTMLDivElement)
    expect(screen.getByText('btn')).toBeInTheDocument()
  })
})
