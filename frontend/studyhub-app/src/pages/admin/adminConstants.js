export const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"
export const PAGE_SIZE = 20

export const TABS = [
  ['overview', 'Overview'],
  ['analytics', 'Analytics'],
  ['users', 'Users'],
  ['sheets', 'Sheets'],
  ['sheet-reviews', 'Sheet Reviews'],
  ['announcements', 'Announcements'],
  ['deletion-reasons', 'Deletion Reasons'],
  ['email-suppressions', 'Email Suppressions'],
  ['moderation', 'Moderation'],
  ['schools', 'Schools'],
  ['settings', 'Admin Settings'],
  ['revenue', 'Revenue'],
  ['reviews', 'Reviews'],
  ['group-reports', 'Group Reports'],
  ['waitlist', 'Waitlist'],
  ['security', 'Security'],
  ['activation', 'Activation'],
  ['referrals-admin', 'Referrals'],
  ['observability', 'Observability'],
  ['consent-log', 'Consent Log'],
]

export function authHeaders() {
  return { 'Content-Type': 'application/json' }
}

export function createPageState() {
  return { loading: false, loaded: false, error: '', page: 1, total: 0, items: [] }
}

export function createAuditState() {
  return {
    loading: false,
    loaded: false,
    error: '',
    page: 1,
    total: 0,
    entries: [],
    suppression: null,
    suppressionId: null,
  }
}

export function formatDateTime(value) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleString()
}

export function formatLabel(value, fallback = 'Unknown') {
  const normalized = String(value || '')
    .replace(/[_-]/g, ' ')
    .trim()
  if (!normalized) return fallback
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

export const tableHeadStyle = {
  padding: '10px 14px',
  textAlign: 'left',
  fontWeight: 700,
  color: 'var(--sh-slate-500)',
  borderBottom: '1px solid var(--sh-border)',
  whiteSpace: 'nowrap',
}

export const tableCell = {
  padding: '10px 14px',
  color: 'var(--sh-slate-600)',
  verticalAlign: 'top',
}
export const tableCellStrong = { ...tableCell, fontWeight: 700, color: 'var(--sh-slate-900)' }

export const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '11px 12px',
  borderRadius: 10,
  border: '1px solid var(--sh-input-border)',
  fontSize: 13,
  color: 'var(--sh-input-text)',
  fontFamily: FONT,
}

export const primaryButton = {
  width: 'fit-content',
  padding: '10px 16px',
  borderRadius: 10,
  border: 'none',
  background: 'var(--sh-brand)',
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
  background: 'var(--sh-brand)',
  color: '#fff',
  fontSize: 13,
  fontWeight: 700,
  textDecoration: 'none',
}

export const settingsCardStyle = {
  border: '1px solid var(--sh-border)',
  borderRadius: 14,
  padding: '16px 18px',
  background: 'var(--sh-soft)',
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
    border: '1px solid var(--sh-border)',
    background: 'var(--sh-surface)',
    color: disabled ? 'var(--sh-slate-300)' : 'var(--sh-slate-600)',
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
    border: active ? '1px solid var(--sh-success-border)' : '1px solid var(--sh-slate-300)',
    background: active ? 'var(--sh-success-bg)' : 'var(--sh-soft)',
    color: active ? 'var(--sh-success-text)' : 'var(--sh-slate-600)',
    fontSize: 11,
    fontWeight: 700,
  }
}
