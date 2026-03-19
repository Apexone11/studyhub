/* ═══════════════════════════════════════════════════════════════════════════
 * usePageTitle.js — Sets document.title for the current page
 *
 * Usage:  usePageTitle('Feed')       →  "Feed — StudyHub"
 *         usePageTitle('Sheet Name') →  "Sheet Name — StudyHub"
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useEffect } from 'react'

const SUFFIX = 'StudyHub'

export function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} — ${SUFFIX}` : SUFFIX
    return () => { document.title = SUFFIX }
  }, [title])
}
