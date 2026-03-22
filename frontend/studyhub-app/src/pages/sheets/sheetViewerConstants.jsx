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
  return String(name).slice(dotIndex + 1).toLowerCase()
}

function attachmentPreviewKind(attachmentType, attachmentName) {
  const normalized = String(attachmentType || '').toLowerCase()
  const extension = attachmentExtension(attachmentName)
  if (normalized === 'pdf' || extension === 'pdf') return 'pdf'
  if (normalized === 'image' || normalized.startsWith('image/') || IMAGE_EXTENSIONS.has(extension)) return 'image'
  return 'document'
}

function panelStyle() {
  return {
    background: '#fff',
    borderRadius: 18,
    border: '1px solid #e2e8f0',
    padding: 18,
  }
}

function actionButton(color = '#475569') {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    border: '1px solid #e2e8f0',
    background: '#fff',
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
    border: '1px solid #dbeafe',
    background: '#eff6ff',
    color: '#1d4ed8',
    padding: '8px 12px',
    fontSize: 12,
    fontWeight: 700,
    textDecoration: 'none',
  }
}

function errorBanner(message) {
  if (!message) return null
  return (
    <div
      style={{
        background: '#fef2f2',
        color: '#dc2626',
        border: '1px solid #fecaca',
        borderRadius: 14,
        padding: '12px 14px',
        fontSize: 13,
      }}
    >
      {message}
    </div>
  )
}

function statusBadge(status) {
  const colors = {
    pending: { bg: '#fef3c7', color: '#92400e' },
    accepted: { bg: '#dcfce7', color: '#166534' },
    rejected: { bg: '#fee2e2', color: '#991b1b' },
  }
  const c = colors[status] || colors.pending
  return {
    fontSize: 11, fontWeight: 800, textTransform: 'uppercase',
    padding: '2px 8px', borderRadius: 6,
    background: c.bg, color: c.color,
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
  errorBanner,
  statusBadge,
}
