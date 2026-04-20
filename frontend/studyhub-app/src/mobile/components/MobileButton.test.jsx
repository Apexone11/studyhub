// src/mobile/components/MobileButton.test.jsx

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import MobileButton from './MobileButton'

describe('MobileButton', () => {
  it('renders with primary + m size by default', () => {
    const { container } = render(<MobileButton>Go</MobileButton>)
    const btn = container.querySelector('button')
    expect(btn).toBeTruthy()
    expect(btn.className).toMatch(/sh-m-btn--primary/)
    expect(btn.className).toMatch(/sh-m-btn--m/)
  })

  it('fires onClick', () => {
    const spy = vi.fn()
    const { container } = render(<MobileButton onClick={spy}>Go</MobileButton>)
    fireEvent.click(container.querySelector('button'))
    expect(spy).toHaveBeenCalled()
  })

  it('suppresses onClick when disabled', () => {
    const spy = vi.fn()
    const { container } = render(
      <MobileButton disabled onClick={spy}>
        Go
      </MobileButton>,
    )
    fireEvent.click(container.querySelector('button'))
    expect(spy).not.toHaveBeenCalled()
  })

  it('renders the spinner when loading', () => {
    const { container } = render(<MobileButton loading>Go</MobileButton>)
    expect(container.querySelector('.sh-m-btn__spinner')).toBeTruthy()
    expect(container.querySelector('button').getAttribute('aria-busy')).toBe('true')
  })

  it('supports the block modifier', () => {
    const { container } = render(<MobileButton block>Go</MobileButton>)
    expect(container.querySelector('.sh-m-btn--block')).toBeTruthy()
  })
})
