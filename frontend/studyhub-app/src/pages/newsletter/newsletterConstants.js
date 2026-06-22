/* ═══════════════════════════════════════════════════════════════════════════
 * newsletterConstants — shared category metadata + date formatting for the
 * Product Updates / What's New newsletter surfaces.
 *
 * Categories mirror the backend allowlist: feature, bugfix, announcement,
 * improvement. Each maps to a human label and a token-based color palette so
 * the chip renders identically in light and dark mode (no hardcoded hex).
 * ═══════════════════════════════════════════════════════════════════════════ */

export const PAGE_FONT = "'Plus Jakarta Sans', system-ui, sans-serif"

export const NEWSLETTER_CATEGORIES = ['feature', 'bugfix', 'announcement', 'improvement']

export const CATEGORY_META = {
  feature: {
    label: 'Feature',
    bg: 'var(--sh-info-bg)',
    border: 'var(--sh-info-border)',
    text: 'var(--sh-info-text)',
  },
  bugfix: {
    label: 'Bug fix',
    bg: 'var(--sh-success-bg)',
    border: 'var(--sh-success-border)',
    text: 'var(--sh-success-text)',
  },
  announcement: {
    label: 'Announcement',
    bg: 'var(--sh-warning-bg)',
    border: 'var(--sh-warning-border)',
    text: 'var(--sh-warning-text)',
  },
  improvement: {
    label: 'Improvement',
    bg: 'var(--sh-soft)',
    border: 'var(--sh-border)',
    text: 'var(--sh-muted)',
  },
}

export function categoryMeta(category) {
  return (
    CATEGORY_META[category] || {
      label: category || 'Update',
      bg: 'var(--sh-soft)',
      border: 'var(--sh-border)',
      text: 'var(--sh-muted)',
    }
  )
}

/** Long, human date (e.g. "June 16, 2026"). Returns '' for missing/invalid. */
export function formatIssueDate(value) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}
