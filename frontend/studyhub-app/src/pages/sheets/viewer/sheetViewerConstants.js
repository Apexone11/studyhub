/* ═══════════════════════════════════════════════════════════════════════════
 * sheetViewerConstants.js — Constants and style helpers for SheetViewerPage.
 *
 * JSX-rendering helpers (errorBanner) live in sheetViewerComponents.jsx
 * and are re-exported here for backward-compatible imports.
 * ═══════════════════════════════════════════════════════════════════════════ */

const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif'])

function authHeaders() {
  return { 'Content-Type': 'application/json' }
}

function timeAgo(value) {
  if (!value) return 'recently'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'recently'
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function attachmentExtension(name = '') {
  const dotIndex = String(name).lastIndexOf('.')
  if (dotIndex < 0) return ''
  return String(name)
    .slice(dotIndex + 1)
    .toLowerCase()
}

function attachmentPreviewKind(attachmentType, attachmentName) {
  const normalized = String(attachmentType || '').toLowerCase()
  const extension = attachmentExtension(attachmentName)
  if (normalized === 'pdf' || extension === 'pdf') return 'pdf'
  if (normalized === 'image' || normalized.startsWith('image/') || IMAGE_EXTENSIONS.has(extension))
    return 'image'
  return 'document'
}

function panelStyle() {
  return {
    background: 'var(--sh-surface)',
    borderRadius: 18,
    border: '1px solid var(--sh-border)',
    padding: 18,
  }
}

function actionButton(color = 'var(--sh-slate-600)') {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    border: '1px solid var(--sh-border)',
    background: 'var(--sh-surface)',
    color,
    padding: '8px 12px',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: FONT,
  }
}

function linkButton() {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    border: '1px solid var(--sh-info-border)',
    background: 'var(--sh-info-bg)',
    color: 'var(--sh-info-text)',
    padding: '8px 12px',
    fontSize: 12,
    fontWeight: 700,
    textDecoration: 'none',
  }
}

function statusBadge(status) {
  const colors = {
    pending: { bg: 'var(--sh-warning-bg)', color: 'var(--sh-warning-text)' },
    accepted: { bg: 'var(--sh-success-bg)', color: 'var(--sh-success-text)' },
    rejected: { bg: 'var(--sh-danger-bg)', color: 'var(--sh-danger-text)' },
  }
  const c = colors[status] || colors.pending
  return {
    fontSize: 11,
    fontWeight: 800,
    textTransform: 'uppercase',
    padding: '2px 8px',
    borderRadius: 6,
    background: c.bg,
    color: c.color,
  }
}

function statusPill(status) {
  const colorMap = {
    published: {
      bg: 'var(--sh-success-bg)',
      color: 'var(--sh-success)',
      border: 'var(--sh-success-border)',
    },
    pending_review: {
      bg: 'var(--sh-warning-bg)',
      color: 'var(--sh-warning-text)',
      border: 'var(--sh-warning-border)',
    },
    rejected: {
      bg: 'var(--sh-danger-bg)',
      color: 'var(--sh-danger)',
      border: 'var(--sh-danger-border)',
    },
    quarantined: {
      bg: 'var(--sh-danger-bg)',
      color: 'var(--sh-danger)',
      border: 'var(--sh-danger-border)',
    },
    draft: { bg: 'var(--sh-soft)', color: 'var(--sh-muted)', border: 'var(--sh-border)' },
  }
  const c = colorMap[status] || colorMap.draft
  return {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 10px',
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'capitalize',
    background: c.bg,
    color: c.color,
    border: `1px solid ${c.border}`,
    letterSpacing: '0.02em',
  }
}

function secondaryDropdown() {
  return {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: 6,
    background: 'var(--sh-surface)',
    border: '1px solid var(--sh-border)',
    borderRadius: 12,
    boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
    padding: 4,
    zIndex: 30,
    minWidth: 200,
  }
}

function dropdownItem() {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    padding: '9px 12px',
    border: 'none',
    borderRadius: 8,
    background: 'transparent',
    color: 'var(--sh-text)',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
    textAlign: 'left',
    textDecoration: 'none',
  }
}

export {
  FONT,
  IMAGE_EXTENSIONS,
  authHeaders,
  timeAgo,
  attachmentExtension,
  attachmentPreviewKind,
  panelStyle,
  actionButton,
  linkButton,
  statusBadge,
  statusPill,
  secondaryDropdown,
  dropdownItem,
}

/* ── Re-export JSX helpers from sheetViewerComponents.jsx ──────────────── */
export { errorBanner } from './sheetViewerComponents.jsx'
