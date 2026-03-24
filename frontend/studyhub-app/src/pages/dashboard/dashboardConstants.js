/* ═══════════════════════════════════════════════════════════════════════════
 * dashboardConstants.js — Shared constants and helpers for the Dashboard
 * ═══════════════════════════════════════════════════════════════════════════ */

export const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"

export function authHeaders() {
  return { 'Content-Type': 'application/json' }
}

export function summaryCard(label, value, helper, accent, to) {
  return { label, value, helper, accent, to }
}

export function formatJoinedDate(value) {
  if (!value) return 'Unknown'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}
