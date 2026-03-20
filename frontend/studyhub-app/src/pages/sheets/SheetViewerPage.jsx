import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Navbar from '../../components/Navbar'
import AppSidebar from '../../components/AppSidebar'
import SafeJoyride from '../../components/SafeJoyride'
import { SkeletonCard } from '../../components/Skeleton'
import MentionText from '../../components/MentionText'
import {
  IconArrowLeft,
  IconCheck,
  IconDownload,
  IconEye,
  IconFork,
  IconGitPullRequest,
  IconStar,
  IconStarFilled,
  IconX,
} from '../../components/Icons'
import { API } from '../../config'
import { getApiErrorMessage, isAuthSessionFailure, readJsonSafely } from '../../lib/http'
import { useSession } from '../../lib/session-context'
import { pageShell, useResponsiveAppLayout } from '../../lib/ui'
import { useLivePolling } from '../../lib/useLivePolling'
import { useTutorial } from '../../lib/useTutorial'
import { VIEWER_STEPS } from '../../lib/tutorialSteps'
import { fadeInUp } from '../../lib/animations'
import { showToast } from '../../lib/toast'
import { usePageTitle } from '../../lib/usePageTitle'
import { trackEvent } from '../../lib/telemetry'

const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif'])

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
  return `${Math.floor(seconds / 86400)}d ago`
}

function attachmentExtension(name = '') {
  const dotIndex = String(name).lastIndexOf('.')
  if (dotIndex < 0) return ''
  return String(name).slice(dotIndex + 1).toLowerCase()
}

function attachmentPreviewKind(attachmentType, attachmentName) {
  const normalized = String(attachmentType || '').toLowerCase()
  const extension = attachmentExtension(attachmentName)
  if (normalized === 'pdf' || extension === 'pdf') return 'pdf'
  if (normalized === 'image' || normalized.startsWith('image/') || IMAGE_EXTENSIONS.has(extension)) return 'image'
  return 'document'
}

function panelStyle() {
  return {
    background: '#fff',
    borderRadius: 18,
    border: '1px solid #e2e8f0',
    padding: 18,
  }
}

function actionButton(color = '#475569') {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    border: '1px solid #e2e8f0',
    background: '#fff',
    color,
    padding: '8px 12px',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: FONT,
  }
}

function linkButton() {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    border: '1px solid #dbeafe',
    background: '#eff6ff',
    color: '#1d4ed8',
    padding: '8px 12px',
    fontSize: 12,
    fontWeight: 700,
    textDecoration: 'none',
  }
}

function errorBanner(message) {
  if (!message) return null
  return (
    <div
      style={{
        background: '#fef2f2',
        color: '#dc2626',
        border: '1px solid #fecaca',
        borderRadius: 14,
        padding: '12px 14px',
        fontSize: 13,
      }}
    >
      {message}
    </div>
  )
}

function statusBadge(status) {
  const colors = {
    pending: { bg: '#fef3c7', color: '#92400e' },
    accepted: { bg: '#dcfce7', color: '#166534' },
    rejected: { bg: '#fee2e2', color: '#991b1b' },
  }
  const c = colors[status] || colors.pending
  return {
    fontSize: 11, fontWeight: 800, textTransform: 'uppercase',
    padding: '2px 8px', borderRadius: 6,
    background: c.bg, color: c.color,
  }
}

