// src/mobile/components/AuroraCard.test.jsx

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import AuroraCard from './AuroraCard'

describe('AuroraCard', () => {
  it('renders children inside the body', () => {
    render(<AuroraCard>hello</AuroraCard>)
    expect(screen.getByText('hello')).toBeTruthy()
  })

  it('applies the variant class', () => {
    const { container } = render(<AuroraCard variant="sheet">x</AuroraCard>)
    expect(container.querySelector('.sh-m-card--sheet')).toBeTruthy()
  })

  it('falls back to the default variant for unknown values', () => {
    const { container } = render(<AuroraCard variant="bogus">x</AuroraCard>)
    expect(container.querySelector('.sh-m-card--default')).toBeTruthy()
  })

  it('is not pressable without onPress', () => {
    const { container } = render(<AuroraCard>x</AuroraCard>)
    expect(container.querySelector('.sh-m-card--pressable')).toBeNull()
  })

  it('fires onPress on click when pressable', () => {
    const spy = vi.fn()
    const { container } = render(<AuroraCard onPress={spy}>x</AuroraCard>)
    fireEvent.click(container.querySelector('.sh-m-card'))
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('fires onPress on Enter / Space when pressable', () => {
    const spy = vi.fn()
    const { container } = render(<AuroraCard onPress={spy}>x</AuroraCard>)
    const node = container.querySelector('.sh-m-card')
    fireEvent.keyDown(node, { key: 'Enter' })
    fireEvent.keyDown(node, { key: ' ' })
    expect(spy).toHaveBeenCalledTimes(2)
  })
})
