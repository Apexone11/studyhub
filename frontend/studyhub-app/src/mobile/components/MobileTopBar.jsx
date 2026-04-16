// src/mobile/components/MobileTopBar.jsx
// Minimal top bar for mobile screens. Shows an optional back arrow,
// a centered title, and an optional right action slot.

import { useCallback } from 'react'
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

/**
 * @param {object} props
 * @param {string} [props.title]
 * @param {boolean} [props.showBack=false]
 * @param {() => void} [props.onBack] — custom back handler, defaults to navigate(-1)
 * @param {React.ReactNode} [props.right] — right-side slot
 * @param {boolean} [props.transparent=false] — transparent background mode
 * @param {string} [props.className]
 */
export default function MobileTopBar({
  title,
  showBack = false,
  onBack,
  right,
  transparent = false,
  className = '',
}) {
  const navigate = useNavigate()

  const handleBack = useCallback(() => {
    if (onBack) {
      onBack()
    } else {
      navigate(-1)
    }
  }, [onBack, navigate])

  const bgClass = transparent ? 'mob-topbar--transparent' : ''

  return (
    <header className={`mob-topbar ${bgClass} ${className}`}>
      <div className="mob-topbar-left">
        {showBack && (
          <button
            className="mob-topbar-back"
            onClick={handleBack}
            aria-label="Go back"
            type="button"
          >
            <BackArrow />
          </button>
        )}
      </div>
      {title && <h1 className="mob-topbar-title">{title}</h1>}
      <div className="mob-topbar-right">{right}</div>
    </header>
  )
}
