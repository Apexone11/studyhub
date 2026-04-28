/**
 * DraftsPickerModal.jsx — Gmail-style "My Drafts" picker for the upload page.
 *
 * The schema has always allowed an arbitrary number of in-progress
 * drafts per user (every /api/sheets/drafts/autosave call without an
 * `id` creates a new StudySheet row with status='draft'), but the
 * upload page only ever exposed the *latest* one via /drafts/latest.
 * That made the editor feel like it had a single global draft slot —
 * users who started a second sheet would silently overwrite the first.
 *
 * This modal lists every in-progress draft for the current user, lets
 * them switch between drafts, discard one they no longer need, or
 * start a brand-new one (which routes to the editor with `?fresh=1`
 * so the latest-draft auto-load is bypassed).
 */
import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { API } from '../../../config'
import { authHeaders } from './uploadSheetConstants'
import { FONT } from './uploadSheetConstants'

function formatRelative(dateStr) {
  if (!dateStr) return ''
  const then = new Date(dateStr).getTime()
  if (!Number.isFinite(then)) return ''
  const diff = Date.now() - then
  const minute = 60 * 1000
  if (diff < minute) return 'just now'
  if (diff < 60 * minute) return `${Math.round(diff / minute)}m ago`
  if (diff < 24 * 60 * minute) return `${Math.round(diff / (60 * minute))}h ago`
  return `${Math.round(diff / (24 * 60 * minute))}d ago`
}

