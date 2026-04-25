import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import {
  Star,
  StarFilled,
  Clock,
  Sheet,
  Download,
  ArrowRight,
  Check,
  Close,
  Plus,
  Search,
  Bell,
} from './index'

describe('Icons barrel', () => {
  it('exposes Figma-named icons that render an SVG', () => {
    const icons = [Star, StarFilled, Clock, Sheet, Download, ArrowRight, Check, Close, Plus]
    for (const Icon of icons) {
      const { container, unmount } = render(<Icon size={20} />)
      // Each icon should render an <svg> as its root.
      expect(container.querySelector('svg')).toBeInTheDocument()
      unmount()
    }
  })

  it('forwards the size prop through to the SVG', () => {
    const { container } = render(<Star size={32} />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('width', '32')
    expect(svg).toHaveAttribute('height', '32')
  })

  it('Search and Bell are accessible under their Figma-aligned names', () => {
    const { container: s } = render(<Search />)
    expect(s.querySelector('svg')).toBeInTheDocument()
    const { container: b } = render(<Bell />)
    expect(b.querySelector('svg')).toBeInTheDocument()
  })
})
