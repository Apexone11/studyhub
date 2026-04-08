/* ═══════════════════════════════════════════════════════════════════════════
 * useKeyboardShortcuts.js — Global keyboard shortcuts hook
 *
 * Provides Ctrl/Cmd+K quick search trigger. Works alongside the existing
 * KeyboardShortcuts component (? key) and Navbar (Ctrl+K for search modal).
 *
 * This hook adds the data-search-trigger click shortcut for pages that
 * may not render the Navbar search box (e.g., legal pages).
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useEffect } from 'react'

export function useKeyboardShortcuts() {
  useEffect(() => {
    function handleKeyDown(e) {
      // Don't trigger when typing in inputs
      if (
        e.target.tagName === 'INPUT' ||
        e.target.tagName === 'TEXTAREA' ||
        e.target.tagName === 'SELECT' ||
        e.target.isContentEditable
      ) {
        return
      }

      // Ctrl/Cmd + K — Quick search
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        document.querySelector('[data-search-trigger]')?.click()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])
}
