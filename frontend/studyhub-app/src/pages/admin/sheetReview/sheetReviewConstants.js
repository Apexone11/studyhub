/* ═══════════════════════════════════════════════════════════════════════════
 * sheetReviewConstants.js — Shared styles and helpers for SheetReviewPanel
 * ═══════════════════════════════════════════════════════════════════════════ */

export const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"

export function formatDateTime(value) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleString()
}

export function severityColor(severity) {
  if (severity === 'error' || severity === 'critical') return '#dc2626'
  if (severity === 'high') return '#ea580c'
  if (severity === 'warning') return '#d97706'
  return '#64748b'
}

export const overlayStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 1000,
  background: 'rgba(15, 23, 42, 0.6)',
  backdropFilter: 'blur(4px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
}

export const panelStyle = {
  width: 'min(95vw, 960px)',
  maxHeight: '90vh',
  background: 'var(--sh-surface)',
  borderRadius: 20,
  border: '1px solid var(--sh-border)',
  boxShadow: 'var(--shadow-lg)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  fontFamily: FONT,
}

export const closeBtnStyle = {
  padding: '7px 14px',
  borderRadius: 8,
  border: '1px solid var(--sh-border)',
  background: 'var(--sh-soft)',
  color: 'var(--sh-subtext)',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: FONT,
}
