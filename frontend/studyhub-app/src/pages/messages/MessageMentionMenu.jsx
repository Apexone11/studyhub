/* ═══════════════════════════════════════════════════════════════════════════
 * MessageMentionMenu.jsx — @username autocomplete for message composers.
 *
 * Triggered when the user types `@` followed by 0+ word characters at the
 * cursor inside a message textarea. Hits `/api/search?type=users&q=` with
 * a 200ms debounce + AbortController so type-ahead doesn't fire a request
 * per keystroke.
 *
 * Standalone — no Hub AI dependencies. ARIA combobox pattern mirrors
 * AiMentionMenu so screen reader users get consistent affordance:
 *   - menu container: role="listbox"
 *   - each option: role="option" id="msg-mention-opt-{i}" aria-selected
 * The caller is responsible for setting role="combobox" + aria-expanded
 * + aria-controls + aria-activedescendant on the textarea.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { API } from '../../config'
import { authHeaders } from '../shared/pageUtils'

/**
 * @param {{
 *   open: boolean,
 *   query: string,
 *   activeIdx: number,
 *   onActiveIdxChange: (i: number) => void,
 *   onSelect: (user: { id: number, username: string }) => void,
 *   currentUserId?: number,
 * }} props
 */
function MessageMentionMenuImpl(
  { open, query, activeIdx, onActiveIdxChange, onSelect, currentUserId = null },
  ref,
) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const listRef = useRef(null)

  // Debounced search. The leading `@` is stripped before we send the query.
  const q = (query || '').replace(/^@/, '').trim()

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const ctrl = new AbortController()
    // 200ms debounce
    const timer = setTimeout(() => {
      setLoading(true)
      fetch(`${API}/api/search?type=users&limit=8&q=${encodeURIComponent(q)}`, {
        credentials: 'include',
        headers: authHeaders(),
        signal: ctrl.signal,
      })
        .then((r) => (r.ok ? r.json() : { results: { users: [] } }))
        .catch(() => ({ results: { users: [] } }))
        .then((data) => {
          if (cancelled) return
          const list = data?.results?.users || []
          // Strip the current user from the suggestion list — pinging yourself
          // is noise.
          const filtered = currentUserId ? list.filter((u) => u.id !== currentUserId) : list
          setUsers(filtered)
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 200)

    return () => {
      cancelled = true
      ctrl.abort()
      clearTimeout(timer)
    }
  }, [open, q, currentUserId])

  useImperativeHandle(
    ref,
    () => ({
      confirmActive() {
        if (!open || users.length === 0) return null
        const idx = Math.max(0, Math.min(activeIdx, users.length - 1))
        const item = users[idx]
        if (item) {
          onSelect(item)
          return item
        }
        return null
      },
      optionCount: () => users.length,
    }),
    [open, users, activeIdx, onSelect],
  )

  // Keep the active option scrolled into view.
  useEffect(() => {
    if (!open) return
    const container = listRef.current
    if (!container) return
    const node = container.querySelector(`#msg-mention-opt-${activeIdx}`)
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIdx, open])

  if (!open) return null

  return (
    <div
      ref={listRef}
      id="msg-mention-listbox"
      role="listbox"
      aria-label="Mention a user"
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 8px)',
        left: 0,
        width: 'min(280px, calc(100vw - 32px))',
        maxHeight: 'min(240px, calc(100vh - 140px))',
        overflowY: 'auto',
        background: 'var(--sh-surface)',
        border: '1px solid var(--sh-border)',
        borderRadius: 12,
        boxShadow: 'var(--shadow-md, 0 4px 16px rgba(0,0,0,0.12))',
        padding: 4,
        zIndex: 30,
      }}
    >
      {loading && users.length === 0 ? (
        <div style={{ padding: 12, fontSize: 12, color: 'var(--sh-muted)' }}>Searching…</div>
      ) : null}

      {!loading && users.length === 0 ? (
        <div style={{ padding: 12, fontSize: 12, color: 'var(--sh-muted)' }}>
          No matches for @{q || '…'}
        </div>
      ) : null}

      {users.map((u, idx) => {
        const isActive = idx === activeIdx
        return (
          <button
            key={u.id}
            id={`msg-mention-opt-${idx}`}
            role="option"
            aria-selected={isActive}
            type="button"
            onMouseEnter={() => onActiveIdxChange(idx)}
            onClick={() => onSelect(u)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              textAlign: 'left',
              padding: '8px 10px',
              borderRadius: 8,
              background: isActive ? 'var(--sh-brand-soft, var(--sh-soft))' : 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: isActive ? 'var(--sh-pill-text, var(--sh-text))' : 'var(--sh-text)',
              fontFamily: 'inherit',
              fontSize: 13,
            }}
          >
            <span style={{ fontWeight: 600 }}>@{u.username}</span>
            {u.name && u.name !== u.username ? (
              <span style={{ color: 'var(--sh-muted)', fontSize: 12 }}>{u.name}</span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

const MessageMentionMenu = forwardRef(MessageMentionMenuImpl)
MessageMentionMenu.displayName = 'MessageMentionMenu'
export default MessageMentionMenu
