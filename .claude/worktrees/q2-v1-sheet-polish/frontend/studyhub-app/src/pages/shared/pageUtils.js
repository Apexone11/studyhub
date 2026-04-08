export const PAGE_FONT = "'Plus Jakarta Sans', system-ui, sans-serif"

export function authHeaders() {
  return {
    'Content-Type': 'application/json',
  }
}

export function timeAgo(value) {
  const seconds = (Date.now() - new Date(value)) / 1000

  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}
