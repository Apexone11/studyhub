/* ═══════════════════════════════════════════════════════════════════════════
 * profileConstants.js — Shared constants and helpers for UserProfilePage
 * ═══════════════════════════════════════════════════════════════════════════ */

export const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"

export function authHeaders() {
  return { 'Content-Type': 'application/json' }
}

export const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : ''

export const pageWrapStyle = {
  minHeight: '100vh',
  background: 'var(--sh-bg)',
  fontFamily: FONT,
}

export const containerStyle = {
  maxWidth: 1100,
  width: '100%',
  margin: '0 auto',
  padding: 'clamp(20px, 3vw, 40px) clamp(12px, 2vw, 24px)',
  boxSizing: 'border-box',
}

export const cardStyle = {
  background: 'var(--sh-surface)',
  borderRadius: 18,
  border: '1px solid var(--sh-border)',
  padding: '24px 28px',
  boxShadow: 'var(--shadow-sm, 0 2px 10px rgba(15,23,42,0.05))',
}

export const sectionHeadingStyle = {
  margin: '0 0 16px',
  fontSize: 15,
  fontWeight: 700,
  color: 'var(--sh-heading)',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
}

export const pillStyle = {
  fontSize: 11,
  fontWeight: 700,
  padding: '2px 8px',
  borderRadius: 99,
  background: 'var(--sh-pill-bg)',
  color: 'var(--sh-pill-text)',
  border: '1px solid var(--sh-brand-soft)',
}

/* ── Tab definitions ──────────────────────────────────────────────────── */
export const OWN_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'study', label: 'Study' },
  { key: 'sheets', label: 'Sheets' },
  { key: 'posts', label: 'Posts' },
  { key: 'achievements', label: 'Achievements' },
]

export const OWN_TABS_SELF_LEARNER = [
  { key: 'overview', label: 'Overview' },
  { key: 'learning', label: 'My learning' },
  { key: 'sheets', label: 'Sheets' },
  { key: 'posts', label: 'Posts' },
  { key: 'achievements', label: 'Achievements' },
]

export const OTHER_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'sheets', label: 'Sheets' },
  { key: 'posts', label: 'Posts' },
  { key: 'achievements', label: 'Achievements' },
]

export const DEFAULT_TAB = 'overview'

export function tabsForProfile({ isOwn, accountType }) {
  if (!isOwn) return OTHER_TABS
  return accountType === 'other' ? OWN_TABS_SELF_LEARNER : OWN_TABS
}

export function isValidTab(tab, isOwn, accountType) {
  const tabs = tabsForProfile({ isOwn, accountType })
  return tabs.some((t) => t.key === tab)
}
