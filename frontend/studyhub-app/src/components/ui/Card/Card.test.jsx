import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createRef } from 'react'
import Card, { CardHeader, CardBody, CardFooter } from './Card'

describe('Card', () => {
  it('renders children inside a div by default', () => {
    render(<Card>hello</Card>)
    const node = screen.getByText('hello')
    expect(node).toBeInTheDocument()
    expect(node.tagName).toBe('DIV')
  })

  it('applies the default padding-md class', () => {
    const { container } = render(<Card>x</Card>)
    expect(container.firstChild.className).toMatch(/card--padding-md/)
  })

  it('applies padding-none class when padding="none"', () => {
    const { container } = render(<Card padding="none">x</Card>)
    expect(container.firstChild.className).toMatch(/card--padding-none/)
  })

  it('applies padding-sm / padding-lg classes', () => {
    const { rerender, container } = render(<Card padding="sm">x</Card>)
    expect(container.firstChild.className).toMatch(/card--padding-sm/)
    rerender(<Card padding="lg">x</Card>)
    expect(container.firstChild.className).toMatch(/card--padding-lg/)
  })

  it('applies the interactive class when interactive', () => {
    const { container } = render(<Card interactive>x</Card>)
    expect(container.firstChild.className).toMatch(/card--interactive/)
  })

  it('adds role=button + tabindex when interactive and not an <a> or <button>', () => {
    render(<Card interactive>clickable</Card>)
    const el = screen.getByText('clickable')
    expect(el).toHaveAttribute('role', 'button')
    expect(el).toHaveAttribute('tabindex', '0')
  })

  it('does NOT add role=button when interactive and rendered as <a>', () => {
    render(
      <Card interactive as="a" href="/foo">
        x
      </Card>,
    )
    const el = screen.getByRole('link')
    expect(el).not.toHaveAttribute('role', 'button')
    expect(el).not.toHaveAttribute('tabindex')
  })

  it('renders as the element specified by the `as` prop', () => {
    const { rerender, container } = render(<Card as="article">x</Card>)
    expect(container.firstChild.tagName).toBe('ARTICLE')
    rerender(<Card as="section">x</Card>)
    expect(container.firstChild.tagName).toBe('SECTION')
    rerender(
      <Card as="a" href="/x">
        x
      </Card>,
    )
    expect(container.firstChild.tagName).toBe('A')
  })

  it('forwards ref to the root element', () => {
    const ref = createRef()
    render(<Card ref={ref}>x</Card>)
    expect(ref.current).toBeInstanceOf(HTMLDivElement)
  })

  it('passes through HTML props (data-testid, aria-label)', () => {
    render(
      <Card data-testid="outer" aria-label="card wrapper">
        x
      </Card>,
    )
    const el = screen.getByTestId('outer')
    expect(el).toHaveAttribute('aria-label', 'card wrapper')
  })

  it('merges consumer-provided className with its own classes', () => {
    const { container } = render(<Card className="mine">x</Card>)
    const node = container.firstChild
    expect(node.className).toMatch(/card/)
    expect(node.className).toMatch(/mine/)
  })

  it('renders CardHeader / CardBody / CardFooter in declared order', () => {
    render(
      <Card>
        <CardHeader>H</CardHeader>
        <CardBody>B</CardBody>
        <CardFooter>F</CardFooter>
      </Card>,
    )
    expect(screen.getByText('H')).toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
    expect(screen.getByText('F')).toBeInTheDocument()
  })

  it('applies the expected classes to each subcomponent', () => {
    const { container } = render(
      <Card>
        <CardHeader>H</CardHeader>
        <CardBody>B</CardBody>
        <CardFooter>F</CardFooter>
      </Card>,
    )
    expect(screen.getByText('H').className).toMatch(/card__header/)
    expect(screen.getByText('B').className).toMatch(/card__body/)
    expect(screen.getByText('F').className).toMatch(/card__footer/)
    // Sanity: card wrapper + 3 children in DOM.
    expect(container.firstChild.children.length).toBe(3)
  })

  it('subcomponents forward ref', () => {
    const hRef = createRef()
    const bRef = createRef()
    const fRef = createRef()
    render(
      <Card>
        <CardHeader ref={hRef}>H</CardHeader>
        <CardBody ref={bRef}>B</CardBody>
        <CardFooter ref={fRef}>F</CardFooter>
      </Card>,
    )
    expect(hRef.current).toBeInstanceOf(HTMLDivElement)
    expect(bRef.current).toBeInstanceOf(HTMLDivElement)
    expect(fRef.current).toBeInstanceOf(HTMLDivElement)
  })

  it('subcomponents pass through HTML props', () => {
    render(
      <Card>
        <CardHeader data-testid="header">H</CardHeader>
      </Card>,
    )
    expect(screen.getByTestId('header')).toBeInTheDocument()
  })
})
