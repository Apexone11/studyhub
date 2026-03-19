import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Navbar from '../../components/Navbar'
import { IconArrowLeft } from '../../components/Icons'
import { API } from '../../config'
import { getApiErrorMessage, isAuthSessionFailure, readJsonSafely } from '../../lib/http'
import { useSession } from '../../lib/session-context'
import { pageShell } from '../../lib/ui'
import { staggerEntrance } from '../../lib/animations'
import { showToast } from '../../lib/toast'
import { usePageTitle } from '../../lib/usePageTitle'
import './SheetLabPage.css'

function authHeaders() {
  return { 'Content-Type': 'application/json' }
}

function timeAgo(value) {
  if (!value) return 'recently'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'recently'
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
  return date.toLocaleDateString()
}

function truncateChecksum(checksum) {
  if (!checksum) return ''
  return checksum.slice(0, 8)
}

export default function SheetLabPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const sheetId = Number.parseInt(id, 10)
  usePageTitle('Sheet Lab')
  const { user, clearSession } = useSession()

  const [sheet, setSheet] = useState(null)
  const [commits, setCommits] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [expandedCommitId, setExpandedCommitId] = useState(null)
  const [expandedContent, setExpandedContent] = useState(null)
  const [loadingContent, setLoadingContent] = useState(false)

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [commitMessage, setCommitMessage] = useState('')
  const [creating, setCreating] = useState(false)

  const [restoring, setRestoring] = useState(null)

  const [compareMode, setCompareMode] = useState(false)
  const [compareSelection, setCompareSelection] = useState([])
  const [diff, setDiff] = useState(null)
  const [loadingDiff, setLoadingDiff] = useState(false)

  const timelineRef = useRef(null)
  const animatedRef = useRef(false)

  const isOwner = user && sheet && (user.role === 'admin' || user.id === sheet.userId)

  // Load sheet info
  useEffect(() => {
    if (!Number.isInteger(sheetId)) {
      setError('Invalid sheet ID.')
      setLoading(false)
      return
    }

    let cancelled = false
    async function fetchSheet() {
      try {
        const response = await fetch(`${API}/api/sheets/${sheetId}`, {
          headers: authHeaders(),
          credentials: 'include',
        })
        const data = await readJsonSafely(response, {})
        if (isAuthSessionFailure(response, data)) {
          clearSession()
          navigate('/login', { replace: true })
          return
        }
        if (!response.ok) throw new Error(getApiErrorMessage(data, 'Could not load sheet.'))
        if (!cancelled) setSheet(data)
      } catch (err) {
        if (!cancelled) setError(err.message)
      }
    }
    fetchSheet()
    return () => { cancelled = true }
  }, [sheetId, clearSession, navigate])

  // Load commits
  const loadCommits = useCallback(async (targetPage = 1) => {
    if (!Number.isInteger(sheetId)) return
    setLoading(true)
    try {
      const response = await fetch(
        `${API}/api/sheets/${sheetId}/lab/commits?page=${targetPage}&limit=20`,
        { headers: authHeaders(), credentials: 'include' }
      )
      const data = await readJsonSafely(response, {})
      if (isAuthSessionFailure(response, data)) {
        clearSession()
        navigate('/login', { replace: true })
        return
      }
      if (!response.ok) throw new Error(getApiErrorMessage(data, 'Could not load commits.'))
      setCommits(data.commits || [])
      setTotal(data.total || 0)
      setPage(data.page || 1)
      setTotalPages(data.totalPages || 1)
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [sheetId, clearSession, navigate])

  useEffect(() => {
    loadCommits(1)
  }, [loadCommits])

  // Animate timeline on first data load
  useEffect(() => {
    if (loading || animatedRef.current || commits.length === 0) return
    animatedRef.current = true
    if (timelineRef.current) {
      const items = timelineRef.current.querySelectorAll('.sheet-lab__commit')
      items.forEach((el) => el.classList.add('animate-init'))
      if (items.length > 0) staggerEntrance(items, { staggerMs: 60, y: 16 })
    }
  }, [loading, commits.length])

  // Expand / collapse commit content
  const toggleCommitContent = async (commitId) => {
    if (expandedCommitId === commitId) {
      setExpandedCommitId(null)
      setExpandedContent(null)
      return
    }
    setExpandedCommitId(commitId)
    setLoadingContent(true)
    try {
      const response = await fetch(
        `${API}/api/sheets/${sheetId}/lab/commits/${commitId}`,
        { headers: authHeaders(), credentials: 'include' }
      )
      const data = await readJsonSafely(response, {})
      if (!response.ok) throw new Error(getApiErrorMessage(data, 'Could not load commit content.'))
      setExpandedContent(data.commit?.content || '')
    } catch (err) {
      showToast(err.message, 'error')
      setExpandedContent(null)
    } finally {
      setLoadingContent(false)
    }
  }

  // Create snapshot
  const handleCreateCommit = async () => {
    if (creating) return
    setCreating(true)
    try {
      const response = await fetch(`${API}/api/sheets/${sheetId}/lab/commits`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ message: commitMessage.trim() || 'Snapshot' }),
      })
      const data = await readJsonSafely(response, {})
      if (!response.ok) throw new Error(getApiErrorMessage(data, 'Could not create snapshot.'))
      showToast('Snapshot created!', 'success')
      setShowCreateModal(false)
      setCommitMessage('')
      animatedRef.current = false
      loadCommits(1)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setCreating(false)
    }
  }

  // Restore commit
  const handleRestore = async (commitId) => {
    if (restoring) return
    if (!window.confirm('Restore this snapshot? The current sheet content will be replaced.')) return
    setRestoring(commitId)
    try {
      const response = await fetch(`${API}/api/sheets/${sheetId}/lab/restore/${commitId}`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
      })
      const data = await readJsonSafely(response, {})
      if (!response.ok) throw new Error(getApiErrorMessage(data, 'Could not restore snapshot.'))
      showToast('Sheet restored to selected snapshot.', 'success')
      animatedRef.current = false
      loadCommits(1)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setRestoring(null)
    }
  }

  // Compare mode
  const toggleCompareSelection = (commitId) => {
    setCompareSelection((prev) => {
      if (prev.includes(commitId)) return prev.filter((id) => id !== commitId)
      if (prev.length >= 2) return [prev[1], commitId]
      return [...prev, commitId]
    })
  }

  useEffect(() => {
    if (!compareMode) {
      setCompareSelection([])
      setDiff(null)
    }
  }, [compareMode])

  const runDiff = async () => {
    if (compareSelection.length !== 2) return
    const [idA, idB] = compareSelection
    setLoadingDiff(true)
    try {
      const response = await fetch(
        `${API}/api/sheets/${sheetId}/lab/diff/${idA}/${idB}`,
        { headers: authHeaders(), credentials: 'include' }
      )
      const data = await readJsonSafely(response, {})
      if (!response.ok) throw new Error(getApiErrorMessage(data, 'Could not compute diff.'))
      setDiff(data.diff)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setLoadingDiff(false)
    }
  }

  useEffect(() => {
    if (compareSelection.length === 2) runDiff()
    else setDiff(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareSelection])

  const handleBack = () => {
    navigate(`/sheets/${sheetId}`)
  }

  return (
    <>
      <Navbar />
      <div className="sheet-lab">
        <div style={pageShell('reading', 26, 48)}>
          {/* ── Header ─────────────────────────────────────── */}
          <div className="sheet-lab__header">
            <button type="button" onClick={handleBack} className="sheet-lab__back">
              <IconArrowLeft size={14} />
              Back to sheet
            </button>
          </div>
          <h1 className="sheet-lab__title">
            {sheet ? sheet.title : 'Sheet Lab'}
          </h1>
          <p className="sheet-lab__subtitle">
            Version history {total > 0 ? `\u2014 ${total} snapshot${total === 1 ? '' : 's'}` : ''}
          </p>

          {/* ── Actions ────────────────────────────────────── */}
          <div className="sheet-lab__actions" style={{ marginTop: 16 }}>
            {isOwner ? (
              <button
                type="button"
                className="sheet-lab__btn sheet-lab__btn--primary"
                onClick={() => setShowCreateModal(true)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="16" />
                  <line x1="8" y1="12" x2="16" y2="12" />
                </svg>
                Create Snapshot
              </button>
            ) : null}
            {commits.length >= 2 ? (
              <button
                type="button"
                className={`sheet-lab__btn sheet-lab__btn--compare${compareMode ? ' active' : ''}`}
                onClick={() => setCompareMode((v) => !v)}
              >
                {compareMode ? 'Exit Compare' : 'Compare'}
              </button>
            ) : null}
          </div>

          {/* ── Error ──────────────────────────────────────── */}
          {error ? (
            <div style={{
              background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca',
              borderRadius: 14, padding: '12px 14px', fontSize: 13, marginBottom: 16,
            }}>
              {error}
            </div>
          ) : null}

          {/* ── Diff viewer ────────────────────────────────── */}
          {compareMode && diff ? (
            <div className="sheet-lab__diff">
              <div className="sheet-lab__diff-header">
                <h3 className="sheet-lab__diff-title">Diff</h3>
                <div className="sheet-lab__diff-stats">
                  <span className="sheet-lab__diff-additions">+{diff.additions}</span>
                  <span className="sheet-lab__diff-deletions">-{diff.deletions}</span>
                </div>
              </div>
              <div className="sheet-lab__diff-hunks">
                {(diff.hunks || []).map((hunk, hi) => (
                  <div key={hi}>
                    <div className="sheet-lab__diff-hunk-header">
                      @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
                    </div>
                    {hunk.lines.map((line, li) => (
                      <div
                        key={li}
                        className={`sheet-lab__diff-line sheet-lab__diff-line--${line.type}`}
                      >
                        {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '} {line.content}
                      </div>
                    ))}
                  </div>
                ))}
                {diff.hunks?.length === 0 ? (
                  <div style={{ padding: 16, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                    No differences found.
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {compareMode && loadingDiff ? (
            <div style={{ textAlign: 'center', padding: 20, color: '#64748b', fontSize: 13 }}>
              Computing diff...
            </div>
          ) : null}

          {compareMode && compareSelection.length < 2 ? (
            <div style={{
              background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: 12,
              padding: '10px 14px', fontSize: 13, color: '#1d4ed8', marginBottom: 16,
            }}>
              Select two snapshots to compare. ({compareSelection.length}/2 selected)
            </div>
          ) : null}

          {/* ── Timeline ───────────────────────────────────── */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#64748b', fontSize: 14 }}>
              Loading version history...
            </div>
          ) : commits.length === 0 ? (
            <div className="sheet-lab__empty">
              <div className="sheet-lab__empty-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <p className="sheet-lab__empty-title">No snapshots yet</p>
              <p className="sheet-lab__empty-text">
                {isOwner
                  ? 'Create your first snapshot to start tracking changes.'
                  : 'The sheet owner has not created any snapshots yet.'}
              </p>
            </div>
          ) : (
            <div className="sheet-lab__timeline" ref={timelineRef}>
              {commits.map((commit) => {
                const isSelected = compareSelection.includes(commit.id)
                const isExpanded = expandedCommitId === commit.id
                return (
                  <div
                    key={commit.id}
                    className={`sheet-lab__commit${isSelected ? ' sheet-lab__commit--selected' : ''}`}
                  >
                    <div className="sheet-lab__commit-dot" />
                    <div
                      className="sheet-lab__commit-card"
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        if (compareMode) {
                          toggleCompareSelection(commit.id)
                        } else {
                          toggleCommitContent(commit.id)
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          if (compareMode) toggleCompareSelection(commit.id)
                          else toggleCommitContent(commit.id)
                        }
                      }}
                    >
                      <div className="sheet-lab__commit-top">
                        <p className="sheet-lab__commit-message">
                          {commit.message || 'Snapshot'}
                        </p>
                        <span className="sheet-lab__commit-time">{timeAgo(commit.createdAt)}</span>
                      </div>
                      <div className="sheet-lab__commit-meta">
                        <span className="sheet-lab__commit-author">
                          {commit.author?.avatarUrl ? (
                            <img
                              src={commit.author.avatarUrl}
                              alt=""
                              className="sheet-lab__commit-avatar"
                            />
                          ) : (
                            <span
                              className="sheet-lab__commit-avatar"
                              style={{
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 10, fontWeight: 800, color: '#6366f1',
                              }}
                            >
                              {(commit.author?.username || '?')[0].toUpperCase()}
                            </span>
                          )}
                          {commit.author?.username || 'Unknown'}
                        </span>
                        <span className="sheet-lab__commit-checksum">
                          {truncateChecksum(commit.checksum)}
                        </span>
                      </div>

                      {/* Actions row */}
                      {!compareMode ? (
                        <div className="sheet-lab__commit-actions">
                          {isOwner ? (
                            <button
                              type="button"
                              className="sheet-lab__restore-btn"
                              disabled={restoring === commit.id}
                              onClick={(e) => {
                                e.stopPropagation()
                                handleRestore(commit.id)
                              }}
                            >
                              {restoring === commit.id ? 'Restoring...' : 'Restore'}
                            </button>
                          ) : null}
                        </div>
                      ) : (
                        <div className="sheet-lab__commit-actions">
                          <span
                            className={`sheet-lab__compare-check${isSelected ? ' selected' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleCompareSelection(commit.id)
                            }}
                          >
                            {isSelected ? 'Selected' : 'Select for compare'}
                          </span>
                        </div>
                      )}

                      {/* Expanded content preview */}
                      {isExpanded && !compareMode ? (
                        <div className="sheet-lab__content-preview">
                          {loadingContent ? 'Loading content...' : (expandedContent || '(empty)')}
                        </div>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ── Pagination ─────────────────────────────────── */}
          {totalPages > 1 ? (
            <div style={{
              display: 'flex', justifyContent: 'center', gap: 10,
              marginTop: 20, fontSize: 13, fontWeight: 600,
            }}>
              <button
                type="button"
                disabled={page <= 1}
                className="sheet-lab__btn sheet-lab__btn--cancel"
                onClick={() => loadCommits(page - 1)}
              >
                Previous
              </button>
              <span style={{ padding: '8px 4px', color: '#64748b' }}>
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                className="sheet-lab__btn sheet-lab__btn--cancel"
                onClick={() => loadCommits(page + 1)}
              >
                Next
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Create Snapshot Modal ──────────────────────────── */}
      {showCreateModal ? (
        <div className="sheet-lab__modal-overlay" onClick={() => setShowCreateModal(false)} onKeyDown={(e) => { if (e.key === 'Escape') setShowCreateModal(false) }} role="presentation">
          <div className="sheet-lab__modal" role="dialog" aria-modal="true" aria-label="Create snapshot" onClick={(e) => e.stopPropagation()}>
            <h2>Create Snapshot</h2>
            <p>
              Save the current state of this sheet as a versioned snapshot. You can restore any snapshot later.
            </p>
            <textarea
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="Describe what changed (optional)..."
              rows={3}
              maxLength={500}
            />
            <div className="sheet-lab__modal-actions">
              <button
                type="button"
                className="sheet-lab__btn sheet-lab__btn--cancel"
                onClick={() => setShowCreateModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="sheet-lab__btn sheet-lab__btn--primary"
                disabled={creating}
                onClick={handleCreateCommit}
              >
                {creating ? 'Creating...' : 'Create Snapshot'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
