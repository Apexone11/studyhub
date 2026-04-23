/* ═══════════════════════════════════════════════════════════════════════════
 * uploadSheetConstants.js — Shared constants and helpers for UploadSheet.
 *
 * The MiniPreview component lives in uploadSheetComponents.jsx to satisfy
 * react-refresh/only-export-components. It is re-exported here for
 * backward-compatible imports.
 * ═══════════════════════════════════════════════════════════════════════════ */

/* ── Shared constants ──────────────────────────────────────────────────── */
export const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"

/* Allowed attachment types — validated on both client and server */
export const ATTACH_ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]
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
  if (tier === 0) return 'Passed'
  if (tier === 1) return 'Minor Findings'
  if (tier === 2) return 'Needs Review'
  if (tier === 3) return 'Quarantined'
  return 'Unknown'
}

export function tierColor(tier) {
  if (tier === 0) return 'var(--sh-success)'
  if (tier === 1) return 'var(--sh-warning)'
  if (tier === 2) return 'var(--sh-warning)'
  if (tier === 3) return 'var(--sh-danger)'
  return 'var(--sh-slate-500)'
}

/* ── Hook: useSafeBlocker ──────────────────────────────────────────────── */
import { useBlocker } from 'react-router-dom'

export function useSafeBlocker(predicate) {
  try {
    return useBlocker(predicate)
  } catch {
    return { state: 'unblocked' }
  }
}

/* ── Re-export from uploadSheetComponents.jsx ──────────────────────────── */
export { MiniPreview } from './uploadSheetComponents.jsx'
