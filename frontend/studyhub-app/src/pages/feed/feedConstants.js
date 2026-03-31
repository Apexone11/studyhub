/* ── Feed shared constants, styles, and helpers ──────────────────────── */
export const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"
export const FILTERS = ['for-you', 'all', 'posts', 'sheets', 'notes', 'announcements']

export const COMPOSER_PROMPTS = [
  'Share an update, mention classmates with @username, or point people to a great sheet…',
  'What are you studying this week? Share a tip with your class…',
  'Post a question, resource, or link for your classmates…',
  'Found a great study sheet? Tag it with @username and share…',
  'Ask for help, share notes, or drop a helpful link…',
]

/* ── Style objects ───────────────────────────────────────────────────── */
export const commentSectionContainerStyle = {
  marginTop: 14,
  borderTop: '1px solid var(--sh-border)',
  paddingTop: 12,
}
export const commentToggleButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: 'none',
  border: 'none',
  color: 'var(--sh-subtext)',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
  padding: 0,
  fontFamily: FONT,
}
export const commentExpandedContentStyle = { marginTop: 12 }
export const commentInputRowStyle = { display: 'flex', gap: 8, marginBottom: 12 }
export const commentTextareaStyle = {
  width: '100%',
  resize: 'vertical',
  borderRadius: 10,
  border: '1px solid var(--sh-input-border)',
  padding: '8px 12px',
  fontSize: 13,
  fontFamily: FONT,
  color: 'var(--sh-input-text)',
  background: 'var(--sh-input-bg)',
  boxSizing: 'border-box',
}
export const commentInputFooterStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginTop: 6,
}
export const commentMetaTextStyle = { color: 'var(--sh-muted)', fontSize: 13, padding: '8px 0' }
export const commentErrorTextStyle = { color: 'var(--sh-danger)', fontSize: 12, marginTop: 4 }
export const commentListStyle = { display: 'grid', gap: 8 }
export const commentItemStyle = {
  display: 'flex',
  gap: 8,
  padding: '8px 10px',
  borderRadius: 10,
  background: 'var(--sh-soft)',
}
export const commentHeaderStyle = { display: 'flex', justifyContent: 'space-between', gap: 8 }
export const commentAuthorStyle = { fontSize: 12, fontWeight: 700, color: 'var(--sh-heading)' }
export const commentTimestampStyle = { fontSize: 11, color: 'var(--sh-muted)', marginLeft: 8 }
export const commentDeleteButtonStyle = {
  background: 'none',
  border: 'none',
  color: 'var(--sh-muted)',
  fontSize: 11,
  cursor: 'pointer',
  padding: '0 4px',
  fontFamily: FONT,
}
export const commentBodyStyle = {
  margin: '2px 0 0',
  fontSize: 13,
  color: 'var(--sh-subtext)',
  lineHeight: 1.6,
  whiteSpace: 'pre-wrap',
}

export function commentButtonStyle(hasValue, posting) {
  return {
    borderRadius: 8,
    border: 'none',
    background: hasValue ? 'var(--sh-brand)' : 'var(--sh-border)',
    color: hasValue ? 'var(--sh-surface)' : 'var(--sh-muted)',
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: 700,
    cursor: posting || !hasValue ? 'not-allowed' : 'pointer',
    fontFamily: FONT,
  }
}

/* ── Helper functions ────────────────────────────────────────────────── */
export function authHeaders() {
  return { 'Content-Type': 'application/json' }
}

export function timeAgo(value) {
  if (!value) return 'recently'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'recently'
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

export function courseColor(code = '') {
  const prefix = code.replace(/\d.*/, '').toUpperCase()
  const palette = {
    CMSC: '#8b5cf6',
    MATH: '#10b981',
    ENGL: '#f59e0b',
    PHYS: '#0ea5e9',
    BIOL: '#ec4899',
    HIST: '#6366f1',
    ECON: '#14b8a6',
    CHEM: '#f97316',
  }
  return palette[prefix] || '#2563eb'
}

export function actionButton(color) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    border: '1px solid var(--sh-border)',
    background: 'var(--sh-surface)',
    color,
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: FONT,
  }
}

export function linkButton() {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    border: '1px solid transparent',
    background: 'var(--sh-brand-soft)',
    color: 'var(--sh-brand-hover)',
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 700,
    textDecoration: 'none',
  }
}

export function pillStyle() {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    background: 'var(--sh-soft)',
    border: '1px solid var(--sh-border)',
    padding: '6px 12px',
    fontSize: 12,
    color: 'var(--sh-subtext)',
    fontWeight: 700,
  }
}
