/* ═══════════════════════════════════════════════════════════════════════════
 * BioEditor.jsx — Inline edit-on-click bio editor (own profile only)
 *
 * UX:
 *   • Click bio text or "Add a bio" placeholder to enter edit mode
 *   • ≤500 chars, character counter visible
 *   • Save on blur OR Cmd/Ctrl+Enter; Esc cancels
 *   • Optimistic UI WITH server confirmation per CLAUDE.md A4:
 *       const persisted = data.user?.bio ?? requested
 *   • Surface errors via toast
 *
 * Backend contract:
 *   PATCH /api/settings/profile  { bio }  →  { user: { bio, ... } }
 *   Server enforces ≤500 chars and trims; null = cleared.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useRef, useState } from 'react'
// useRef is still used for the textarea DOM node.
import { API } from '../../config'
import { showToast } from '../../lib/toast'
import { authHeaders } from './profileConstants'

const MAX_BIO_LENGTH = 500

export default function BioEditor({ initialBio, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(initialBio || '')
  const [saving, setSaving] = useState(false)
  const textareaRef = useRef(null)
  // React 19 "Storing information from previous renders" pattern — see
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  // We track the prop value as state to detect a prop change in render
  // and immediately reset both `value` and `lastSavedBio` to the new prop
  // — but only while NOT editing, so we never clobber in-progress input.
  const [lastSyncedBio, setLastSyncedBio] = useState(initialBio || '')
  const [lastSavedBio, setLastSavedBio] = useState(initialBio || '')
  if (!editing && lastSyncedBio !== (initialBio || '')) {
    setLastSyncedBio(initialBio || '')
    setLastSavedBio(initialBio || '')
    setValue(initialBio || '')
  }

  // Auto-focus + place caret at end when entering edit mode
  useEffect(() => {
    if (editing && textareaRef.current) {
      const ta = textareaRef.current
      ta.focus()
      const len = ta.value.length
      ta.setSelectionRange(len, len)
    }
  }, [editing])

  async function commit(rawValue) {
    const requested = (rawValue || '').trim().slice(0, MAX_BIO_LENGTH)
    // No-op if unchanged
    if (requested === (lastSavedBio || '').trim()) {
      setEditing(false)
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`${API}/api/settings/profile`, {
        method: 'PATCH',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ bio: requested.length === 0 ? null : requested }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        showToast(data?.error || 'Could not save bio. Please try again.', 'error')
        return
      }
      // CLAUDE.md A4: hydrate from server, never invert local state.
      const persisted =
        typeof data?.user?.bio === 'string' || data?.user?.bio === null
          ? (data.user.bio ?? '')
          : requested
      setLastSavedBio(persisted)
      setLastSyncedBio(persisted)
      setValue(persisted)
      onSaved?.(persisted)
      setEditing(false)
      showToast('Bio updated.', 'success')
    } catch {
      showToast('Check your connection and try again.', 'error')
    } finally {
      setSaving(false)
    }
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault()
      setValue(lastSavedBio || '')
      setEditing(false)
      return
    }
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      commit(value)
    }
  }

  if (!editing) {
    const hasBio = Boolean((initialBio || '').trim())
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={hasBio ? 'Edit your bio' : 'Add a bio'}
        data-testid="bio-edit-trigger"
        className="profile-bio-edit-trigger"
        style={{
          display: 'block',
          textAlign: 'left',
          background: 'transparent',
          border: '1px dashed transparent',
          borderRadius: 8,
          padding: '6px 8px',
          margin: '0 0 12px -8px',
          color: hasBio ? 'rgba(255,255,255,0.86)' : 'rgba(255,255,255,0.55)',
          fontFamily: 'inherit',
          fontSize: 14,
          lineHeight: 1.7,
          maxWidth: 720,
          cursor: 'pointer',
          whiteSpace: 'pre-wrap',
          fontStyle: hasBio ? 'normal' : 'italic',
        }}
      >
        {hasBio ? initialBio : 'Add a short bio to tell others what you study.'}
      </button>
    )
  }

  const remaining = MAX_BIO_LENGTH - value.length
  const overLimit = remaining < 0

  return (
    <div
      style={{
        maxWidth: 720,
        marginBottom: 12,
        background: 'rgba(255,255,255,0.08)',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: 10,
        padding: 10,
        backdropFilter: 'blur(6px)',
      }}
    >
      <label htmlFor="profile-bio-textarea" style={{ position: 'absolute', left: -9999 }}>
        Bio
      </label>
      <textarea
        id="profile-bio-textarea"
        ref={textareaRef}
        value={value}
        disabled={saving}
        maxLength={MAX_BIO_LENGTH}
        rows={3}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => commit(value)}
        onKeyDown={handleKeyDown}
        placeholder="Share what you're studying, your interests, anything…"
        data-testid="bio-editor-textarea"
        style={{
          width: '100%',
          background: 'transparent',
          border: 'none',
          outline: 'none',
          resize: 'vertical',
          color: 'var(--sh-nav-text)',
          fontFamily: 'inherit',
          fontSize: 14,
          lineHeight: 1.6,
          minHeight: 60,
          boxSizing: 'border-box',
        }}
      />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 6,
          fontSize: 11,
          color: overLimit ? 'var(--sh-danger-text)' : 'rgba(255,255,255,0.6)',
        }}
      >
        <span aria-live="polite">
          {saving ? 'Saving…' : 'Save on blur or Ctrl+Enter · Esc cancels'}
        </span>
        <span data-testid="bio-char-count">
          {value.length}/{MAX_BIO_LENGTH}
        </span>
      </div>
    </div>
  )
}
