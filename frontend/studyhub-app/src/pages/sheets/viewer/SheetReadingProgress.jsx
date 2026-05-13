/**
 * SheetReadingProgress — Medium / Substack-style horizontal scroll
 * progress bar pinned to the top of the viewport while the user reads
 * a sheet. Tracks document scroll position and renders a thin brand
 * accent bar that fills left → right.
 *
 * Loop M5 (2026-05-13) — sheet viewer mobile polish.
 *
 * Hides itself when the user is at the top of the page (progress ≤ 1%)
 * and when the page has no meaningful scrollable height. Respects
 * prefers-reduced-motion by snapping rather than animating the width.
 */
import { useEffect, useState } from 'react'

function readReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

export default function SheetReadingProgress() {
  const [progress, setProgress] = useState(0)
  const [reducedMotion, setReducedMotion] = useState(readReducedMotion)

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    let frame = 0
    const compute = () => {
      const doc = document.documentElement
      const scrollTop = window.scrollY || doc.scrollTop || 0
      const scrollable = (doc.scrollHeight || 0) - (window.innerHeight || 0)
      if (scrollable <= 0) {
        setProgress(0)
        return
      }
      const next = Math.max(0, Math.min(1, scrollTop / scrollable))
      setProgress(next)
    }

    const onScroll = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        compute()
      })
    }

    compute()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReducedMotion(mq.matches)
    // Safari < 14 only supports the legacy addListener API.
    if (mq.addEventListener) {
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    }
    mq.addListener(onChange)
    return () => mq.removeListener(onChange)
  }, [])

  const visible = progress > 0.01
  const widthPercent = `${(progress * 100).toFixed(2)}%`

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        zIndex: 60,
        pointerEvents: 'none',
        background: 'transparent',
        opacity: visible ? 1 : 0,
        transition: reducedMotion ? 'none' : 'opacity 0.18s ease',
      }}
    >
      <div
        style={{
          width: widthPercent,
          height: '100%',
          background: 'var(--sh-brand)',
          boxShadow: '0 0 6px color-mix(in srgb, var(--sh-brand) 50%, transparent)',
          transition: reducedMotion ? 'none' : 'width 0.08s linear',
        }}
      />
    </div>
  )
}
