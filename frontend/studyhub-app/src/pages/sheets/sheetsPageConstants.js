export const SORT_OPTIONS = [
  { value: 'recommended', label: 'Best' },
  { value: 'createdAt', label: 'Recent' },
  { value: 'stars', label: 'Stars' },
  { value: 'forks', label: 'Forks' },
  { value: 'updatedAt', label: 'Updated' },
]

export const FORMAT_OPTIONS = [
  { value: 'all', label: 'All formats' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'html', label: 'HTML' },
  { value: 'pdf', label: 'PDF' },
]

export const STATUS_OPTIONS = [
  { value: 'draft', label: 'Drafts' },
  { value: 'pending_review', label: 'Pending review' },
  { value: 'published', label: 'Published' },
  { value: 'rejected', label: 'Rejected' },
]

const EDITABLE_SHEET_STATUSES = new Set(['draft', 'pending_review', 'rejected', 'quarantined'])

export function authHeaders() {
  return { 'Content-Type': 'application/json' }
}

export function isEditableSheetStatus(status) {
  return EDITABLE_SHEET_STATUSES.has(
    String(status || '')
      .trim()
      .toLowerCase(),
  )
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

export function resolveSheetFormat(sheet) {
  const attachmentType = String(sheet?.attachmentType || '').toLowerCase()
  if (attachmentType.includes('pdf')) return 'pdf'
  const contentFormat = String(sheet?.contentFormat || '').toLowerCase()
  if (contentFormat === 'html') return 'html'
  return 'markdown'
}

export function formatBadgeText(format) {
  if (format === 'html') return 'HTML'
  if (format === 'pdf') return 'PDF'
  return 'MD'
}

export function computeSignalBadge(sheet) {
  const stars = sheet.stars || 0
  const forks = sheet.forks || 0
  const downloads = sheet.downloads || 0
  const createdAt = new Date(sheet.createdAt)
  const ageDays = Math.max(1, (Date.now() - createdAt.getTime()) / 86400000)

  if (stars >= 10 || (forks >= 5 && stars >= 3)) return 'popular'
  if (ageDays <= 7 && stars >= 3) return 'trending'
  if (ageDays <= 3) return 'new'
  if (downloads >= 20) return 'well-used'
  return null
}

export const SIGNAL_BADGE_CONFIG = {
  popular: { label: 'Popular', className: 'sheets-repo-row__signal--popular' },
  trending: { label: 'Trending', className: 'sheets-repo-row__signal--trending' },
  new: { label: 'New', className: 'sheets-repo-row__signal--new' },
  'well-used': { label: 'Well used', className: 'sheets-repo-row__signal--well-used' },
}
