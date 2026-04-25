/* ═══════════════════════════════════════════════════════════════════════════
 * ScrollToTop.jsx — Floating scroll-to-top button
 *
 * Appears after scrolling down 400px. Smoothly scrolls to top on click.
 * Respects dark mode via CSS class. Hidden on print.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'

export default function ScrollToTop() {
  const location = useLocation()
  const [visible, setVisible] = useState(false)
  const bubbleHidden = useMemo(() => {
    const hiddenPaths = ['/ai', '/login', '/register', '/forgot-password', '/reset-password']
    if (hiddenPaths.some((path) => location.pathname.startsWith(path))) return true
    return /^\/library\/\d+\/read/.test(location.pathname)
  }, [location.pathname])

  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > 400)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  if (!visible) return null

  return (
    <button
      className="sh-scroll-top"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Scroll to top"
      style={{ right: bubbleHidden ? 28 : 88, bottom: 24 }}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="18 15 12 9 6 15" />
      </svg>
    </button>
  )
}
