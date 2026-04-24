import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import Input from './Input'

describe('Input', () => {
  it('renders a text input by default', () => {
    render(<Input aria-label="name" />)
    const el = screen.getByRole('textbox', { name: /name/i })
    expect(el).toBeInTheDocument()
    expect(el.tagName).toBe('INPUT')
    expect(el).toHaveAttribute('type', 'text')
  })

  it('renders with a label linked by id', () => {
    render(<Input label="Email" id="email-field" />)
    const label = screen.getByText('Email')
    const input = screen.getByLabelText('Email')
    expect(label).toHaveAttribute('for', 'email-field')
    expect(input).toHaveAttribute('id', 'email-field')
  })

  it('auto-generates an id when none is supplied (label still links)', () => {
    render(<Input label="Username" />)
    const input = screen.getByLabelText('Username')
    expect(input).toHaveAttribute('id')
    expect(input.getAttribute('id')).not.toBe('')
  })

  it('shows a required marker when required is true', () => {
    render(<Input label="Password" required />)
    expect(screen.getByText('*')).toBeInTheDocument()
  })

  it('renders hint text when no error is present', () => {
    render(<Input label="Email" hint="We never share your email." />)
    expect(screen.getByText('We never share your email.')).toBeInTheDocument()
  })

  it('shows error message and sets aria-invalid when error is passed', () => {
    render(<Input label="Email" error="Invalid email address" />)
    const input = screen.getByLabelText('Email')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    const errorMsg = screen.getByRole('alert')
    expect(errorMsg).toHaveTextContent('Invalid email address')
  })

  it('hides the hint when an error is present', () => {
    render(<Input label="Email" hint="We never share your email." error="Required" />)
    expect(screen.queryByText('We never share your email.')).not.toBeInTheDocument()
    expect(screen.getByText('Required')).toBeInTheDocument()
  })

  it('points aria-describedby at the error when there is one', () => {
    render(<Input label="Email" id="e" error="Required" />)
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-describedby', 'e-error')
  })

  it('points aria-describedby at the hint when there is a hint and no error', () => {
    render(<Input label="Email" id="e" hint="Optional" />)
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-describedby', 'e-hint')
  })

  it('applies size classes', () => {
    const { rerender, container } = render(<Input size="sm" aria-label="x" />)
    expect(container.firstChild.className).toMatch(/inputField--sm/)
    rerender(<Input size="lg" aria-label="x" />)
    expect(container.firstChild.className).toMatch(/inputField--lg/)
  })

  it('applies fullWidth class', () => {
    const { container } = render(<Input fullWidth aria-label="x" />)
    expect(container.firstChild.className).toMatch(/inputField--fullWidth/)
  })

  it('applies disabled + readOnly states', () => {
    const { rerender } = render(<Input aria-label="x" disabled />)
    expect(screen.getByRole('textbox')).toBeDisabled()
    rerender(<Input aria-label="x" readOnly />)
    expect(screen.getByRole('textbox')).toHaveAttribute('readonly')
  })

  it('forwards ref to the inner <input>, not the wrapping div', () => {
    const ref = createRef()
    render(<Input aria-label="x" ref={ref} />)
    expect(ref.current).toBeInstanceOf(HTMLInputElement)
  })

  it('passes through HTML props (data-testid, name, placeholder)', () => {
    render(<Input aria-label="x" data-testid="field" name="username" placeholder="jane-doe" />)
    const input = screen.getByTestId('field')
    expect(input).toHaveAttribute('name', 'username')
    expect(input).toHaveAttribute('placeholder', 'jane-doe')
  })

  it('fires onChange when typed into', async () => {
    const user = userEvent.setup()
    const handler = vi.fn()
    render(<Input aria-label="x" onChange={handler} />)
    await user.type(screen.getByRole('textbox'), 'hi')
    // type() fires once per character, so two calls for "hi".
    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('supports different types (email, password, search)', () => {
    const { rerender, container } = render(<Input aria-label="email" type="email" />)
    expect(container.querySelector('input')).toHaveAttribute('type', 'email')
    rerender(<Input aria-label="pwd" type="password" />)
    expect(container.querySelector('input')).toHaveAttribute('type', 'password')
    rerender(<Input aria-label="q" type="search" />)
    expect(container.querySelector('input')).toHaveAttribute('type', 'search')
  })

  it('renders leftIcon and rightIcon when supplied', () => {
    render(
      <Input
        aria-label="x"
        leftIcon={<span data-testid="lhs" />}
        rightIcon={<span data-testid="rhs" />}
      />,
    )
    expect(screen.getByTestId('lhs')).toBeInTheDocument()
    expect(screen.getByTestId('rhs')).toBeInTheDocument()
  })
})
