import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createRef } from 'react'
import Button from './Button'

describe('Button', () => {
  it('renders children', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument()
  })

  it('applies the default primary + md variant classes', () => {
    render(<Button>x</Button>)
    const btn = screen.getByRole('button')
    expect(btn.className).toMatch(/btn--primary/)
    expect(btn.className).toMatch(/btn--md/)
  })

  it('applies a different variant class when passed', () => {
    const { rerender } = render(<Button variant="secondary">x</Button>)
    expect(screen.getByRole('button').className).toMatch(/btn--secondary/)
    rerender(<Button variant="ghost">x</Button>)
    expect(screen.getByRole('button').className).toMatch(/btn--ghost/)
    rerender(<Button variant="danger">x</Button>)
    expect(screen.getByRole('button').className).toMatch(/btn--danger/)
  })

  it('applies each size class', () => {
    const { rerender } = render(<Button size="sm">x</Button>)
    expect(screen.getByRole('button').className).toMatch(/btn--sm/)
    rerender(<Button size="lg">x</Button>)
    expect(screen.getByRole('button').className).toMatch(/btn--lg/)
  })

  it('applies the fullWidth class when requested', () => {
    render(<Button fullWidth>x</Button>)
    expect(screen.getByRole('button').className).toMatch(/btn--fullWidth/)
  })

  it('disables the button when disabled prop is true', () => {
    render(<Button disabled>x</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('disables the button when loading', () => {
    render(<Button loading>x</Button>)
    const btn = screen.getByRole('button')
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('aria-busy', 'true')
    expect(btn.className).toMatch(/btn--loading/)
  })

  it('preserves the accessible name while loading (label stays in the a11y tree)', () => {
    // Regression test for a bug caught in review: visibility:hidden on
    // the label during loading would remove it from the accessibility
    // tree, leaving the button with no accessible name (the spinner is
    // aria-hidden). We now use opacity+pointer-events to keep the name
    // intact. Verified here by asserting getByRole('button', { name })
    // still finds the button during loading.
    render(<Button loading>Save changes</Button>)
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument()
  })

  it('forwards ref to the underlying <button>', () => {
    const ref = createRef()
    render(<Button ref={ref}>x</Button>)
    expect(ref.current).toBeInstanceOf(HTMLButtonElement)
  })

  it('passes through HTML props (data-testid, aria-label)', () => {
    render(
      <Button data-testid="submit-btn" aria-label="Submit form">
        x
      </Button>,
    )
    const btn = screen.getByTestId('submit-btn')
    expect(btn).toHaveAttribute('aria-label', 'Submit form')
  })

  it('forwards the type prop (defaults to button)', () => {
    const { rerender } = render(<Button>x</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
    rerender(<Button type="submit">x</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit')
  })

  it('calls onClick when clicked', () => {
    const handler = vi.fn()
    render(<Button onClick={handler}>x</Button>)
    screen.getByRole('button').click()
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('does not call onClick when disabled', () => {
    const handler = vi.fn()
    render(
      <Button onClick={handler} disabled>
        x
      </Button>,
    )
    screen.getByRole('button').click()
    expect(handler).not.toHaveBeenCalled()
  })

  it('renders leftIcon and rightIcon when supplied', () => {
    render(
      <Button leftIcon={<span data-testid="lhs" />} rightIcon={<span data-testid="rhs" />}>
        label
      </Button>,
    )
    expect(screen.getByTestId('lhs')).toBeInTheDocument()
    expect(screen.getByTestId('rhs')).toBeInTheDocument()
  })

  it('merges a consumer-provided className with its own classes', () => {
    render(<Button className="my-custom">x</Button>)
    const btn = screen.getByRole('button')
    expect(btn.className).toMatch(/btn--primary/)
    expect(btn.className).toMatch(/my-custom/)
  })
})
