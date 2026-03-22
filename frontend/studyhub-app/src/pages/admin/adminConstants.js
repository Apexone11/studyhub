export const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"
export const PAGE_SIZE = 20

export const TABS = [
  ['overview', 'Overview'],
  ['users', 'Users'],
  ['sheets', 'Sheets'],
  ['sheet-reviews', 'Sheet Reviews'],
  ['announcements', 'Announcements'],
  ['deletion-reasons', 'Deletion Reasons'],
  ['email-suppressions', 'Email Suppressions'],
  ['moderation', 'Moderation'],
  ['settings', 'Admin Settings'],
]

export function authHeaders() {
  return { 'Content-Type': 'application/json' }
}

export function createPageState() {
  return { loading: false, loaded: false, error: '', page: 1, total: 0, items: [] }
}

export function createAuditState() {
  return { loading: false, loaded: false, error: '', page: 1, total: 0, entries: [], suppression: null, suppressionId: null }
}

export function formatDateTime(value) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleString()
}

export function formatLabel(value, fallback = 'Unknown') {
  const normalized = String(value || '').replace(/[_-]/g, ' ').trim()
  if (!normalized) return fallback
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

export const tableHeadStyle = {
  padding: '10px 14px',
  textAlign: 'left',
  fontWeight: 700,
  color: '#64748b',
  borderBottom: '1px solid #e2e8f0',
  whiteSpace: 'nowrap',
}

export const tableCell = { padding: '10px 14px', color: '#475569', verticalAlign: 'top' }
export const tableCellStrong = { ...tableCell, fontWeight: 700, color: '#0f172a' }

export const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '11px 12px',
  borderRadius: 10,
  border: '1px solid #dbe1e8',
  fontSize: 13,
  color: '#0f172a',
  fontFamily: FONT,
}

export const primaryButton = {
  width: 'fit-content',
  padding: '10px 16px',
  borderRadius: 10,
  border: 'none',
  background: '#3b82f6',
  color: '#fff',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: FONT,
}

export const primaryButtonLink = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '10px 16px',
  borderRadius: 10,
  background: '#3b82f6',
  color: '#fff',
  fontSize: 13,
  fontWeight: 700,
  textDecoration: 'none',
}

export const settingsCardStyle = {
  border: '1px solid #e2e8f0',
  borderRadius: 14,
  padding: '16px 18px',
  background: '#f8fafc',
}

export const filterSelectStyle = {
  borderRadius: 8,
  border: '1px solid var(--sh-input-border)',
  padding: '7px 10px',
  fontSize: 12,
  color: 'var(--sh-subtext)',
  fontFamily: FONT,
  background: 'var(--sh-input-bg)',
}

export function pillButton(background, color, borderColor) {
  return {
    padding: '6px 12px',
    borderRadius: 999,
    border: `1px solid ${borderColor}`,
    background,
    color,
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: FONT,
  }
}

export function pagerButton(disabled) {
  return {
    padding: '7px 14px',
    borderRadius: 8,
    border: '1px solid #e2e8f0',
    background: '#fff',
    color: disabled ? '#cbd5e1' : '#475569',
    fontSize: 12,
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: FONT,
  }
}

export function suppressionStatusPill(active) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '4px 10px',
    borderRadius: 999,
    border: active ? '1px solid #a7f3d0' : '1px solid #cbd5e1',
    background: active ? '#ecfdf5' : '#f8fafc',
    color: active ? '#047857' : '#475569',
    fontSize: 11,
    fontWeight: 700,
  }
}