export default function DraftsPickerModal({ open, onClose, currentDraftId, onBeforeNavigate }) {
  const navigate = useNavigate()
  const [drafts, setDrafts] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)

  const loadDrafts = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${API}/api/sheets/drafts`, {
        headers: authHeaders(),
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Could not load drafts.')
      const data = await response.json().catch(() => ({}))
      setDrafts(Array.isArray(data?.drafts) ? data.drafts : [])
    } catch (err) {
      setError(err.message || 'Could not load drafts.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      loadDrafts()
      setConfirmDeleteId(null)
    }
  }, [open, loadDrafts])

  // Esc to close — single listener, only mounted while open.
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Both navigation paths only change the query string, which means the
  // useSafeBlocker in useUploadSheet (pathname-only diff) does NOT fire.
  // We have to explicitly flush whatever the parent considers pending
  // before swapping drafts, otherwise an in-flight autosave debounce
  // would land against the wrong draftId once the URL flips.
  const flushPending = async () => {
    if (typeof onBeforeNavigate === 'function') {
      try {
        await onBeforeNavigate()
      } catch {
        /* best-effort flush — proceed even if save errors */
      }
    }
  }

  const openDraft = async (draftId) => {
    if (draftId === currentDraftId) {
      onClose?.()
      return
    }
    await flushPending()
    onClose?.()
    navigate(`/sheets/upload?draft=${draftId}`)
  }

  const startFreshDraft = async () => {
    await flushPending()
    onClose?.()
    navigate('/sheets/upload?fresh=1')
  }

  const discardDraft = async (draftId) => {
    try {
      const response = await fetch(`${API}/api/sheets/drafts/${draftId}`, {
        method: 'DELETE',
        headers: authHeaders(),
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Could not discard draft.')
      setDrafts((prev) => prev.filter((d) => d.id !== draftId))
      setConfirmDeleteId(null)
      // If we just deleted the draft we're currently editing, route to a
      // fresh draft so the editor doesn't keep autosaving against a
      // deleted row. Skip the flush in this case — the row is gone, so
      // any pending save would 404 anyway.
      if (draftId === currentDraftId) {
        onClose?.()
        navigate('/sheets/upload?fresh=1')
      }
    } catch (err) {
      setError(err.message || 'Could not discard draft.')
    }
  }

  if (!open) return null

  const overlayStyle = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.55)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingTop: 80,
    zIndex: 9999,
    fontFamily: FONT,
  }

  const dialogStyle = {
    background: 'var(--sh-surface)',
    color: 'var(--sh-heading)',
    borderRadius: 14,
    border: '1px solid var(--sh-border)',
    width: 'min(560px, calc(100vw - 32px))',
    maxHeight: 'calc(100vh - 160px)',
    overflow: 'hidden',
    boxShadow: '0 24px 48px rgba(15, 23, 42, 0.2)',
    display: 'flex',
    flexDirection: 'column',
  }

  return createPortal(
    <div role="presentation" onClick={onClose} style={overlayStyle}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="My drafts"
        onClick={(e) => e.stopPropagation()}
        style={dialogStyle}
      >
        {/* Header */}
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--sh-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>My drafts</div>
            <div style={{ fontSize: 12, color: 'var(--sh-muted)', marginTop: 2 }}>
              Pick up an existing draft or start a new one. Drafts autosave as you type.
            </div>
          </div>
          <button
            type="button"
            onClick={startFreshDraft}
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: '#fff',
              background: 'var(--sh-brand)',
              border: 'none',
              borderRadius: 8,
              padding: '8px 14px',
              cursor: 'pointer',
              fontFamily: FONT,
            }}
          >
            + New draft
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {loading ? (
            <div style={{ padding: 20, fontSize: 13, color: 'var(--sh-muted)' }}>
              Loading your drafts…
            </div>
          ) : error ? (
            <div
              style={{
                margin: 14,
                padding: 12,
                background: 'var(--sh-danger-bg)',
                color: 'var(--sh-danger-text)',
                border: '1px solid var(--sh-danger-border)',
                borderRadius: 8,
                fontSize: 12,
              }}
            >
              {error}
            </div>
          ) : drafts.length === 0 ? (
            <div
              style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--sh-muted)' }}
            >
              No drafts yet. Click <strong>+ New draft</strong> to start one.
            </div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {drafts.map((draft) => {
                const isCurrent = draft.id === currentDraftId
                const isConfirming = confirmDeleteId === draft.id
                return (
                  <li
                    key={draft.id}
                    style={{
                      display: 'flex',
                      gap: 12,
                      padding: '12px 18px',
                      borderBottom: '1px solid var(--sh-border)',
                      background: isCurrent ? 'var(--sh-info-bg, #eff6ff)' : 'transparent',
                      alignItems: 'center',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => openDraft(draft.id)}
                      style={{
                        flex: 1,
                        textAlign: 'left',
                        background: 'transparent',
                        border: 'none',
                        cursor: isCurrent ? 'default' : 'pointer',
                        padding: 0,
                        fontFamily: FONT,
                        color: 'inherit',
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sh-heading)' }}>
                        {draft.title || 'Untitled draft'}
                        {isCurrent ? (
                          <span
                            style={{
                              marginLeft: 8,
                              fontSize: 10,
                              color: 'var(--sh-brand)',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: 0.4,
                            }}
                          >
                            Current
                          </span>
                        ) : null}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: 'var(--sh-muted)',
                          marginTop: 4,
                          display: 'flex',
                          gap: 10,
                          flexWrap: 'wrap',
                        }}
                      >
                        {draft.course?.code ? (
                          <span style={{ color: 'var(--sh-brand)', fontWeight: 700 }}>
                            {draft.course.code}
                          </span>
                        ) : (
                          <span>No course</span>
                        )}
                        <span>{(draft.contentFormat || 'html').toUpperCase()}</span>
                        <span>Updated {formatRelative(draft.updatedAt)}</span>
                      </div>
                      {draft.description ? (
                        <div
                          style={{
                            fontSize: 12,
                            color: 'var(--sh-subtext)',
                            marginTop: 4,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {draft.description}
                        </div>
                      ) : null}
                    </button>
                    {isConfirming ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <button
                          type="button"
                          onClick={() => discardDraft(draft.id)}
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: '#fff',
                            background: 'var(--sh-danger)',
                            border: 'none',
                            borderRadius: 6,
                            padding: '6px 10px',
                            cursor: 'pointer',
                            fontFamily: FONT,
                          }}
                        >
                          Discard
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          style={{
                            fontSize: 11,
                            color: 'var(--sh-muted)',
                            background: 'transparent',
                            border: '1px solid var(--sh-border)',
                            borderRadius: 6,
                            padding: '6px 10px',
                            cursor: 'pointer',
                            fontFamily: FONT,
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(draft.id)}
                        aria-label={`Discard draft ${draft.title}`}
                        style={{
                          fontSize: 11,
                          color: 'var(--sh-danger)',
                          background: 'transparent',
                          border: '1px solid var(--sh-danger-border)',
                          borderRadius: 6,
                          padding: '6px 10px',
                          cursor: 'pointer',
                          fontFamily: FONT,
                        }}
                      >
                        Discard
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '10px 18px',
            borderTop: '1px solid var(--sh-border)',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              fontSize: 12,
              color: 'var(--sh-muted)',
              background: 'transparent',
              border: '1px solid var(--sh-border)',
              borderRadius: 8,
              padding: '8px 14px',
              cursor: 'pointer',
              fontFamily: FONT,
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
