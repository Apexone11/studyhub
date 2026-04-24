import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createRef } from 'react'
import Avatar from './Avatar'

describe('Avatar', () => {
  it('renders initials from a one-word name (first 2 letters, uppercased)', () => {
    render(<Avatar name="jane" />)
    expect(screen.getByText('JA')).toBeInTheDocument()
  })

  it('renders initials from a multi-word name (first letter of each, 2 max)', () => {
    render(<Avatar name="Jane Doe" />)
    expect(screen.getByText('JD')).toBeInTheDocument()
  })

  it('caps at 2 initials even with many words', () => {
    render(<Avatar name="Mary Jane Watson-Parker" />)
    // "MJ" — first letter of first two words.
    expect(screen.getByText('MJ')).toBeInTheDocument()
  })

  it('renders fallback "?" when name is missing or empty', () => {
    const { rerender } = render(<Avatar />)
    expect(screen.getByText('?')).toBeInTheDocument()
    rerender(<Avatar name="" />)
    expect(screen.getByText('?')).toBeInTheDocument()
    rerender(<Avatar name="   " />)
    expect(screen.getByText('?')).toBeInTheDocument()
  })

  it('applies the default size-40 class', () => {
    const { container } = render(<Avatar name="jane" />)
    expect(container.firstChild.className).toMatch(/avatar--40/)
  })

  it('applies each allowed size class', () => {
    const { rerender, container } = render(<Avatar name="j" size={28} />)
    expect(container.firstChild.className).toMatch(/avatar--28/)
    rerender(<Avatar name="j" size={80} />)
    expect(container.firstChild.className).toMatch(/avatar--80/)
    rerender(<Avatar name="j" size={120} />)
    expect(container.firstChild.className).toMatch(/avatar--120/)
  })

  it('falls back to size-40 when an unsupported size is given', () => {
    const { container } = render(<Avatar name="j" size={999} />)
    expect(container.firstChild.className).toMatch(/avatar--40/)
  })

  it('renders an <img> when src is provided (alt text comes from name)', () => {
    render(<Avatar name="Jane Doe" src="https://example.com/jane.jpg" />)
    const img = screen.getByRole('img', { name: /jane doe/i })
    expect(img).toHaveAttribute('src', 'https://example.com/jane.jpg')
    expect(img).toHaveAttribute('alt', 'Jane Doe')
  })

  it('falls back to initials when the image errors', () => {
    render(<Avatar name="Jane Doe" src="https://bad.example.com/x.jpg" />)
    const img = screen.getByRole('img', { name: /jane doe/i })
    // Trigger onError handler
    fireEvent.error(img)
    expect(screen.getByText('JD')).toBeInTheDocument()
  })

  it('renders an online dot when online=true', () => {
    render(<Avatar name="jane" online />)
    expect(screen.getByLabelText('Online')).toBeInTheDocument()
  })

  it('does NOT render the online dot when online=false', () => {
    render(<Avatar name="jane" />)
    expect(screen.queryByLabelText('Online')).not.toBeInTheDocument()
  })

  it('forwards ref to the root span', () => {
    const ref = createRef()
    render(<Avatar name="j" ref={ref} />)
    expect(ref.current).toBeInstanceOf(HTMLSpanElement)
  })

  it('passes through HTML props (data-testid, aria-label)', () => {
    render(<Avatar name="j" data-testid="av" aria-label="profile picture" />)
    const el = screen.getByTestId('av')
    expect(el).toHaveAttribute('aria-label', 'profile picture')
  })
})
