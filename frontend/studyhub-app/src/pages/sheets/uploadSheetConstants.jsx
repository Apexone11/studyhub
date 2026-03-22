/* ═══════════════════════════════════════════════════════════════════════════
 * uploadSheetConstants.js — Shared constants, helpers, and small components
 * for the UploadSheet feature.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useBlocker } from 'react-router-dom'

/* ── Shared constants ──────────────────────────────────────────────────── */
export const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"

/* Allowed attachment types — validated on both client and server */
export const ATTACH_ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp']
export const ATTACH_ALLOWED_EXT = ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp']
export const ATTACH_MAX_BYTES = 10 * 1024 * 1024 // 10 MB

export function authHeaders() {
  return {
    'Content-Type': 'application/json',
  }
}

export function validateAttachment(file) {
  if (!file) return ''
  const ext = `.${String(file.name).split('.').pop().toLowerCase()}`
  if (!ATTACH_ALLOWED_TYPES.includes(file.type) || !ATTACH_ALLOWED_EXT.includes(ext)) {
    return 'Attachment must be a PDF or image (JPEG, PNG, GIF, WebP).'
  }
  if (file.size > ATTACH_MAX_BYTES) return 'Attachment must be 10 MB or smaller.'
  return ''
}

export function tierLabel(tier) {
  if (tier === 0) return 'Clean'
  if (tier === 1) return 'Flagged'
  if (tier === 2) return 'High Risk'
  if (tier === 3) return 'Quarantined'
  return 'Unknown'
}

export function tierColor(tier) {
  if (tier === 0) return '#16a34a'
  if (tier === 1) return '#ca8a04'
  if (tier === 2) return '#ea580c'
  if (tier === 3) return '#dc2626'
  return '#64748b'
}

export function useSafeBlocker(predicate) {
  try {
    return useBlocker(predicate)
  } catch {
    return { state: 'unblocked' }
  }
}

export function MiniPreview({ md }) {
  if (!md) return <div style={{ fontSize: 12, color: 'var(--sh-muted)', fontStyle: 'italic' }}>Start typing to preview…</div>
  return (
    <div
      style={{
        borderRadius: 12,
        border: '1px solid var(--sh-border)',
        background: 'var(--sh-soft)',
        padding: 14,
        color: 'var(--sh-text)',
        fontSize: 13,
        lineHeight: 1.8,
        whiteSpace: 'pre-wrap',
      }}
    >
      {md}
    </div>
  )
}
