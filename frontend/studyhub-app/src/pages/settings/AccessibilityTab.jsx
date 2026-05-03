/* ════════════════════════════════════════════════════════════════════════
 * AccessibilityTab.jsx — Per-user accessibility preferences
 *
 * Today this controls one toggle (focus-ring suppression), wired to a
 * `<html data-focus-ring="off">` attribute consumed by index.css. The
 * default is ON because keyboard-only users need a visible focus ring
 * (WCAG 2.1 AA, Success Criterion 2.4.7), and the project's axe-core
 * smoke test will fail any commit that strips it for everyone. The
 * toggle lets a power user opt out without regressing the default.
 *
 * Storage: localStorage (`studyhub.a11y.focusRing`). No server round-
 * trip needed — the preference is per-device and effective on next
 * paint without waiting on /me. If we ever sync these across devices,
 * extend the existing UserPreferences endpoint.
 * ════════════════════════════════════════════════════════════════════════ */
import { useEffect, useState } from 'react'
import { FONT } from './settingsState'

const settingsCardStyle = {
  border: '1px solid var(--sh-border)',
  borderRadius: 14,
  padding: '16px 18px',
  background: 'var(--sh-soft)',
}

const FOCUS_RING_KEY = 'studyhub.a11y.focusRing'
const REDUCED_MOTION_KEY = 'studyhub.a11y.reducedMotion'

function readBoolean(key, defaultValue) {
  try {
    const v = localStorage.getItem(key)
    if (v === null || v === undefined) return defaultValue
    return v === 'true'
  } catch {
    return defaultValue
  }
}

function applyFocusRing(enabled) {
  try {
    document.documentElement.dataset.focusRing = enabled ? 'on' : 'off'
  } catch {
    /* SSR / no-DOM environments */
  }
}

function applyReducedMotion(enabled) {
  try {
    document.documentElement.dataset.reducedMotion = enabled ? 'on' : 'off'
  } catch {
    /* SSR */
  }
}

export default function AccessibilityTab() {
  const [focusRing, setFocusRing] = useState(() => readBoolean(FOCUS_RING_KEY, true))
  const [reducedMotion, setReducedMotion] = useState(() => readBoolean(REDUCED_MOTION_KEY, false))

  useEffect(() => {
    applyFocusRing(focusRing)
    try {
      localStorage.setItem(FOCUS_RING_KEY, String(focusRing))
    } catch {
      /* private browsing — preference simply won't persist */
    }
  }, [focusRing])

  useEffect(() => {
    applyReducedMotion(reducedMotion)
    try {
      localStorage.setItem(REDUCED_MOTION_KEY, String(reducedMotion))
    } catch {
      /* private browsing */
    }
  }, [reducedMotion])

  return (
    <div style={{ display: 'grid', gap: 16, fontFamily: FONT }}>
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--sh-heading)' }}>
        Accessibility
      </h2>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--sh-subtext)', lineHeight: 1.6 }}>
        Personalize how StudyHub looks and feels. These settings are stored on this device only.
      </p>

      <ToggleRow
        title="Focus ring outline"
        description="A blue outline highlights the currently focused button or input. Most keyboard users keep this on — turn it off if it distracts you while clicking around with a mouse. (Keyboard navigation still works either way; it just won't draw the ring.)"
        checked={focusRing}
        onChange={setFocusRing}
      />

      <ToggleRow
        title="Reduce motion"
        description="Disables card slide-in animations, fade transitions, and the sidebar hover sweep. Recommended if scrolling animations make you dizzy or if you've enabled 'Reduce Motion' at the OS level."
        checked={reducedMotion}
        onChange={setReducedMotion}
      />
    </div>
  )
}

function ToggleRow({ title, description, checked, onChange }) {
  return (
    <div style={settingsCardStyle}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--sh-heading)' }}>{title}</div>
          <div
            style={{
              fontSize: 12,
              color: 'var(--sh-muted)',
              marginTop: 4,
              lineHeight: 1.6,
            }}
          >
            {description}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={title}
          onClick={() => onChange(!checked)}
          style={{
            flexShrink: 0,
            width: 44,
            height: 24,
            borderRadius: 999,
            border: '1px solid var(--sh-border)',
            background: checked ? 'var(--sh-brand)' : 'var(--sh-soft)',
            cursor: 'pointer',
            position: 'relative',
            transition: 'background 0.15s',
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: 2,
              left: checked ? 22 : 2,
              width: 18,
              height: 18,
              borderRadius: '50%',
              background: '#fff',
              transition: 'left 0.15s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }}
          />
        </button>
      </div>
    </div>
  )
}
