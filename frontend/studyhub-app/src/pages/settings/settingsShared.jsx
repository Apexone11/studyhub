/**
 * Shared UI primitives for all Settings tabs.
 * Extracted from the original monolithic SettingsPage.jsx.
 *
 * All colors use CSS variable tokens (--sh-*) so dark mode works
 * automatically without !important overrides.
 */

import { FONT } from './settingsState'

export function Input(props) {
  return (
    <input
      {...props}
      style={{
        width: '100%',
        padding: '10px 14px',
        border: '1px solid var(--sh-input-border)',
        borderRadius: 10,
        fontSize: 14,
        fontFamily: FONT,
        color: 'var(--sh-input-text)',
        background: 'var(--sh-input-bg)',
        outline: 'none',
        boxSizing: 'border-box',
        ...(props.style || {}),
      }}
    />
  )
}

export function Button({ children, secondary = false, danger = false, ...props }) {
  let background = 'var(--sh-brand)'
  let color = 'var(--sh-btn-primary-text)'
  let border = 'none'

  if (secondary) {
    background = 'var(--sh-btn-secondary-bg)'
    color = 'var(--sh-btn-secondary-text)'
    border = '1px solid var(--sh-btn-secondary-border)'
  }

  if (danger) {
    background = 'var(--sh-danger-bg)'
    color = 'var(--sh-danger-text)'
    border = '1px solid var(--sh-danger-border)'
  }

  return (
    <button
      {...props}
      style={{
        padding: '10px 16px',
        borderRadius: 10,
        border,
        background,
        color,
        fontSize: 14,
        fontWeight: 700,
        cursor: props.disabled ? 'not-allowed' : 'pointer',
        opacity: props.disabled ? 0.7 : 1,
        fontFamily: FONT,
        ...(props.style || {}),
      }}
    >
      {children}
    </button>
  )
}

export function Message({ tone = 'error', children }) {
  const palette =
    tone === 'success'
      ? { bg: 'var(--sh-success-bg)', border: 'var(--sh-success-border)', text: 'var(--sh-success-text)' }
      : tone === 'info'
        ? { bg: 'var(--sh-pill-bg)', border: 'var(--sh-border)', text: 'var(--sh-pill-text)' }
        : { bg: 'var(--sh-danger-bg)', border: 'var(--sh-danger-border)', text: 'var(--sh-danger-text)' }

  return (
    <div
      style={{
        marginBottom: 14,
        padding: '12px 14px',
        borderRadius: 10,
        border: `1px solid ${palette.border}`,
        background: palette.bg,
        color: palette.text,
        fontSize: 13,
        lineHeight: 1.6,
      }}
    >
      {children}
    </div>
  )
}

export function FormField({ label, children, hint }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--sh-subtext)' }}>
        <span style={{ display: 'block', marginBottom: 6 }}>{label}</span>
        {children}
      </label>
      {hint && (
        <div style={{ marginTop: 5, fontSize: 12, color: 'var(--sh-muted)' }}>
          {hint}
        </div>
      )}
    </div>
  )
}

export function SectionCard({ title, subtitle, children, danger = false }) {
  return (
    <section
      style={{
        background: 'var(--sh-surface)',
        borderRadius: 16,
        border: `1px solid ${danger ? 'var(--sh-danger-border)' : 'var(--sh-border)'}`,
        padding: '24px',
        boxShadow: 'var(--shadow-sm)',
        marginBottom: 18,
      }}
    >
      <h3 style={{ margin: '0 0 6px', fontSize: 17, color: danger ? 'var(--sh-danger)' : 'var(--sh-heading)' }}>{title}</h3>
      {subtitle && <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--sh-muted)', lineHeight: 1.7 }}>{subtitle}</p>}
      {children}
    </section>
  )
}

export function MsgList({ msg }) {
  if (!msg) return null
  return <Message tone={msg.type === 'success' ? 'success' : 'error'}>{msg.text}</Message>
}

export function Select({ value, onChange, children, ...props }) {
  return (
    <select
      value={value}
      onChange={onChange}
      {...props}
      style={{
        width: '100%',
        padding: '10px 14px',
        borderRadius: 10,
        border: '1px solid var(--sh-input-border)',
        fontSize: 14,
        fontFamily: FONT,
        color: 'var(--sh-input-text)',
        background: 'var(--sh-input-bg)',
        ...(props.style || {}),
      }}
    >
      {children}
    </select>
  )
}

export function ToggleRow({ label, description, checked, onChange, disabled = false }) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '14px 0',
        borderBottom: '1px solid var(--sh-soft)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--sh-text)' }}>{label}</div>
        {description && <div style={{ fontSize: 12, color: 'var(--sh-muted)', marginTop: 2 }}>{description}</div>}
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        style={{ width: 18, height: 18, accentColor: 'var(--sh-brand)', cursor: 'inherit' }}
      />
    </label>
  )
}
