import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createRef } from 'react'
import Skeleton, { SkeletonText, SkeletonAvatar, SkeletonCard } from './Skeleton'

describe('Skeleton', () => {
  it('renders a single text line by default', () => {
    render(<Skeleton data-testid="skel" />)
    const el = screen.getByTestId('skel')
    expect(el.className).toMatch(/base/)
    expect(el.className).toMatch(/text/)
    expect(el).toHaveAttribute('aria-hidden', 'true')
    // One line emits a single element (not the multi-line container).
    expect(el.tagName).toBe('SPAN')
  })

  it('renders multi-line text when lines > 1', () => {
    render(<Skeleton lines={3} data-testid="skel" />)
    const outer = screen.getByTestId('skel')
    expect(outer.className).toMatch(/lines/)
    // The outer container should have 3 direct-child line bars.
    const childLines = outer.querySelectorAll(':scope > span')
    expect(childLines.length).toBe(3)
  })

  it('applies the avatar variant class', () => {
    render(<Skeleton variant="avatar" data-testid="skel" />)
    const el = screen.getByTestId('skel')
    expect(el.className).toMatch(/avatar/)
  })

  it('converts numeric width/height to px', () => {
    render(<Skeleton variant="avatar" width={64} height={64} data-testid="skel" />)
    const el = screen.getByTestId('skel')
    expect(el).toHaveStyle({ width: '64px', height: '64px' })
  })

  it('passes through string width/height', () => {
    render(<Skeleton width="12em" data-testid="skel" />)
    const el = screen.getByTestId('skel')
    expect(el).toHaveStyle({ width: '12em' })
  })

  it('forwards ref', () => {
    const ref = createRef()
    render(<Skeleton ref={ref} />)
    expect(ref.current).toBeInstanceOf(HTMLElement)
  })

  it('merges consumer className', () => {
    render(<Skeleton className="mine" data-testid="skel" />)
    const el = screen.getByTestId('skel')
    expect(el.className).toMatch(/mine/)
    expect(el.className).toMatch(/base/)
  })
})

describe('SkeletonText', () => {
  it('delegates to Skeleton with variant=text and the given lines count', () => {
    render(<SkeletonText lines={4} data-testid="t" />)
    const outer = screen.getByTestId('t')
    expect(outer.className).toMatch(/lines/)
    expect(outer.querySelectorAll(':scope > span').length).toBe(4)
  })
})

describe('SkeletonAvatar', () => {
  it('renders a circle-sized skeleton driven by the size prop', () => {
    render(<SkeletonAvatar size={56} data-testid="a" />)
    const el = screen.getByTestId('a')
    expect(el.className).toMatch(/avatar/)
    expect(el).toHaveStyle({ width: '56px', height: '56px' })
  })

  it('defaults to size=40 when size is omitted', () => {
    render(<SkeletonAvatar data-testid="a" />)
    const el = screen.getByTestId('a')
    expect(el).toHaveStyle({ width: '40px', height: '40px' })
  })
})

describe('SkeletonCard', () => {
  it('renders a card-shaped skeleton with role=status + aria-busy', () => {
    render(<SkeletonCard data-testid="c" />)
    const el = screen.getByTestId('c')
    expect(el).toHaveAttribute('role', 'status')
    expect(el).toHaveAttribute('aria-busy', 'true')
  })

  it('contains a header bar, body lines, and footer bar', () => {
    const { container } = render(<SkeletonCard />)
    // Header + body container + footer => 3 direct children of the card.
    const card = container.firstChild
    expect(card.children.length).toBe(3)
  })
})
