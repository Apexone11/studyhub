/**
 * PendingButton.test.jsx — Vitest coverage for the async-aware button.
 *
 * Verifies:
 *   - Disables on `pending=true` AND independent `disabled=true`.
 *   - Sets aria-busy="true" only when pending (a11y for screen readers).
 *   - Swaps children for `pendingLabel` when both are set + pending.
 *   - Keeps children visible when pending but no pendingLabel (icon button).
 *   - Forwards arbitrary props (onClick, aria-label, data-*) to the button.
 *   - Type defaults to "button" (prevents accidental form submit).
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PendingButton from './PendingButton'

describe('PendingButton', () => {
  it('renders children as the button label by default', () => {
    render(<PendingButton>Save</PendingButton>)
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy()
  })

  it('defaults type="button" so it doesn\'t submit forms accidentally', () => {
    render(<PendingButton>Save</PendingButton>)
    const btn = screen.getByRole('button')
    expect(btn.getAttribute('type')).toBe('button')
  })

  it('disables the button when pending=true', () => {
    render(<PendingButton pending>Save</PendingButton>)
    expect(screen.getByRole('button').hasAttribute('disabled')).toBe(true)
  })

  it('disables the button when disabled=true (independent of pending)', () => {
    render(<PendingButton disabled>Save</PendingButton>)
    expect(screen.getByRole('button').hasAttribute('disabled')).toBe(true)
  })

  it('sets aria-busy="true" only when pending', () => {
    const { rerender } = render(<PendingButton>Save</PendingButton>)
    expect(screen.getByRole('button').getAttribute('aria-busy')).toBeNull()
    rerender(<PendingButton pending>Save</PendingButton>)
    expect(screen.getByRole('button').getAttribute('aria-busy')).toBe('true')
  })

  it('swaps label to pendingLabel when both pending and pendingLabel are set', () => {
    render(
      <PendingButton pending pendingLabel="Saving…">
        Save
      </PendingButton>,
    )
    // Saving… is visible; Save is gone
    expect(screen.queryByText('Saving…')).toBeTruthy()
    expect(screen.queryByText('Save')).toBeNull()
  })

  it('keeps children visible when pending but no pendingLabel (icon-only button)', () => {
    render(<PendingButton pending>★</PendingButton>)
    expect(screen.queryByText('★')).toBeTruthy()
  })

  it('does not fire onClick when pending', () => {
    const onClick = vi.fn()
    render(
      <PendingButton pending onClick={onClick}>
        Save
      </PendingButton>,
    )
    fireEvent.click(screen.getByRole('button'))
    // Disabled buttons swallow clicks at the DOM level
    expect(onClick).not.toHaveBeenCalled()
  })

  it('fires onClick normally when not pending', () => {
    const onClick = vi.fn()
    render(<PendingButton onClick={onClick}>Save</PendingButton>)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('forwards arbitrary props through to the button (aria-label, data-*)', () => {
    render(
      <PendingButton aria-label="Save profile" data-testid="save-btn">
        Save
      </PendingButton>,
    )
    const btn = screen.getByTestId('save-btn')
    expect(btn.getAttribute('aria-label')).toBe('Save profile')
  })
})
