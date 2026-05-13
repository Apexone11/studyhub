/**
 * AiPermissionDialog.test.jsx — Loop U20 coverage for the universal AI
 * permission gate dialog.
 *
 * Verifies:
 *   - Renders title, summary, preview, details.
 *   - Apply button uses --sh-brand by default, --sh-danger when destructive.
 *   - Esc closes via onReject.
 *   - Backdrop click closes via onReject.
 *   - Tab cycles within the dialog (forward + shift+Tab).
 *   - Initial focus lands on Apply when not destructive.
 *   - Initial focus lands on Reject when destructive.
 *   - Body scroll lock is applied while open, restored on close.
 *   - Previously-focused element regains focus after close.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('../Icons', () => ({
  IconSpark: () => <span data-testid="icon-spark" />,
}))

import AiPermissionDialog from './AiPermissionDialog'

function baseRequest(overrides = {}) {
  return {
    kind: 'sheet.edit',
    title: 'Apply AI edit?',
    summary: 'Hub AI is suggesting changes.',
    preview: <div data-testid="preview-body">Diff preview here</div>,
    destructive: false,
    applyLabel: 'Apply',
    rejectLabel: 'Discard',
    details: { file: 'sheet-10.md', lines: 12 },
    ...overrides,
  }
}

describe('AiPermissionDialog', () => {
  let onAccept
  let onReject

  beforeEach(() => {
    onAccept = vi.fn()
    onReject = vi.fn()
    document.body.style.overflow = ''
  })

  it('renders title, summary, preview, and details', () => {
    render(<AiPermissionDialog request={baseRequest()} onAccept={onAccept} onReject={onReject} />)
    expect(screen.getByText('Apply AI edit?')).toBeInTheDocument()
    expect(screen.getByText(/Hub AI is suggesting changes/i)).toBeInTheDocument()
    expect(screen.getByTestId('preview-body')).toBeInTheDocument()
    // Details rendered as dt/dd pairs.
    expect(screen.getByText(/file:/i)).toBeInTheDocument()
    expect(screen.getByText('sheet-10.md')).toBeInTheDocument()
    expect(screen.getByText(/lines:/i)).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
  })

  it('Apply button uses --sh-brand when not destructive', () => {
    render(<AiPermissionDialog request={baseRequest()} onAccept={onAccept} onReject={onReject} />)
    const apply = screen.getByRole('button', { name: 'Apply' })
    // Inline style uses CSS custom-property token; check the raw attribute.
    expect(apply.style.background).toContain('--sh-brand')
  })

  it('Apply button uses --sh-danger when destructive: true', () => {
    render(
      <AiPermissionDialog
        request={baseRequest({ destructive: true, applyLabel: 'Delete' })}
        onAccept={onAccept}
        onReject={onReject}
      />,
    )
    const apply = screen.getByRole('button', { name: 'Delete' })
    expect(apply.style.background).toContain('--sh-danger')
  })

  it('Esc key closes via onReject', () => {
    render(<AiPermissionDialog request={baseRequest()} onAccept={onAccept} onReject={onReject} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onReject).toHaveBeenCalledTimes(1)
    expect(onAccept).not.toHaveBeenCalled()
  })

  it('backdrop click closes via onReject', () => {
    render(<AiPermissionDialog request={baseRequest()} onAccept={onAccept} onReject={onReject} />)
    // The dialog root has role="dialog" and is the click target for the
    // backdrop. Clicking inside the inner panel must NOT close.
    const dialogRoot = screen.getByRole('dialog')
    fireEvent.click(dialogRoot, { target: dialogRoot })
    expect(onReject).toHaveBeenCalledTimes(1)
  })

  it('clicking inside the panel does NOT close', () => {
    render(<AiPermissionDialog request={baseRequest()} onAccept={onAccept} onReject={onReject} />)
    fireEvent.click(screen.getByText('Apply AI edit?'))
    expect(onReject).not.toHaveBeenCalled()
  })

  it('Tab cycles within the dialog (focus trap forward)', () => {
    render(<AiPermissionDialog request={baseRequest()} onAccept={onAccept} onReject={onReject} />)
    const reject = screen.getByRole('button', { name: 'Discard' })
    const apply = screen.getByRole('button', { name: 'Apply' })
    // Move focus to the last focusable element, then Tab to wrap to first.
    apply.focus()
    expect(document.activeElement).toBe(apply)
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(reject)
  })

  it('Shift+Tab cycles backward (focus trap reverse)', () => {
    render(<AiPermissionDialog request={baseRequest()} onAccept={onAccept} onReject={onReject} />)
    const reject = screen.getByRole('button', { name: 'Discard' })
    const apply = screen.getByRole('button', { name: 'Apply' })
    reject.focus()
    expect(document.activeElement).toBe(reject)
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(apply)
  })

  it('initial focus lands on Apply when not destructive', () => {
    render(<AiPermissionDialog request={baseRequest()} onAccept={onAccept} onReject={onReject} />)
    const apply = screen.getByRole('button', { name: 'Apply' })
    expect(document.activeElement).toBe(apply)
  })

  it('initial focus lands on Reject when destructive: true', () => {
    render(
      <AiPermissionDialog
        request={baseRequest({ destructive: true, applyLabel: 'Delete', rejectLabel: 'Cancel' })}
        onAccept={onAccept}
        onReject={onReject}
      />,
    )
    const reject = screen.getByRole('button', { name: 'Cancel' })
    expect(document.activeElement).toBe(reject)
  })

  it('locks body scroll while open and restores prior overflow on unmount', () => {
    document.body.style.overflow = 'scroll'
    const view = render(
      <AiPermissionDialog request={baseRequest()} onAccept={onAccept} onReject={onReject} />,
    )
    expect(document.body.style.overflow).toBe('hidden')
    view.unmount()
    expect(document.body.style.overflow).toBe('scroll')
  })

  it('returns focus to the previously-focused element after close', () => {
    const trigger = document.createElement('button')
    trigger.textContent = 'Open dialog'
    document.body.appendChild(trigger)
    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    const view = render(
      <AiPermissionDialog request={baseRequest()} onAccept={onAccept} onReject={onReject} />,
    )
    // While open, focus moved to Apply.
    expect(document.activeElement).not.toBe(trigger)
    view.unmount()
    // After close, the previously-focused element regains focus.
    expect(document.activeElement).toBe(trigger)
    document.body.removeChild(trigger)
  })

  it('clicking Apply triggers onAccept; clicking Discard triggers onReject', () => {
    render(<AiPermissionDialog request={baseRequest()} onAccept={onAccept} onReject={onReject} />)
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(onAccept).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(onReject).toHaveBeenCalledTimes(1)
  })
})
