import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  IconStar,
  IconStarFilled,
  IconFork,
  IconGitPullRequest,
  IconMoreHorizontal,
  IconDownload,
  IconEye,
} from '../../../components/Icons'
import { API } from '../../../config'
import { showToast } from '../../../lib/toast'
import {
  FONT,
  authHeaders,
  actionButton,
  linkButton,
  secondaryDropdown,
  dropdownItem,
} from './sheetViewerConstants'

const dropdownSectionLabel = {
  fontSize: 10,
  fontWeight: 800,
  color: 'var(--sh-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  padding: '6px 12px 2px',
  userSelect: 'none',
}

const dropdownDivider = {
  height: 1,
  background: 'var(--sh-border)',
  margin: '4px 0',
}

export default function SheetActionsMenu({
  sheet,
  user,
  canEdit,
  isHtmlSheet,
  forking,
  studyStatus,
  setStudyStatus,
  STUDY_STATUSES,
  updateStar,
  updateReaction,
  handleFork,
  handleShare,
  setShowContributeModal,
  setReportOpen,
  onSheetUpdate,
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [togglingDownloads, setTogglingDownloads] = useState(false)
  const [togglingEditing, setTogglingEditing] = useState(false)
  const menuRef = useRef(null)

  const isOwner = user && sheet && (user.id === sheet.userId || user.role === 'admin')

  // The toggle handlers below intentionally hydrate the local sheet state
  // from the server's response rather than optimistically flipping the
  // local boolean. This guarantees the visual switch state always reflects
  // what's persisted — if the PATCH silently no-ops (e.g. the column is
  // missing, or a future middleware drops the field), the toggle will
  // not appear to move. Earlier versions used `!sheet.allowDownloads`
  // optimistically, which masked persistence failures.
  const handleToggleDownloads = async () => {
    if (togglingDownloads || !sheet) return
    const nextValue = !(sheet.allowDownloads !== false)
    setTogglingDownloads(true)
    try {
      const response = await fetch(`${API}/api/sheets/${sheet.id}`, {
        method: 'PATCH',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ allowDownloads: nextValue }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Could not update setting.')
      }
      // Hydrate from server — if the server didn't echo allowDownloads,
      // fall back to the requested value so the optimistic UX still flips.
      const persisted = typeof data.allowDownloads === 'boolean' ? data.allowDownloads : nextValue
      if (onSheetUpdate) onSheetUpdate({ allowDownloads: persisted })
      showToast(persisted ? 'Downloads enabled.' : 'Downloads disabled.', 'success')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setTogglingDownloads(false)
    }
  }

  const handleToggleEditing = async () => {
    if (togglingEditing || !sheet) return
    const nextValue = !(sheet.allowEditing === true)
    setTogglingEditing(true)
    try {
      const response = await fetch(`${API}/api/sheets/${sheet.id}`, {
        method: 'PATCH',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ allowEditing: nextValue }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Could not update setting.')
      }
      const persisted = typeof data.allowEditing === 'boolean' ? data.allowEditing : nextValue
      if (onSheetUpdate) onSheetUpdate({ allowEditing: persisted })
      showToast(persisted ? 'Editing by others enabled.' : 'Editing by others disabled.', 'success')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setTogglingEditing(false)
    }
  }

  useEffect(() => {
    if (!menuOpen) return
    function onClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    function onEscape(e) {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onEscape)
    }
  }, [menuOpen])

  if (!sheet) return null

  return (
    <div
      data-tutorial="viewer-actions"
      style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
    >
      {!user && (
        <Link
          to="/login"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 14px',
            borderRadius: 8,
            background: 'var(--sh-brand)',
            color: 'var(--sh-btn-primary-text)',
            fontSize: 12,
            fontWeight: 700,
            textDecoration: 'none',
            fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
          }}
        >
          Sign in to star, fork, and contribute
        </Link>
      )}

      {/* Primary actions */}
      {user && (
        <button
          type="button"
          onClick={updateStar}
          style={actionButton(sheet.starred ? 'var(--sh-warning)' : 'var(--sh-slate-600)')}
        >
          {sheet.starred ? <IconStarFilled size={14} /> : <IconStar size={14} />}
          {sheet.stars || 0}
        </button>
      )}

      {canEdit || (user && sheet.allowEditing) ? (
        <Link to={`/sheets/${sheet.id}/lab`} style={linkButton()}>
          Edit in SheetLab
        </Link>
      ) : user && sheet.userId !== user.id ? (
        <button
          type="button"
          onClick={handleFork}
          disabled={forking}
          style={actionButton('var(--sh-brand)')}
        >
          <IconFork size={13} />
          {forking ? 'Forking...' : 'Fork'}
        </button>
      ) : null}

      {user && sheet.forkOf && sheet.userId === user.id && (
        <button
          type="button"
          onClick={() => setShowContributeModal(true)}
          style={actionButton('var(--sh-success)')}
        >
          <IconGitPullRequest size={13} />
          Contribute
        </button>
      )}

      {/* Secondary actions dropdown */}
      <div style={{ position: 'relative' }} ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          style={{ ...actionButton('var(--sh-slate-600)'), padding: '6px 8px' }}
          aria-label="More actions"
        >
          <IconMoreHorizontal size={16} />
        </button>

        {menuOpen && (
          <div style={secondaryDropdown()} role="menu" aria-label="Sheet actions">
            {/* ── Share & Export ────────────────────────── */}
            <div style={dropdownSectionLabel}>Share &amp; Export</div>
            <button
              type="button"
              onClick={() => {
                handleShare()
                setMenuOpen(false)
              }}
              style={dropdownItem()}
              role="menuitem"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
              Share
            </button>

            {(isOwner || sheet.allowDownloads !== false) && (
              <a
                href={`${API}/api/sheets/${sheet.id}/download`}
                style={dropdownItem()}
                onClick={() => setMenuOpen(false)}
                role="menuitem"
              >
                <IconDownload size={14} />
                Download
              </a>
            )}

            {sheet.hasAttachment && (
              <Link
                to={`/preview/sheet/${sheet.id}`}
                style={dropdownItem()}
                onClick={() => setMenuOpen(false)}
                role="menuitem"
              >
                <IconEye size={14} />
                Preview attachment
              </Link>
            )}

            {isHtmlSheet && (sheet.status !== 'pending_review' || canEdit) && (
              <Link
                to={`/sheets/preview/html/${sheet.id}`}
                style={dropdownItem()}
                onClick={() => setMenuOpen(false)}
                role="menuitem"
              >
                <IconEye size={14} />
                Open sandbox preview
              </Link>
            )}

            <div style={dropdownDivider} />

            {/* ── Feedback ─────────────────────────────── */}
            <div style={dropdownSectionLabel}>Feedback</div>
            <button
              type="button"
              onClick={() => {
                updateReaction('like')
                setMenuOpen(false)
              }}
              style={{
                ...dropdownItem(),
                color:
                  sheet.reactions?.userReaction === 'like' ? 'var(--sh-success)' : 'var(--sh-text)',
              }}
              role="menuitem"
            >
              <span style={{ fontSize: 14 }} aria-hidden="true">
                &#x25B2;
              </span>
              Helpful {sheet.reactions?.likes || 0}
            </button>
            <button
              type="button"
              onClick={() => {
                updateReaction('dislike')
                setMenuOpen(false)
              }}
              style={{
                ...dropdownItem(),
                color:
                  sheet.reactions?.userReaction === 'dislike'
                    ? 'var(--sh-danger)'
                    : 'var(--sh-text)',
              }}
              role="menuitem"
            >
              <span style={{ fontSize: 14 }} aria-hidden="true">
                &#x25BC;
              </span>
              Needs work {sheet.reactions?.dislikes || 0}
            </button>

            {/* ── Study Status ─────────────────────────── */}
            {user && (
              <>
                <div style={dropdownDivider} />
                <div style={{ padding: '4px 12px' }}>
                  <div style={dropdownSectionLabel}>Study Status</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                    {STUDY_STATUSES.map((s) => (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => {
                          setStudyStatus(studyStatus === s.value ? null : s.value, sheet)
                          setMenuOpen(false)
                        }}
                        style={{
                          padding: '4px 10px',
                          borderRadius: 20,
                          border: 'none',
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer',
                          fontFamily: FONT,
                          background: studyStatus === s.value ? s.color : 'var(--sh-soft)',
                          color: studyStatus === s.value ? '#fff' : 'var(--sh-text)',
                        }}
                        role="menuitem"
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ── Safety ───────────────────────────────── */}
            {user && sheet.userId !== user.id && (
              <>
                <div style={dropdownDivider} />
                <button
                  type="button"
                  onClick={() => {
                    setReportOpen(true)
                    setMenuOpen(false)
                  }}
                  style={{ ...dropdownItem(), color: 'var(--sh-danger)' }}
                  role="menuitem"
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                    <line x1="4" y1="22" x2="4" y2="15" />
                  </svg>
                  Report
                </button>
              </>
            )}

            {/* ── Owner Controls ─────────────────────────── */}
            {isOwner && (
              <>
                <div style={dropdownDivider} />
                <div style={dropdownSectionLabel}>Owner Controls</div>
                <button
                  type="button"
                  onClick={handleToggleDownloads}
                  disabled={togglingDownloads}
                  style={dropdownItem()}
                  role="menuitem"
                >
                  <span
                    style={{
                      display: 'inline-block',
                      width: 28,
                      height: 16,
                      borderRadius: 8,
                      position: 'relative',
                      background:
                        sheet.allowDownloads !== false
                          ? 'var(--sh-success)'
                          : 'var(--sh-slate-300)',
                      transition: 'background 0.15s',
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        top: 2,
                        left: sheet.allowDownloads !== false ? 14 : 2,
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        background: '#fff',
                        transition: 'left 0.15s',
                      }}
                    />
                  </span>
                  Allow downloads
                </button>
                <button
                  type="button"
                  onClick={handleToggleEditing}
                  disabled={togglingEditing}
                  style={dropdownItem()}
                  role="menuitem"
                >
                  <span
                    style={{
                      display: 'inline-block',
                      width: 28,
                      height: 16,
                      borderRadius: 8,
                      position: 'relative',
                      background: sheet.allowEditing ? 'var(--sh-success)' : 'var(--sh-slate-300)',
                      transition: 'background 0.15s',
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        top: 2,
                        left: sheet.allowEditing ? 14 : 2,
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        background: '#fff',
                        transition: 'left 0.15s',
                      }}
                    />
                  </span>
                  Allow others to edit
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Inline helpful/needs-work summary (read-only) */}
      {(sheet.reactions?.likes > 0 || sheet.reactions?.dislikes > 0) && (
        <span
          style={{
            fontSize: 11,
            color: 'var(--sh-muted)',
            fontWeight: 600,
            display: 'flex',
            gap: 8,
          }}
        >
          {sheet.reactions.likes > 0 && <span>&#x25B2; {sheet.reactions.likes}</span>}
          {sheet.reactions.dislikes > 0 && <span>&#x25BC; {sheet.reactions.dislikes}</span>}
        </span>
      )}
    </div>
  )
}
