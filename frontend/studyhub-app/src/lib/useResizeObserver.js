/* ═══════════════════════════════════════════════════════════════════════════
 * useResizeObserver.js — React wrapper for the ResizeObserver API
 *
 * Loop M20 (2026-05-13). Many older components in StudyHub still use
 * `window.addEventListener('resize', ...)` to drive adaptive layouts.
 * That global pattern works but fires on every viewport change even
 * when the element of interest never moves, and it doesn't notice
 * intra-page changes (a sidebar opening, a collapsible panel resizing,
 * a card flexing because content streamed in).
 *
 * ResizeObserver is the modern primitive (spec-shipped 2018, broad
 * browser support since 2020). This hook gives components an
 * incrementally-adoptable shape:
 *
 *   const { ref, width, height } = useResizeObserver()
 *   <div ref={ref}>...</div>
 *
 * SSR-safe (effect-only). Falls back to a one-time
 * `getBoundingClientRect()` read on platforms that don't expose
 * `ResizeObserver` so the consumer at least gets initial dimensions.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useRef, useState } from 'react'

export function useResizeObserver() {
  const ref = useRef(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const node = ref.current
    if (!node) return undefined

    // Fallback for environments without ResizeObserver: read once.
    if (typeof window === 'undefined' || typeof window.ResizeObserver !== 'function') {
      const rect = node.getBoundingClientRect()
      setSize({ width: rect.width, height: rect.height })
      return undefined
    }

    const observer = new window.ResizeObserver((entries) => {
      for (const entry of entries) {
        // `contentBoxSize` is the spec-ified path; some browsers still
        // only fill `contentRect`. Try both.
        let w = 0
        let h = 0
        if (entry.contentBoxSize) {
          const box = Array.isArray(entry.contentBoxSize)
            ? entry.contentBoxSize[0]
            : entry.contentBoxSize
          w = box.inlineSize
          h = box.blockSize
        } else if (entry.contentRect) {
          w = entry.contentRect.width
          h = entry.contentRect.height
        }
        setSize((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }))
      }
    })

    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return { ref, width: size.width, height: size.height }
}

export default useResizeObserver
