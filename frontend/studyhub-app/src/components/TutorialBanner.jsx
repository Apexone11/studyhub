/**
 * TutorialBanner — one-time dismissible info banner for feature onboarding.
 * Uses localStorage to remember dismissal per feature key.
 */
import { useState } from 'react'

const STORAGE_PREFIX = 'studyhub_tutorial_'

export default function TutorialBanner({ featureKey, title, steps }) {
  const storageKey = `${STORAGE_PREFIX}${featureKey}`
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === '1'
    } catch {
      return false
    }
  })

  if (dismissed || !steps || steps.length === 0) return null

  const handleDismiss = () => {
    setDismissed(true)
    try {
      localStorage.setItem(storageKey, '1')
    } catch {
      // Storage unavailable — silently ignore
    }
  }

  return (
    <div style={bannerStyle}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
        }}
      >
        <div style={{ flex: 1 }}>
          <h4 style={titleStyle}>{title}</h4>
          <ol style={listStyle}>
            {steps.map((step, i) => (
              <li key={i} style={stepStyle}>
                {step}
              </li>
            ))}
          </ol>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          style={dismissStyle}
          aria-label="Dismiss tutorial"
        >
          Got it
        </button>
      </div>
    </div>
  )
}

const bannerStyle = {
  background: 'var(--sh-info-bg, #eff6ff)',
  border: '1px solid var(--sh-info-border, #dbeafe)',
  borderRadius: 14,
  padding: '14px 16px',
  marginBottom: 16,
}

const titleStyle = {
  margin: '0 0 8px',
  fontSize: 14,
  fontWeight: 800,
  color: 'var(--sh-info-text, #1d4ed8)',
}

const listStyle = {
  margin: 0,
  paddingLeft: 18,
  display: 'grid',
  gap: 4,
}

const stepStyle = {
  fontSize: 13,
  lineHeight: 1.5,
  color: 'var(--sh-text, #334155)',
}

const dismissStyle = {
  border: '1px solid var(--sh-info-border, #93c5fd)',
  borderRadius: 8,
  padding: '5px 12px',
  background: 'var(--sh-surface, #fff)',
  color: 'var(--sh-info-text, #1d4ed8)',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
}
