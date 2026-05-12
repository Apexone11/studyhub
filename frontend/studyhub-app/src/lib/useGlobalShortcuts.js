/* ═══════════════════════════════════════════════════════════════════════════
 * useGlobalShortcuts.js — App-wide keyboard navigation
 *
 * Wires the GitHub / Linear / Slack-style shortcut set:
 *   - `?`  (Shift+/) → toggle the KeyboardShortcutsModal
 *   - `g h` → navigate to /feed
 *   - `g s` → navigate to /sheets
 *   - `g n` → navigate to /notes
 *   - `g m` → navigate to /messages
 *   - `g a` → navigate to /ai
 *   - `/`   → focus the global search bar (or open the search modal
 *             if the navbar exposes only a button)
 *
 * Editable-context guard: any keypress while focus is inside an
 * <input>, <textarea>, <select>, or a `contenteditable` element is
 * ignored so users typing into composers / forms aren't hijacked.
 *
 * Sequence handling: the leader `g` arms a 1200ms window during which
 * the next single keypress fires the corresponding navigation. Any
 * unmatched key cancels the sequence cleanly.
 *
 * Modifier guard: shortcuts (other than `?` which requires Shift) are
 * ignored when any of Cmd/Ctrl/Alt are held so we never collide with
 * browser or OS chords (Ctrl+/ formatting, Cmd+S save, etc.).
 *
 * Side-effect-only hook — returns nothing; mount once near the App root.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

const SEQUENCE_TIMEOUT_MS = 1200

const G_SEQUENCE_MAP = {
  h: '/feed',
  s: '/sheets',
  n: '/notes',
  m: '/messages',
  a: '/ai',
}

function isEditableTarget(target) {
  if (!target || typeof target !== 'object') return false
  if (target.isContentEditable) return true
  const tag = typeof target.tagName === 'string' ? target.tagName.toUpperCase() : ''
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  // Some rich-text editors render a contenteditable wrapper one level
  // up — check the closest ancestor for safety.
  if (typeof target.closest === 'function') {
    const editable = target.closest('[contenteditable="true"], [contenteditable=""]')
    if (editable) return true
  }
  return false
}

function focusGlobalSearch() {
  if (typeof document === 'undefined') return false
  // The navbar exposes the search affordance as a clickable div with
  // role=button and a stable data attribute. We synthesize a click so
  // the existing modal-open flow stays the single code path that
  // mounts SearchModal. Falls back to focusing the first plausible
  // search input if no trigger is found (e.g., a future redesign).
  const trigger = document.querySelector('[data-search-trigger]')
  if (trigger && typeof trigger.click === 'function') {
    trigger.click()
    return true
  }
  const input =
    document.querySelector('input[type="search"]') ||
    document.querySelector('input[aria-label*="earch"]') ||
    document.querySelector('input[placeholder*="earch"]')
  if (input && typeof input.focus === 'function') {
    input.focus()
    if (typeof input.select === 'function') input.select()
    return true
  }
  return false
}

export default function useGlobalShortcuts() {
  const navigate = useNavigate()
  // useRef so the timeout id and sequence state survive across
  // renders without re-binding the listener.
  const sequenceRef = useRef({ leader: null, timer: null })

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    function clearSequence() {
      if (sequenceRef.current.timer) {
        clearTimeout(sequenceRef.current.timer)
      }
      sequenceRef.current.leader = null
      sequenceRef.current.timer = null
    }

    function armSequence(leader) {
      clearSequence()
      sequenceRef.current.leader = leader
      sequenceRef.current.timer = setTimeout(() => {
        sequenceRef.current.leader = null
        sequenceRef.current.timer = null
      }, SEQUENCE_TIMEOUT_MS)
    }

    function onKeyDown(event) {
      // Skip when typing inside an editable surface. This also guards
      // against the `?` press inside a composer (Shift+/ produces a `?`
      // which the user clearly intends as text).
      if (isEditableTarget(event.target)) return

      // Composing CJK / IME — never hijack.
      if (event.isComposing) return

      // `?` opens the help panel. Some keyboard layouts produce `?` via
      // Shift+/, others via a dedicated key — `event.key === '?'`
      // covers both. Ignore when Ctrl/Cmd/Alt are held to avoid
      // colliding with browser shortcuts.
      if (event.key === '?' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault()
        clearSequence()
        window.dispatchEvent(new CustomEvent('studyhub:shortcuts:toggle'))
        return
      }

      // `/` focuses the search bar (Slack / GitHub convention).
      if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const handled = focusGlobalSearch()
        if (handled) {
          event.preventDefault()
          clearSequence()
        }
        return
      }

      // Sequence shortcuts. Anything with a modifier short-circuits so
      // Ctrl+G (Find Next), Cmd+H (Hide), etc. stay native.
      if (event.ctrlKey || event.metaKey || event.altKey) {
        clearSequence()
        return
      }

      const key = typeof event.key === 'string' ? event.key.toLowerCase() : ''

      // Leader: `g`. Arm the second-key window.
      if (sequenceRef.current.leader == null) {
        if (key === 'g') {
          armSequence('g')
        }
        return
      }

      // Second key in the `g _` sequence.
      if (sequenceRef.current.leader === 'g') {
        const path = G_SEQUENCE_MAP[key]
        clearSequence()
        if (path) {
          event.preventDefault()
          navigate(path)
        }
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      clearSequence()
    }
  }, [navigate])
}
