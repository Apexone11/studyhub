// src/mobile/components/StatCounter.jsx
// Number that counts up from 0 to its target value when scrolled into view.
// Reduced-motion: skips the animation and displays the final value immediately.

import { useEffect, useRef, useState } from 'react'
import { countUp, prefersReducedMotion } from '../lib/motion'
import useInView from '../hooks/useInView'

function formatNumber(n, compact) {
  if (!compact) return n.toLocaleString()
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

/**
 * @param {object} props
 * @param {number} props.value - the target number
 * @param {string} [props.label]
 * @param {boolean} [props.compact] - render 1.2K / 3.4M instead of 1,200 / 3,400,000
 * @param {number} [props.duration]
 */
export default function StatCounter({
  value = 0,
  label,
  compact = false,
  duration = 900,
  className = '',
}) {
  const [elRef, inView] = useInView({ threshold: 0.5, once: true })
  const [display, setDisplay] = useState(() => (prefersReducedMotion() ? value : 0))
  const playedRef = useRef(false)

  useEffect(() => {
    if (!inView || playedRef.current) return undefined
    playedRef.current = true
    // countUp's onUpdate is called asynchronously from anime.js, not in the
    // effect body, so the set-state-in-effect rule does not apply. When
    // reduced-motion is active we defer the final value via rAF for the same
    // reason — no synchronous setState inside the effect body.
    if (prefersReducedMotion()) {
      const raf = requestAnimationFrame(() => setDisplay(value))
      return () => cancelAnimationFrame(raf)
    }
    countUp(0, value, duration, (n) => setDisplay(n))
    return undefined
  }, [inView, value, duration])

  return (
    <div ref={elRef} className={`sh-m-stat ${className}`.trim()}>
      <div className="sh-m-stat__num">{formatNumber(display, compact)}</div>
      {label && <div className="sh-m-stat__label">{label}</div>}
    </div>
  )
}
