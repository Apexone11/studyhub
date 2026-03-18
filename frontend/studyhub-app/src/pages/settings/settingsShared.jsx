/**
 * Shared UI primitives for all Settings tabs.
 * Extracted from the original monolithic SettingsPage.jsx.
 */

export const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"

export function Input(props) {
  return (
    <input
      {...props}
      style={{
        width: '100%',
        padding: '10px 14px',
        border: '1px solid #cbd5e1',
        borderRadius: 10,
        fontSize: 14,
        fontFamily: FONT,
        color: '#0f172a',
        outline: 'none',
        boxSizing: 'border-box',
        ...(props.style || {}),
      }}
    />
  )
}

export function Button({ children, secondary = false, danger = false, ...props }) {
  let background = '#3b82f6'
  let color = '#fff'
  let border = 'none'

  if (secondary) {
    background = '#fff'
    color = '#475569'
    border = '1px solid #cbd5e1'
  }

  if (danger) {
    background = '#fff1f2'
    color = '#be123c'
    border = '1px solid #fecdd3'
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
      ? { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534' }
      : tone === 'info'
        ? { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' }
        : { bg: '#fef2f2', border: '#fecaca', text: '#b91c1c' }

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
      <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 700, color: '#334155' }}>
        {label}
      </label>
      {children}
      {hint && (
        <div style={{ marginTop: 5, fontSize: 12, color: '#94a3b8' }}>
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
        background: '#fff',
        borderRadius: 16,
        border: `1px solid ${danger ? '#fecaca' : '#e2e8f0'}`,
        padding: '24px',
        boxShadow: '0 2px 10px rgba(15, 23, 42, 0.05)',
        marginBottom: 18,
      }}
    >
      <h3 style={{ margin: '0 0 6px', fontSize: 17, color: danger ? '#be123c' : '#0f172a' }}>{title}</h3>
      {subtitle && <p style={{ margin: '0 0 18px', fontSize: 13, color: '#64748b', lineHeight: 1.7 }}>{subtitle}</p>}
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
        border: '1px solid #cbd5e1',
        fontSize: 14,
        fontFamily: FONT,
        color: '#0f172a',
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
        borderBottom: '1px solid #f1f5f9',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{label}</div>
        {description && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{description}</div>}
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        style={{ width: 18, height: 18, accentColor: '#3b82f6', cursor: 'inherit' }}
      />
    </label>
  )
}
