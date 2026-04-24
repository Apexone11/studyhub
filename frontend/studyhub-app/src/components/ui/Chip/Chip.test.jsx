import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createRef } from 'react'
import Chip, { Badge } from './Chip'

describe('Chip', () => {
  it('renders children', () => {
    render(<Chip>BIOL 201</Chip>)
    expect(screen.getByText('BIOL 201')).toBeInTheDocument()
  })

  it('defaults to pill variant + brand tone + md size', () => {
    render(<Chip>x</Chip>)
    const el = screen.getByText('x')
    expect(el.className).toMatch(/chip--pill/)
    expect(el.className).toMatch(/chip--tone-brand/)
    expect(el.className).toMatch(/chip--md/)
  })

  it('applies each variant class', () => {
    const { rerender } = render(<Chip variant="eyebrow">x</Chip>)
    expect(screen.getByText('x').className).toMatch(/chip--eyebrow/)
    rerender(<Chip variant="badge">x</Chip>)
    expect(screen.getByText('x').className).toMatch(/chip--badge/)
  })

  it('applies each tone class', () => {
    const { rerender } = render(<Chip tone="success">x</Chip>)
    expect(screen.getByText('x').className).toMatch(/chip--tone-success/)
    rerender(<Chip tone="warning">x</Chip>)
    expect(screen.getByText('x').className).toMatch(/chip--tone-warning/)
    rerender(<Chip tone="danger">x</Chip>)
    expect(screen.getByText('x').className).toMatch(/chip--tone-danger/)
    rerender(<Chip tone="neutral">x</Chip>)
    expect(screen.getByText('x').className).toMatch(/chip--tone-neutral/)
  })

  it('applies size class for non-eyebrow variants', () => {
    const { rerender } = render(<Chip size="sm">x</Chip>)
    expect(screen.getByText('x').className).toMatch(/chip--sm/)
    rerender(
      <Chip variant="badge" size="sm">
        x
      </Chip>,
    )
    expect(screen.getByText('x').className).toMatch(/chip--sm/)
  })

  it('ignores size class on eyebrow variant', () => {
    render(
      <Chip variant="eyebrow" size="sm">
        x
      </Chip>,
    )
    expect(screen.getByText('x').className).not.toMatch(/chip--sm/)
    expect(screen.getByText('x').className).not.toMatch(/chip--md/)
  })

  it('forwards ref to the underlying span', () => {
    const ref = createRef()
    render(<Chip ref={ref}>x</Chip>)
    expect(ref.current).toBeInstanceOf(HTMLSpanElement)
  })

  it('passes through HTML props (data-testid, aria-label)', () => {
    render(
      <Chip data-testid="chip" aria-label="course code">
        x
      </Chip>,
    )
    const el = screen.getByTestId('chip')
    expect(el).toHaveAttribute('aria-label', 'course code')
  })

  it('merges a consumer-provided className', () => {
    render(<Chip className="mine">x</Chip>)
    const el = screen.getByText('x')
    expect(el.className).toMatch(/chip--pill/)
    expect(el.className).toMatch(/mine/)
  })
})

describe('Badge', () => {
  it('renders as a badge-variant chip', () => {
    render(<Badge>new</Badge>)
    const el = screen.getByText('new')
    expect(el.className).toMatch(/chip--badge/)
  })

  it('forwards ref + passes props through to Chip', () => {
    const ref = createRef()
    render(
      <Badge ref={ref} tone="danger" data-testid="b">
        !
      </Badge>,
    )
    expect(ref.current).toBeInstanceOf(HTMLSpanElement)
    expect(screen.getByTestId('b').className).toMatch(/chip--tone-danger/)
  })
})
