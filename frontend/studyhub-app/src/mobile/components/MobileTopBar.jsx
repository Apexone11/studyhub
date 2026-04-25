// src/mobile/components/MobileTopBar.jsx
// Frosted, sticky top bar that collapses its bottom border in when the page
// has been scrolled. Back-compatible props with the v2 implementation.

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

function BackArrow({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M15 19l-7-7 7-7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function MobileTopBar({
  title,
  showBack = false,
  onBack,
  left,
  right,
  transparent = false,
  hideTitleOnScroll = false,
  className = '',
}) {
  const navigate = useNavigate()
  const [scrolled, setScrolled] = useState(false)
  const [scrolledPast, setScrolledPast] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const onScroll = () => {
      const y = window.scrollY || document.documentElement.scrollTop || 0
      setScrolled(y > 2)
      setScrolledPast(y > 48)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    // Also listen to the shell's inner scroller since .mob-shell-content scrolls.
    const inner = document.querySelector('.mob-shell-content')
    const onInner = () => {
      const y = inner ? inner.scrollTop : 0
      setScrolled(y > 2)
      setScrolledPast(y > 48)
    }
    if (inner) inner.addEventListener('scroll', onInner, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (inner) inner.removeEventListener('scroll', onInner)
    }
  }, [])

  const handleBack = useCallback(() => {
    if (onBack) {
      onBack()
    } else {
      navigate(-1)
    }
  }, [onBack, navigate])

  const bgClass = transparent ? 'sh-m-topbar--transparent' : ''
  const scrolledClass = scrolled && !transparent ? 'sh-m-topbar--scrolled' : ''
  const titleHidden = hideTitleOnScroll && !scrolledPast
  // When hideTitleOnScroll=true the title appears AS the user scrolls past
  // the hero section (ref 3 pattern). When false the title is always shown.
  const titleClass = titleHidden ? 'sh-m-topbar__title--hidden' : ''

  return (
    <header className={`sh-m-topbar ${bgClass} ${scrolledClass} ${className}`.trim()}>
      <div className="sh-m-topbar__slot">
        {left ? (
          left
        ) : showBack ? (
          <button
            className="sh-m-topbar__icon-btn"
            onClick={handleBack}
            aria-label="Go back"
            type="button"
          >
            <BackArrow />
          </button>
        ) : null}
      </div>
      {title && <h1 className={`sh-m-topbar__title ${titleClass}`.trim()}>{title}</h1>}
      <div className="sh-m-topbar__slot sh-m-topbar__slot--right">{right}</div>
    </header>
  )
}
