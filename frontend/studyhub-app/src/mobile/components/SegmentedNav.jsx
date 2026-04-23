// src/mobile/components/SegmentedNav.jsx
// Segmented pill nav with animated indicator that slides with spring easing.
// Fires haptic `select` on change.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import haptics from '../lib/haptics'

/**
 * @typedef {{ id: string, label: string }} SegmentedItem
 */

export default function SegmentedNav({
  items,
  value,
  onChange,
  block = false,
  className = '',
  ariaLabel = 'Segmented navigation',
}) {
  const containerRef = useRef(null)
  const itemRefs = useRef({})
  const [indicator, setIndicator] = useState({ left: 4, width: 0 })

  const measure = useCallback(() => {
    const el = itemRefs.current[value]
    const container = containerRef.current
    if (!el || !container) return
    const cr = container.getBoundingClientRect()
    const ir = el.getBoundingClientRect()
    setIndicator({
      left: ir.left - cr.left,
      width: ir.width,
    })
  }, [value])

  // useLayoutEffect so the indicator is placed before paint on the active item.
  useLayoutEffect(() => {
    measure()
  }, [measure, items])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [measure])

  const handleSelect = useCallback(
    (id) => {
      if (id === value) return
      haptics.select()
      if (typeof onChange === 'function') onChange(id)
    },
    [value, onChange],
  )

  const onKeyDown = useCallback(
    (e) => {
      if (!items || items.length === 0) return
      const idx = items.findIndex((it) => it.id === value)
      if (idx < 0) return
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        handleSelect(items[(idx + 1) % items.length].id)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        handleSelect(items[(idx - 1 + items.length) % items.length].id)
      }
    },
    [items, value, handleSelect],
  )

  return (
    <div
      ref={containerRef}
      className={`sh-m-seg ${block ? 'sh-m-seg--block' : ''} ${className}`.trim()}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
    >
      <span
        className="sh-m-seg__indicator"
        aria-hidden="true"
        style={{
          transform: `translateX(${indicator.left - 4}px)`,
          width: `${indicator.width}px`,
        }}
      />
      {items.map((it) => (
        <button
          key={it.id}
          ref={(node) => {
            if (node) itemRefs.current[it.id] = node
            else delete itemRefs.current[it.id]
          }}
          type="button"
          role="tab"
          aria-selected={it.id === value ? 'true' : 'false'}
          className={`sh-m-seg__item ${it.id === value ? 'sh-m-seg__item--active' : ''}`.trim()}
          onClick={() => handleSelect(it.id)}
        >
          {it.label}
        </button>
      ))}
    </div>
  )
}
