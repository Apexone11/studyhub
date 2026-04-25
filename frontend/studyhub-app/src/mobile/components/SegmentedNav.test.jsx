// src/mobile/components/SegmentedNav.test.jsx

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import SegmentedNav from './SegmentedNav'

const ITEMS = [
  { id: 'all', label: 'All' },
  { id: 'dms', label: 'DMs' },
  { id: 'groups', label: 'Groups' },
]

describe('SegmentedNav', () => {
  it('renders one tab per item and marks the active one', () => {
    const { container } = render(<SegmentedNav items={ITEMS} value="dms" onChange={() => {}} />)
    const tabs = container.querySelectorAll('[role="tab"]')
    expect(tabs).toHaveLength(3)
    expect(tabs[1].getAttribute('aria-selected')).toBe('true')
    expect(tabs[0].getAttribute('aria-selected')).toBe('false')
  })

  it('fires onChange when selecting a different item', () => {
    const spy = vi.fn()
    const { container } = render(<SegmentedNav items={ITEMS} value="all" onChange={spy} />)
    fireEvent.click(container.querySelectorAll('[role="tab"]')[2])
    expect(spy).toHaveBeenCalledWith('groups')
  })

  it('is a no-op when selecting the already-active item', () => {
    const spy = vi.fn()
    const { container } = render(<SegmentedNav items={ITEMS} value="all" onChange={spy} />)
    fireEvent.click(container.querySelectorAll('[role="tab"]')[0])
    expect(spy).not.toHaveBeenCalled()
  })

  it('moves with ArrowRight / ArrowLeft', () => {
    const spy = vi.fn()
    const { container } = render(<SegmentedNav items={ITEMS} value="all" onChange={spy} />)
    const root = container.querySelector('[role="tablist"]')
    fireEvent.keyDown(root, { key: 'ArrowRight' })
    expect(spy).toHaveBeenLastCalledWith('dms')
    fireEvent.keyDown(root, { key: 'ArrowLeft' })
    expect(spy).toHaveBeenLastCalledWith('groups')
  })
})
