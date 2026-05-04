/* ═══════════════════════════════════════════════════════════════════════════
 * AiDensityToggle.jsx — Comfortable / Compact density radio group.
 *
 * Per L4-MED-1 the toggle is a proper ARIA radiogroup so screen readers
 * announce it as a single control with two options. Arrow keys swap
 * selection. Persists to localStorage under `studyhub.ai.density`.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useEffect } from 'react'
import { saveDensity } from './aiDensityStorage'

export default function AiDensityToggle({ value, onChange }) {
  useEffect(() => {
    saveDensity(value)
  }, [value])

  const handleKeyDown = (e) => {
    if (
      e.key === 'ArrowLeft' ||
      e.key === 'ArrowRight' ||
      e.key === 'ArrowUp' ||
      e.key === 'ArrowDown'
    ) {
      e.preventDefault()
      onChange(value === 'comfortable' ? 'compact' : 'comfortable')
    }
  }

  const button = (key, label) => {
    const checked = value === key
    return (
      <button
        type="button"
        role="radio"
        aria-checked={checked}
        tabIndex={checked ? 0 : -1}
        onClick={() => onChange(key)}
        onKeyDown={handleKeyDown}
        style={{
          background: checked ? 'var(--sh-brand-soft)' : 'transparent',
          color: checked ? 'var(--sh-pill-text)' : 'var(--sh-subtext)',
          border: 'none',
          padding: '6px 12px',
          fontSize: 11,
          fontWeight: 700,
          cursor: 'pointer',
          borderRadius: 8,
          minHeight: 28,
        }}
      >
        {label}
      </button>
    )
  }

  return (
    <div
      role="radiogroup"
      aria-label="Message density"
      style={{
        display: 'inline-flex',
        gap: 4,
        padding: 2,
        background: 'var(--sh-soft)',
        border: '1px solid var(--sh-border)',
        borderRadius: 10,
      }}
    >
      {button('comfortable', 'Comfortable')}
      {button('compact', 'Compact')}
    </div>
  )
}