function ContributionInlineDiff({ contributionId }) {
  const [diff, setDiff] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [visible, setVisible] = useState(false)
  const [diffMode, setDiffMode] = useState('unified')

  const loadDiff = async () => {
    if (diff) {
      setVisible((v) => !v)
      return
    }
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${API}/api/sheets/contributions/${contributionId}/diff`, {
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Could not load diff.')
      setDiff(data.diff)
      setVisible(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ marginTop: 8 }}>
      <button
        type="button"
        onClick={loadDiff}
        disabled={loading}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '4px 8px', borderRadius: 6, border: '1px solid #e0e7ff',
          background: '#f5f3ff', color: '#6366f1', fontSize: 11, fontWeight: 700,
          cursor: loading ? 'wait' : 'pointer', fontFamily: FONT,
        }}
      >
        {loading ? 'Loading...' : visible ? 'Hide changes' : 'View changes'}
      </button>
      {error ? <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>{error}</div> : null}
      {visible && diff ? (
        <div style={{ marginTop: 8, border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', gap: 10, fontSize: 11, fontWeight: 700 }}>
              <span style={{ color: '#16a34a' }}>+{diff.additions}</span>
              <span style={{ color: '#dc2626' }}>-{diff.deletions}</span>
            </div>
            <div style={{ display: 'inline-flex', border: '1px solid #e2e8f0', borderRadius: 6, overflow: 'hidden' }}>
              <button type="button" onClick={() => setDiffMode('unified')} style={{ padding: '2px 8px', fontSize: 10, fontWeight: 700, fontFamily: FONT, border: 'none', background: diffMode === 'unified' ? '#6366f1' : '#fff', color: diffMode === 'unified' ? '#fff' : '#64748b', cursor: 'pointer' }}>
                Unified
              </button>
              <button type="button" onClick={() => setDiffMode('split')} style={{ padding: '2px 8px', fontSize: 10, fontWeight: 700, fontFamily: FONT, border: 'none', borderLeft: '1px solid #e2e8f0', background: diffMode === 'split' ? '#6366f1' : '#fff', color: diffMode === 'split' ? '#fff' : '#64748b', cursor: 'pointer' }}>
                Split
              </button>
            </div>
          </div>
          <div style={{ maxHeight: 300, overflowY: 'auto', fontFamily: "'SF Mono', 'Cascadia Code', 'Fira Code', monospace", fontSize: 11, lineHeight: 1.5 }}>
            {diffMode === 'unified' ? (
              (diff.hunks || []).map((hunk, hi) => (
                <div key={hi}>
                  <div style={{ background: '#eff6ff', color: '#3b82f6', padding: '2px 10px', fontSize: 10, fontWeight: 600 }}>
                    @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
                  </div>
                  {hunk.lines.map((line, li) => (
                    <div key={li} style={{ padding: '1px 10px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: line.type === 'add' ? '#f0fdf4' : line.type === 'remove' ? '#fef2f2' : 'transparent', color: line.type === 'add' ? '#166534' : line.type === 'remove' ? '#991b1b' : '#64748b' }}>
                      {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '} {line.segments ? line.segments.map((seg, si) => (
                        <span key={si} style={seg.type === 'add' ? { background: '#bbf7d0', borderRadius: 2 } : seg.type === 'remove' ? { background: '#fecaca', borderRadius: 2, textDecoration: 'line-through' } : {}}>{seg.text}</span>
                      )) : line.content}
                    </div>
                  ))}
                </div>
              ))
            ) : (
              (diff.hunks || []).map((hunk, hi) => {
                const rows = []
                const lines = hunk.lines
                let i = 0
                while (i < lines.length) {
                  if (lines[i].type === 'equal') {
                    rows.push({ left: lines[i], right: lines[i] })
                    i++
                  } else {
                    const removes = []
                    const adds = []
                    while (i < lines.length && lines[i].type === 'remove') { removes.push(lines[i]); i++ }
                    while (i < lines.length && lines[i].type === 'add') { adds.push(lines[i]); i++ }
                    const max = Math.max(removes.length, adds.length)
                    for (let j = 0; j < max; j++) rows.push({ left: removes[j] || null, right: adds[j] || null })
                  }
                }
                return (
                  <div key={hi}>
                    <div style={{ background: '#eff6ff', color: '#3b82f6', padding: '2px 10px', fontSize: 10, fontWeight: 600 }}>
                      @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
                    </div>
                    {rows.map((row, ri) => (
                      <div key={ri} className="sheet-diff-split">
                        <div style={{ padding: '1px 8px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', borderRight: '1px solid #e2e8f0', background: row.left?.type === 'remove' ? '#fef2f2' : 'transparent', color: row.left?.type === 'remove' ? '#991b1b' : '#64748b', minHeight: '1.5em' }}>
                          {row.left ? (row.left.segments ? row.left.segments.map((seg, si) => <span key={si} style={seg.type === 'remove' ? { background: '#fecaca', borderRadius: 2 } : {}}>{seg.text}</span>) : row.left.content) : ''}
                        </div>
                        <div style={{ padding: '1px 8px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: row.right?.type === 'add' ? '#f0fdf4' : 'transparent', color: row.right?.type === 'add' ? '#166534' : '#64748b', minHeight: '1.5em' }}>
                          {row.right ? (row.right.segments ? row.right.segments.map((seg, si) => <span key={si} style={seg.type === 'add' ? { background: '#bbf7d0', borderRadius: 2 } : {}}>{seg.text}</span>) : row.right.content) : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })
            )}
            {diff.hunks?.length === 0 ? (
              <div style={{ padding: 12, textAlign: 'center', color: '#94a3b8', fontSize: 11 }}>No differences found.</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ContributionList({ title, items, canReview, onReview, reviewingId }) {
  return (
    <section style={panelStyle()}>
      <h2 style={{ margin: '0 0 10px', fontSize: 15, color: '#0f172a' }}>{title}</h2>
      {items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '28px 16px' }}>
          <div style={{ width: 44, height: 44, borderRadius: 11, background: 'linear-gradient(135deg, #f0fdf4, #bbf7d0)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
            </svg>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--sh-heading, #0f172a)', marginBottom: 4 }}>No contributions yet</div>
          <div style={{ fontSize: 12, color: 'var(--sh-muted, #94a3b8)', lineHeight: 1.5 }}>Fork this sheet to suggest improvements.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {items.map((item) => (
            <div key={item.id} style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 4, alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                  {item.forkSheet?.title || 'Contribution'}
                </span>
                <span style={statusBadge(item.status)}>{item.status}</span>
              </div>
              <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>
                {item.proposer?.username ? `Proposed by ${item.proposer.username}. ` : ''}
                {item.message || 'No message included.'}
              </div>
              <ContributionInlineDiff contributionId={item.id} />
              {canReview && item.status === 'pending' ? (
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button
                    type="button"
                    disabled={reviewingId === item.id}
                    onClick={() => onReview(item.id, 'accept')}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '5px 10px', borderRadius: 8, border: '1px solid #bbf7d0',
                      background: '#f0fdf4', color: '#16a34a', fontSize: 11, fontWeight: 700,
                      cursor: reviewingId === item.id ? 'wait' : 'pointer', fontFamily: FONT,
                    }}
                  >
                    <IconCheck size={11} /> Accept
                  </button>
                  <button
                    type="button"
                    disabled={reviewingId === item.id}
                    onClick={() => onReview(item.id, 'reject')}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '5px 10px', borderRadius: 8, border: '1px solid #fecaca',
                      background: '#fef2f2', color: '#dc2626', fontSize: 11, fontWeight: 700,
                      cursor: reviewingId === item.id ? 'wait' : 'pointer', fontFamily: FONT,
                    }}
                  >
                    <IconX size={11} /> Reject
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export default function SheetViewerPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  usePageTitle('Sheet Viewer')
  const { user, clearSession } = useSession()
  const layout = useResponsiveAppLayout()
  const [sheetState, setSheetState] = useState({ sheet: null, loading: true, error: '' })
  const [commentsState, setCommentsState] = useState({ comments: [], total: 0, loading: true, error: '' })
  const [commentDraft, setCommentDraft] = useState('')
  const [commentSaving, setCommentSaving] = useState(false)
  const [forking, setForking] = useState(false)
  const [contributing, setContributing] = useState(false)
  const [showContributeModal, setShowContributeModal] = useState(false)
  const [contributeMessage, setContributeMessage] = useState('')
  const [reviewingId, setReviewingId] = useState(null)
  const tutorial = useTutorial('viewer', VIEWER_STEPS)
  const sheetPanelRef = useRef(null)
  const animatedRef = useRef(false)

  /* Animate sheet content on first load */
  useEffect(() => {
    if (sheetState.loading || animatedRef.current || !sheetState.sheet) return
    animatedRef.current = true
    if (sheetPanelRef.current) fadeInUp(sheetPanelRef.current, { duration: 450, y: 16 })
  }, [sheetState.loading, sheetState.sheet])

  const sheetId = Number.parseInt(id, 10)

  useEffect(() => {
    if (Number.isInteger(sheetId)) return
    setSheetState({ sheet: null, loading: false, error: 'Invalid sheet ID.' })
    setCommentsState({ comments: [], total: 0, loading: false, error: '' })
  }, [sheetId])

  const loadSheet = useCallback(async ({ signal, startTransition } = {}) => {
    const apply = startTransition || ((fn) => fn())

    try {
      const response = await fetch(`${API}/api/sheets/${sheetId}`, {
        headers: authHeaders(),
        credentials: 'include',
        signal,
      })

      const data = await readJsonSafely(response, {})

      if (isAuthSessionFailure(response, data)) {
        clearSession()
        navigate('/login', { replace: true })
        return
      }

      if (response.status === 403) {
        apply(() => setSheetState({
          sheet: null,
          loading: false,
          error: getApiErrorMessage(data, 'You do not have access to this sheet.'),
        }))
        return
      }

      if (!response.ok) {
        throw new Error(getApiErrorMessage(data, 'Could not load this sheet.'))
      }

      apply(() => setSheetState({ sheet: data, loading: false, error: '' }))
    } catch (error) {
      if (error?.name === 'AbortError') return
      apply(() => setSheetState({ sheet: null, loading: false, error: error.message || 'Could not load this sheet.' }))
    }
  }, [clearSession, navigate, sheetId])

  const loadComments = useCallback(async ({ signal, startTransition } = {}) => {
    const apply = startTransition || ((fn) => fn())

    try {
      const response = await fetch(`${API}/api/sheets/${sheetId}/comments?limit=20`, {
        headers: authHeaders(),
        credentials: 'include',
        signal,
      })
      const data = await readJsonSafely(response, {})

      if (isAuthSessionFailure(response, data)) {
        clearSession()
        navigate('/login', { replace: true })
        return
      }

      if (response.status === 403) {
        apply(() => {
          setCommentsState((current) => ({
            ...current,
            loading: false,
            error: getApiErrorMessage(data, 'You do not have access to these comments.'),
          }))
        })
        return
      }

      if (!response.ok) {
        throw new Error(getApiErrorMessage(data, 'Could not load comments.'))
      }
      apply(() => {
        setCommentsState({
          comments: Array.isArray(data.comments) ? data.comments : [],
          total: data.total || 0,
          loading: false,
          error: '',
        })
      })
    } catch (error) {
      if (error?.name === 'AbortError') return
      apply(() => {
        setCommentsState({ comments: [], total: 0, loading: false, error: error.message || 'Could not load comments.' })
      })
    }
  }, [clearSession, navigate, sheetId])

  useLivePolling(loadSheet, {
    enabled: Number.isInteger(sheetId),
    intervalMs: 45000,
  })

  useLivePolling(loadComments, {
    enabled: Number.isInteger(sheetId),
    intervalMs: 60000,
  })

  const { sheet } = sheetState
  const canEdit = useMemo(() => user && sheet && (user.role === 'admin' || user.id === sheet.userId), [sheet, user])
  const isHtmlSheet = sheet?.contentFormat === 'html'
  const previewKind = attachmentPreviewKind(sheet?.attachmentType, sheet?.attachmentName)
  const attachmentPreviewUrl = sheet?.id ? `${API}/api/sheets/${sheet.id}/attachment/preview` : ''

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1)
      return
    }
    navigate('/sheets', { replace: true })
  }

  const updateStar = async () => {
    if (!sheet) return
    try {
      const response = await fetch(`${API}/api/sheets/${sheet.id}/star`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Could not update the star.')
      }
      setSheetState((current) => ({
        ...current,
        sheet: current.sheet ? { ...current.sheet, starred: data.starred, stars: data.stars } : current.sheet,
        error: '',
      }))
      trackEvent(data.starred ? 'sheet_starred' : 'sheet_unstarred', { sheetId: sheet.id })
    } catch (error) {
      showToast(error.message || 'Could not update the star.', 'error')
      setSheetState((current) => ({ ...current, error: error.message || 'Could not update the star.' }))
    }
  }

  const updateReaction = async (type) => {
    if (!sheet) return
    const nextType = sheet.reactions?.userReaction === type ? null : type
    try {
      const response = await fetch(`${API}/api/sheets/${sheet.id}/react`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ type: nextType }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Could not update the reaction.')
      }
      setSheetState((current) => ({
        ...current,
        sheet: current.sheet ? { ...current.sheet, reactions: data } : current.sheet,
        error: '',
      }))
    } catch (error) {
      setSheetState((current) => ({ ...current, error: error.message || 'Could not update the reaction.' }))
    }
  }

  const handleFork = async () => {
    if (!sheet || forking) return
    setForking(true)
    try {
      const response = await fetch(`${API}/api/sheets/${sheet.id}/fork`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({}),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Could not fork this sheet.')
      showToast('Sheet forked! Redirecting to editor…', 'success')
      trackEvent('sheet_forked', { sheetId: sheet.id })
      navigate(`/sheets/${data.id}/edit`)
    } catch (error) {
      showToast(error.message || 'Could not fork this sheet.', 'error')
      setSheetState((current) => ({ ...current, error: error.message }))
    } finally {
      setForking(false)
    }
  }

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href)
      .then(() => {
        showToast('Link copied to clipboard!', 'success')
        trackEvent('sheet_shared', { sheetId: sheet?.id, method: 'copy_link' })
      })
      .catch(() => showToast('Could not copy link.', 'error'))
  }

  const handleContribute = async () => {
    if (!sheet || contributing) return
    setContributing(true)
    try {
      const response = await fetch(`${API}/api/sheets/${sheet.id}/contributions`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ message: contributeMessage.trim() }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Could not submit contribution.')
      showToast('Contribution submitted!', 'success')
      setShowContributeModal(false)
      setContributeMessage('')
      loadSheet()
    } catch (error) {
      showToast(error.message || 'Could not submit contribution.', 'error')
      setSheetState((current) => ({ ...current, error: error.message }))
    } finally {
      setContributing(false)
    }
  }

  const handleReviewContribution = async (contributionId, action) => {
    if (reviewingId) return
    setReviewingId(contributionId)
    try {
      const response = await fetch(`${API}/api/sheets/contributions/${contributionId}`, {
        method: 'PATCH',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ action }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || `Could not ${action} contribution.`)
      showToast(`Contribution ${action}ed`, 'success')
      loadSheet()
    } catch (error) {
      showToast(error.message, 'error')
      setSheetState((current) => ({ ...current, error: error.message }))
    } finally {
      setReviewingId(null)
    }
  }

  const submitComment = async (event) => {
    event.preventDefault()
    if (!commentDraft.trim()) return

    setCommentSaving(true)
    try {
      const response = await fetch(`${API}/api/sheets/${sheetId}/comments`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ content: commentDraft.trim() }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Could not post the comment.')
      }

      setCommentDraft('')
      setCommentsState((current) => ({
        ...current,
        comments: [data, ...current.comments],
        total: current.total + 1,
        error: '',
      }))
      setSheetState((current) => ({
        ...current,
        sheet: current.sheet ? { ...current.sheet, commentCount: (current.sheet.commentCount || 0) + 1 } : current.sheet,
      }))
    } catch (error) {
      setCommentsState((current) => ({ ...current, error: error.message || 'Could not post the comment.' }))
    } finally {
      setCommentSaving(false)
    }
  }

  const deleteComment = async (commentId) => {
    try {
      const response = await fetch(`${API}/api/sheets/${sheetId}/comments/${commentId}`, {
        method: 'DELETE',
        headers: authHeaders(),
        credentials: 'include',
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Could not delete comment.')
      }
      setCommentsState((current) => ({
        ...current,
        comments: current.comments.filter((c) => c.id !== commentId),
        total: Math.max(0, current.total - 1),
      }))
      setSheetState((current) => ({
        ...current,
        sheet: current.sheet ? { ...current.sheet, commentCount: Math.max(0, (current.sheet.commentCount || 1) - 1) } : current.sheet,
      }))
    } catch (error) {
      setCommentsState((current) => ({ ...current, error: error.message }))
    }
  }

  return (
    <>
      <Navbar />
      <div style={{ background: '#edf0f5', minHeight: '100vh', fontFamily: FONT }}>
        <div style={pageShell('reading', 26, 48)}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: layout.columns.readingThreeColumn,
              gap: 22,
              alignItems: 'start',
            }}
          >
            <AppSidebar mode={layout.sidebarMode} />

            <main id="main-content" style={{ display: 'grid', gap: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <button type="button" onClick={handleBack} style={actionButton('#475569')}>
                  <IconArrowLeft size={14} />
                  Back
                </button>
                {sheet ? (
                  <div data-tutorial="viewer-actions" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button type="button" onClick={updateStar} style={actionButton(sheet.starred ? '#f59e0b' : '#475569')}>
                      {sheet.starred ? <IconStarFilled size={14} /> : <IconStar size={14} />}
                      {sheet.stars || 0}
                    </button>
                    <button type="button" onClick={handleShare} style={actionButton('#0891b2')}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                      Share
                    </button>
                    <button type="button" onClick={() => updateReaction('like')} style={actionButton(sheet.reactions?.userReaction === 'like' ? '#16a34a' : '#475569')}>
                      Helpful {sheet.reactions?.likes || 0}
                    </button>
                    <button type="button" onClick={() => updateReaction('dislike')} style={actionButton(sheet.reactions?.userReaction === 'dislike' ? '#dc2626' : '#475569')}>
                      Needs work {sheet.reactions?.dislikes || 0}
                    </button>
                    {sheet.hasAttachment ? (
                      <Link to={`/preview/sheet/${sheet.id}`} style={linkButton()}>
                        <IconEye size={14} />
                        Preview attachment
                      </Link>
                    ) : null}
                    {isHtmlSheet && (sheet.status !== 'pending_review' || canEdit) ? (
                      <Link to={`/sheets/preview/html/${sheet.id}`} style={linkButton()}>
                        <IconEye size={14} />
                        Open sandbox preview
                      </Link>
                    ) : null}
                    {sheet.allowDownloads === false ? null : (
                      <a href={`${API}/api/sheets/${sheet.id}/download`} style={linkButton()}>
                        <IconDownload size={14} />
                        Download
                      </a>
                    )}
                    {canEdit ? (
                      <Link to={`/sheets/${sheet.id}/edit`} style={linkButton()}>
                        Edit
                      </Link>
                    ) : null}
                    {user ? (
                      <Link to={`/sheets/${sheet.id}/lab`} style={linkButton()}>
                        Sheet Lab
                      </Link>
                    ) : null}
                    {user && sheet.userId !== user.id ? (
                      <button type="button" onClick={handleFork} disabled={forking} style={actionButton('#6366f1')}>
                        <IconFork size={13} />
                        {forking ? 'Forking…' : 'Fork'}
                      </button>
                    ) : null}
                    {user && sheet.forkOf && sheet.userId === user.id ? (
                      <button type="button" onClick={() => setShowContributeModal(true)} style={actionButton('#059669')}>
                        <IconGitPullRequest size={13} />
                        Contribute Back
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {errorBanner(sheetState.error)}

              {sheetState.loading ? (
                <SkeletonCard style={{ padding: '28px 24px' }} />
              ) : sheet ? (
                <section ref={sheetPanelRef} data-tutorial="viewer-content" style={panelStyle()}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
                    <div>
                      <h1 style={{ margin: 0, fontSize: 30, color: '#0f172a' }}>{sheet.title}</h1>
                      <div style={{ marginTop: 6, color: '#64748b', fontSize: 13 }}>
                        by {sheet.author?.username || 'Unknown'} • {sheet.course?.code || 'General'} • updated {timeAgo(sheet.updatedAt || sheet.createdAt)}
                      </div>
                      {isHtmlSheet ? (
                        <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase' }}>
                            HTML sheet
                          </span>
                          {sheet.status === 'pending_review' ? (
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#b45309', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 6, padding: '2px 8px', textTransform: 'uppercase' }}>
                              Pending Review
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    {sheet.forkSource ? (
                      <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center', color: '#475569', fontSize: 12 }}>
                        <IconFork size={13} />
                        Forked from {sheet.forkSource.title}
                      </div>
                    ) : null}
                  </div>

                  {sheet.description ? (
                    <p style={{ margin: '0 0 16px', color: '#475569', fontSize: 14, lineHeight: 1.7 }}>{sheet.description}</p>
                  ) : null}

                  {isHtmlSheet ? (
                    <div
                      style={{
                        borderRadius: 16,
                        border: '1px solid #e2e8f0',
                        overflow: 'hidden',
                        background: '#fff',
                      }}
                    >
                      <iframe
                        title={`sheet-html-${sheet.id}`}
                        sandbox="allow-forms allow-modals allow-pointer-lock allow-popups allow-scripts"
                        srcDoc={sheet.content || ''}
                        style={{ width: '100%', minHeight: 560, border: 'none' }}
                      />
                    </div>
                  ) : (
                    <div
                      style={{
                        borderRadius: 16,
                        border: '1px solid #e2e8f0',
                        background: '#f8fafc',
                        padding: 18,
                        color: '#1e293b',
                        fontSize: 14,
                        lineHeight: 1.8,
                        whiteSpace: 'pre-wrap',
                        overflowX: 'auto',
                      }}
                    >
                      {sheet.content}
                    </div>
                  )}
                </section>
              ) : null}

              {errorBanner(commentsState.error)}

              <section data-tutorial="viewer-comments" style={panelStyle()}>
                <h2 style={{ margin: '0 0 12px', fontSize: 18, color: '#0f172a' }}>Comments</h2>
                <form onSubmit={submitComment} style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
                  <textarea
                    value={commentDraft}
                    onChange={(event) => setCommentDraft(event.target.value)}
                    placeholder="Add a comment or @mention a classmate."
                    rows={3}
                    style={{
                      width: '100%',
                      resize: 'vertical',
                      borderRadius: 12,
                      border: '1px solid #cbd5e1',
                      padding: 12,
                      font: 'inherit',
                    }}
                  />
                  <div>
                    <button
                      type="submit"
                      disabled={commentSaving}
                      style={{
                        borderRadius: 10,
                        border: 'none',
                        background: '#3b82f6',
                        color: '#fff',
                        fontWeight: 800,
                        fontSize: 13,
                        padding: '10px 14px',
                        cursor: commentSaving ? 'wait' : 'pointer',
                        fontFamily: FONT,
                      }}
                    >
                      {commentSaving ? 'Posting...' : 'Post comment'}
                    </button>
                  </div>
                </form>

                {commentsState.loading ? (
                  <div style={{ color: '#64748b', fontSize: 14 }}>Loading comments...</div>
                ) : commentsState.comments.length === 0 ? (
                  <div style={{ color: '#94a3b8', fontSize: 13 }}>No comments yet.</div>
                ) : (
                  <div style={{ display: 'grid', gap: 12 }}>
                    {commentsState.comments.map((comment) => (
                      <div key={comment.id} style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 4, alignItems: 'center' }}>
                          <Link to={`/users/${comment.author?.username}`} style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', textDecoration: 'none' }}>
                            {comment.author?.username || 'Unknown'}
                          </Link>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 11, color: '#94a3b8' }}>{timeAgo(comment.createdAt)}</span>
                            {user && (user.id === comment.author?.id || user.role === 'admin') ? (
                              <button
                                type="button"
                                onClick={() => deleteComment(comment.id)}
                                style={{
                                  padding: '2px 8px', borderRadius: 6, border: '1px solid #fecaca',
                                  background: '#fff', color: '#dc2626', fontSize: 11, fontWeight: 600,
                                  cursor: 'pointer', fontFamily: FONT,
                                }}
                              >
                                Delete
                              </button>
                            ) : null}
                          </div>
                        </div>
                        <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                          <MentionText text={comment.content} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </main>

            <aside style={{ display: 'grid', gap: 16 }}>
              {sheet ? (
                <section style={panelStyle()}>
                  <h2 style={{ margin: '0 0 10px', fontSize: 15, color: '#0f172a' }}>Sheet stats</h2>
                  <div style={{ display: 'grid', gap: 10, color: '#64748b', fontSize: 13 }}>
                    <div>{sheet.stars || 0} stars</div>
                    <div>{sheet.commentCount || 0} comments</div>
                    <div>{sheet.downloads || 0} downloads</div>
                    <div>{sheet.forks || 0} forks</div>
                    {sheet.allowDownloads === false ? <div>Downloads disabled</div> : null}
                    {sheet.hasAttachment ? (
                      <Link to={`/preview/sheet/${sheet.id}`} style={linkButton()}>
                        <IconEye size={14} />
                        Full preview
                      </Link>
                    ) : null}
                    {sheet.hasAttachment && sheet.allowDownloads !== false ? (
                      <a href={`${API}/api/sheets/${sheet.id}/attachment`} style={linkButton()}>
                        <IconDownload size={14} />
                        Download attachment
                      </a>
                    ) : null}
                  </div>
                  {sheet.hasAttachment ? (
                    <div
                      style={{
                        marginTop: 12,
                        border: '1px solid #e2e8f0',
                        borderRadius: 12,
                        overflow: 'hidden',
                        background: '#fff',
                      }}
                    >
                      {previewKind === 'image' ? (
                        <img
                          src={attachmentPreviewUrl}
                          alt={sheet.attachmentName || 'Attachment preview'}
                          style={{ width: '100%', maxHeight: 220, objectFit: 'contain', display: 'block' }}
                        />
                      ) : (
                        <iframe
                          src={attachmentPreviewUrl}
                          title={`Sheet attachment preview ${sheet.id}`}
                          loading="lazy"
                          style={{ width: '100%', height: 220, border: 'none' }}
                        />
                      )}
                    </div>
                  ) : null}
                </section>
              ) : null}
              {sheet?.incomingContributions ? (
                <ContributionList
                  title="Incoming contributions"
                  items={sheet.incomingContributions}
                  canReview={canEdit}
                  onReview={handleReviewContribution}
                  reviewingId={reviewingId}
                />
              ) : null}
              {sheet?.outgoingContributions ? (
                <ContributionList title="Outgoing contributions" items={sheet.outgoingContributions} />
              ) : null}
            </aside>
          </div>
        </div>
      </div>

      {/* ── Contribute-back modal ────────────────────────────────────── */}
      {showContributeModal ? (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(15, 23, 42, 0.5)', display: 'grid', placeItems: 'center',
          }}
          onClick={() => setShowContributeModal(false)}
        >
          <div
            style={{
              background: '#fff', borderRadius: 18, padding: 28, width: '100%', maxWidth: 440,
              boxShadow: '0 20px 60px rgba(0,0,0,0.2)', fontFamily: FONT,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: '0 0 6px', fontSize: 18, color: '#0f172a' }}>
              <IconGitPullRequest size={18} style={{ verticalAlign: 'middle', marginRight: 8 }} />
              Contribute Changes Back
            </h2>
            <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: 13, lineHeight: 1.6 }}>
              Submit your changes to the original author for review. They can accept or reject your contribution.
            </p>
            <textarea
              value={contributeMessage}
              onChange={(e) => setContributeMessage(e.target.value)}
              placeholder="Describe what you changed and why (optional)…"
              rows={3}
              maxLength={500}
              style={{
                width: '100%', resize: 'vertical', borderRadius: 12, border: '1px solid #cbd5e1',
                padding: 12, fontSize: 13, fontFamily: 'inherit', marginBottom: 16,
              }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowContributeModal(false)}
                style={{
                  padding: '8px 16px', borderRadius: 10, border: '1px solid #cbd5e1',
                  background: '#fff', color: '#64748b', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', fontFamily: FONT,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleContribute}
                disabled={contributing}
                style={{
                  padding: '8px 18px', borderRadius: 10, border: 'none',
                  background: contributing ? '#86efac' : '#059669', color: '#fff',
                  fontSize: 13, fontWeight: 700, cursor: contributing ? 'wait' : 'pointer',
                  fontFamily: FONT, display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
              >
                <IconGitPullRequest size={13} />
                {contributing ? 'Submitting…' : 'Submit Contribution'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <SafeJoyride {...tutorial.joyrideProps} />
    </>
  )
}
