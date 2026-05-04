/* ═══════════════════════════════════════════════════════════════════════════
 * aiDensityStorage.js — localStorage helpers for the Hub AI density toggle.
 * ═══════════════════════════════════════════════════════════════════════════ */
const STORAGE_KEY = 'studyhub.ai.density'

export function loadDensity() {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'compact' ? 'compact' : 'comfortable'
  } catch {
    return 'comfortable'
  }
}

export function saveDensity(value) {
  try {
    localStorage.setItem(STORAGE_KEY, value)
  } catch {
    /* ignore */
  }
}
