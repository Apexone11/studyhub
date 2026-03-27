/* ═══════════════════════════════════════════════════════════════════════════
 * sidebarComponents.jsx — React components extracted from sidebarConstants
 * to satisfy react-refresh/only-export-components.
 * ═══════════════════════════════════════════════════════════════════════════ */

export function Avatar({ name, size = 48, role }) {
  const initials = (name || '?').slice(0, 2).toUpperCase()
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: role === 'admin' ? 'var(--sh-brand)' : 'var(--sh-avatar-bg)',
      color: role === 'admin' ? '#fff' : 'var(--sh-avatar-text)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.35, fontWeight: 700, flexShrink: 0,
      border: '2px solid var(--sh-border)',
    }}>
      {initials}
    </div>
  )
}
