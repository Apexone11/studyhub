/**
 * Sheet Lab — helper functions and constants.
 */

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
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
  return date.toLocaleDateString()
}

export function truncateChecksum(checksum) {
  if (!checksum) return ''
  return checksum.slice(0, 8)
}
