/**
 * ShareToStudyGroupButton — share a Scholar paper into a study group as
 * a `scholar_paper` resource.
 *
 * Click flow:
 *   1. Open a popover anchored to the trigger button. Fetch the user's
 *      joined groups via GET /api/study-groups?member=me.
 *   2. User picks a group → POST /api/study-groups/:id/resources with
 *      `{ kind:'scholar_paper', paperId, title }`.
 *   3. Toast "Shared to ${groupName}" and close the popover.
 *   4. Graceful fallback: if the groups list endpoint or the resources
 *      endpoint 404s, toast "Feature coming soon" and close.
 *
 * a11y:
 *   - Trigger is a real <button> with aria-haspopup / aria-expanded.
 *   - Popover is role="dialog" with aria-label.
 *   - Esc closes.
 *   - Outside-click closes.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { API } from '../../../config'
import { showToast } from '../../../lib/toast'

const BTN_STYLE = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  padding: '10px 16px',
  background: 'var(--sh-surface)',
  border: '1px solid var(--sh-border)',
  borderRadius: '12px',
  color: 'var(--sh-text)',
  fontFamily: 'inherit',
  fontSize: 'var(--type-sm)',
  fontWeight: 500,
  minHeight: '44px',
  minWidth: '44px',
  cursor: 'pointer',
}

const POPOVER_STYLE = {
  position: 'absolute',
  top: 'calc(100% + 6px)',
  right: 0,
  zIndex: 60,
  width: 'min(320px, calc(100vw - 32px))',
  maxHeight: '360px',
  overflowY: 'auto',
  background: 'var(--sh-surface)',
  border: '1px solid var(--sh-border)',
  borderRadius: '12px',
  boxShadow: 'var(--shadow-lg, 0 10px 28px rgba(15,23,42,0.16))',
  padding: '8px',
}

const GROUP_ROW_STYLE = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '10px 12px',
  background: 'transparent',
  border: '1px solid transparent',
  borderRadius: '8px',
  color: 'var(--sh-text)',
  fontFamily: 'inherit',
  fontSize: 'var(--type-sm)',
  cursor: 'pointer',
  minHeight: '44px',
}

export default function ShareToStudyGroupButton({ paper, children, className, style }) {
  const [open, setOpen] = useState(false)
  const [groups, setGroups] = useState(null) // null = not loaded yet, [] = loaded empty
  const [sharingId, setSharingId] = useState(null)
  const wrapperRef = useRef(null)
  const firstRowRef = useRef(null)
  // Loading is derived state: while the popover is open and we haven't
  // populated `groups` yet, the strip is loading. This avoids a
  // synchronous setLoading(true) inside the fetching effect (which trips
  // the react-hooks/set-state-in-effect rule).
  const loading = open && groups === null

  const close = useCallback(() => setOpen(false), [])

  // Esc to close + outside-click to close.
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
      }
    }
    const onClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        close()
      }
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClickOutside)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClickOutside)
    }
  }, [open, close])

  // Load the user's groups on open. All setState calls live inside async
  // continuations — never in the effect body — so the React Compiler's
  // `set-state-in-effect` rule stays happy.
  useEffect(() => {
    if (!open || groups !== null) return undefined
    let aborted = false
    fetch(`${API}/api/study-groups?member=me`, { credentials: 'include' })
      .then(async (res) => {
        if (res.status === 404) {
          if (!aborted) {
            showToast('Feature coming soon', 'info')
            setOpen(false)
          }
          return null
        }
        if (!res.ok) throw new Error(`Groups load failed (${res.status})`)
        return res.json()
      })
      .then((json) => {
        if (aborted || !json) return
        // Backend may return `{ groups: [...] }` or a raw array — handle both.
        const list = Array.isArray(json) ? json : Array.isArray(json.groups) ? json.groups : []
        setGroups(list)
      })
      .catch((err) => {
        if (!aborted) {
          showToast(err?.message || 'Could not load study groups.', 'error')
          setOpen(false)
        }
      })
    return () => {
      aborted = true
    }
  }, [open, groups])

  // Move focus into the popover when it opens (first group row, if any).
  useEffect(() => {
    if (open && !loading && groups && groups.length > 0) {
      firstRowRef.current?.focus()
    }
  }, [open, loading, groups])

  if (!paper || !paper.id) return null

  async function shareTo(group) {
    if (sharingId) return
    setSharingId(group.id)
    try {
      const res = await fetch(`${API}/api/study-groups/${encodeURIComponent(group.id)}/resources`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'scholar_paper',
          paperId: paper.id,
          title: paper.title || 'Untitled paper',
        }),
      })
      if (res.status === 404) {
        showToast('Feature coming soon', 'info')
        return
      }
      if (!res.ok) {
        const msg = await res.json().catch(() => ({}))
        throw new Error(msg?.error || `Share failed (${res.status})`)
      }
      showToast(`Shared to ${group.name || 'study group'}`, 'success')
      setOpen(false)
    } catch (err) {
      showToast(err?.message || 'Could not share to group.', 'error')
    } finally {
      setSharingId(null)
    }
  }

  return (
    <span
      ref={wrapperRef}
      style={{ position: 'relative', display: 'inline-block' }}
      className={className}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Share this paper to a study group"
        style={{ ...BTN_STYLE, ...(style || {}) }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
        <span>{children || 'Share to group'}</span>
      </button>

      {open && (
        <div role="dialog" aria-label="Pick a study group to share to" style={POPOVER_STYLE}>
          <div
            style={{
              fontSize: 'var(--type-xs)',
              color: 'var(--sh-subtext)',
              padding: '6px 10px',
            }}
          >
            Share to study group
          </div>
          {loading && (
            <div style={{ padding: '12px', color: 'var(--sh-subtext)' }}>Loading groups…</div>
          )}
          {!loading && groups && groups.length === 0 && (
            <div style={{ padding: '12px', color: 'var(--sh-subtext)' }}>
              You haven&apos;t joined any study groups yet.
            </div>
          )}
          {!loading &&
            groups &&
            groups.length > 0 &&
            groups.map((g, i) => (
              <button
                key={g.id}
                ref={i === 0 ? firstRowRef : null}
                type="button"
                onClick={() => shareTo(g)}
                disabled={sharingId !== null}
                style={{
                  ...GROUP_ROW_STYLE,
                  background: sharingId === g.id ? 'var(--sh-soft)' : 'transparent',
                }}
              >
                <div style={{ fontWeight: 600 }}>{g.name || 'Untitled group'}</div>
                {g.memberCount != null && (
                  <div style={{ fontSize: 'var(--type-xs)', color: 'var(--sh-subtext)' }}>
                    {g.memberCount} member{g.memberCount === 1 ? '' : 's'}
                  </div>
                )}
              </button>
            ))}
        </div>
      )}
    </span>
  )
}
