import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { API } from '../../config'
import { getApiErrorMessage, isAuthSessionFailure, readJsonSafely } from '../../lib/http'
import { useSession } from '../../lib/session-context'
import { useLivePolling } from '../../lib/useLivePolling'
import { fadeInUp } from '../../lib/animations'
import { showToast } from '../../lib/toast'
import { usePageTitle } from '../../lib/usePageTitle'
import { trackEvent } from '../../lib/telemetry'
import { authHeaders, attachmentPreviewKind } from './sheetViewerConstants'

export default function useSheetViewer() {
  const navigate = useNavigate()
  const { id } = useParams()
  usePageTitle('Sheet Viewer')
  const { user, clearSession } = useSession()
  const [sheetState, setSheetState] = useState({ sheet: null, loading: true, error: '' })
  const [commentsState, setCommentsState] = useState({ comments: [], total: 0, loading: true, error: '' })
  const [commentDraft, setCommentDraft] = useState('')
  const [commentSaving, setCommentSaving] = useState(false)
  const [forking, setForking] = useState(false)
  const [contributing, setContributing] = useState(false)
  const [showContributeModal, setShowContributeModal] = useState(false)
  const [contributeMessage, setContributeMessage] = useState('')
  const [reviewingId, setReviewingId] = useState(null)
  const [runtimeUrl, setRuntimeUrl] = useState('')
  const [runtimeLoading, setRuntimeLoading] = useState(false)
  const [htmlWarningAcked, setHtmlWarningAcked] = useState(false)
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

  /* ── HTML runtime URL + warning gate ──────────────────────── */
  useEffect(() => {
    if (!isHtmlSheet || !sheet?.id) return
    const ackKey = `htmlSheetWarnAck:${sheet.id}`
    if (localStorage.getItem(ackKey) === '1') setHtmlWarningAcked(true)
  }, [isHtmlSheet, sheet?.id])

  useEffect(() => {
    if (!isHtmlSheet || !htmlWarningAcked || !sheet?.id) return
    let cancelled = false
    setRuntimeLoading(true)
    fetch(`${API}/api/sheets/${sheet.id}/html-runtime`, {
      headers: authHeaders(),
      credentials: 'include',
    })
      .then((r) => r.json().catch(() => ({})))
      .then((data) => {
        if (!cancelled && data?.runtimeUrl) setRuntimeUrl(data.runtimeUrl)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setRuntimeLoading(false) })
    return () => { cancelled = true }
  }, [isHtmlSheet, htmlWarningAcked, sheet?.id])

  const acceptHtmlWarning = () => {
    if (sheet?.id) localStorage.setItem(`htmlSheetWarnAck:${sheet.id}`, '1')
    setHtmlWarningAcked(true)
  }

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

  return {
    user,
    sheet,
    sheetState,
    commentsState,
    commentDraft,
    setCommentDraft,
    commentSaving,
    forking,
    contributing,
    showContributeModal,
    setShowContributeModal,
    contributeMessage,
    setContributeMessage,
    reviewingId,
    runtimeUrl,
    runtimeLoading,
    htmlWarningAcked,
    sheetPanelRef,
    canEdit,
    isHtmlSheet,
    previewKind,
    attachmentPreviewUrl,
    acceptHtmlWarning,
    handleBack,
    updateStar,
    updateReaction,
    handleFork,
    handleShare,
    handleContribute,
    handleReviewContribution,
    submitComment,
    deleteComment,
  }
}
