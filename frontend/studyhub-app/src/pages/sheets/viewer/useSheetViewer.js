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
import { recordSheetView, removeRecentlyViewedEntry } from '../../lib/useRecentlyViewed'
import { useStudyStatus } from '../../lib/useStudyStatus'
import { usePageTiming } from '../../lib/usePageTiming'
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
  const [safePreviewUrl, setSafePreviewUrl] = useState('')
  const [runtimeUrl, setRuntimeUrl] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [runtimeLoading, setRuntimeLoading] = useState(false)
  const [htmlWarningAcked, setHtmlWarningAcked] = useState(false)
  const [viewerInteractive, setViewerInteractive] = useState(false)
  const [relatedSheets, setRelatedSheets] = useState([])
  const sheetPanelRef = useRef(null)
  const animatedRef = useRef(false)
  const timing = usePageTiming('sheet')

  /* Animate sheet content on first load */
  useEffect(() => {
    if (sheetState.loading || animatedRef.current || !sheetState.sheet) return
    animatedRef.current = true
    if (sheetPanelRef.current) fadeInUp(sheetPanelRef.current, { duration: 450, y: 16 })
  }, [sheetState.loading, sheetState.sheet])

  /* Record sheet view for recently-viewed tracking */
  useEffect(() => {
    if (sheetState.sheet) recordSheetView(sheetState.sheet)
  }, [sheetState.sheet])

  const sheetId = Number.parseInt(id, 10)
  const { studyStatus, setStudyStatus, STUDY_STATUSES } = useStudyStatus(sheetId)

  useEffect(() => {
    if (Number.isInteger(sheetId)) return
    setSheetState({ sheet: null, loading: false, error: 'Invalid sheet ID.' })
    setCommentsState({ comments: [], total: 0, loading: false, error: '' })
  }, [sheetId])

  const loadSheet = useCallback(async ({ signal, startTransition } = {}) => {
    const apply = startTransition || ((fn) => fn())

    timing.markFetchStart()
    try {
      const response = await fetch(`${API}/api/sheets/${sheetId}`, {
        headers: authHeaders(),
        credentials: 'include',
        signal,
      })

      const data = await readJsonSafely(response, {})
      timing.markFetchEnd()

      if (isAuthSessionFailure(response, data)) {
        clearSession()
        navigate('/login', { replace: true })
        return
      }

      if (response.status === 403) {
        removeRecentlyViewedEntry(sheetId)
        apply(() => setSheetState({
          sheet: null,
          loading: false,
          error: getApiErrorMessage(data, 'This sheet is private or you don\u2019t have permission to view it.'),
        }))
        return
      }

      if (!response.ok) {
        if (response.status === 404) {
          removeRecentlyViewedEntry(sheetId)
          throw new Error(getApiErrorMessage(data, 'This sheet was removed or doesn\u2019t exist.'))
        }
        throw new Error(getApiErrorMessage(data, 'Could not load this sheet. Please try again.'))
      }

      apply(() => setSheetState({ sheet: data, loading: false, error: '' }))
    } catch (error) {
      if (error?.name === 'AbortError') return
      apply(() => setSheetState({ sheet: null, loading: false, error: error.message || 'Could not load this sheet.' }))
    }
  }, [clearSession, navigate, sheetId, timing])

  // Report timing when sheet content arrives
  useEffect(() => {
    if (!sheetState.loading && sheetState.sheet) timing.markContentVisible()
  }, [sheetState.loading, sheetState.sheet, timing])

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

  /* ── Related sheets (same course, exclude self) ─────────────── */
  useEffect(() => {
    if (!sheet?.course?.id || !sheet?.id) return
    const controller = new AbortController()
    fetch(`${API}/api/sheets?courseId=${sheet.course.id}&limit=5&sort=stars`, {
      headers: authHeaders(),
      credentials: 'include',
      signal: controller.signal,
    })
      .then((r) => r.json().catch(() => ({})))
      .then((data) => {
        if (!controller.signal.aborted && Array.isArray(data.sheets)) {
          setRelatedSheets(data.sheets.filter((s) => s.id !== sheet.id).slice(0, 4))
        }
      })
      .catch(() => {})
    return () => { controller.abort() }
  }, [sheet?.course?.id, sheet?.id])

  /* ── HTML runtime URL + warning gate ──────────────────────── */
  useEffect(() => {
    if (!isHtmlSheet || !sheet?.id) return
    const ackKey = `htmlSheetWarnAck:${sheet.id}`
    if (localStorage.getItem(ackKey) === '1') setHtmlWarningAcked(true)
  }, [isHtmlSheet, sheet?.id])

  /* After warning acknowledged, load safe preview (scripts disabled) */
  useEffect(() => {
    if (!isHtmlSheet || !htmlWarningAcked || !sheet?.id) return
    const controller = new AbortController()
    setPreviewLoading(true)
    fetch(`${API}/api/sheets/${sheet.id}/html-preview`, {
      headers: authHeaders(),
      credentials: 'include',
      signal: controller.signal,
    })
      .then((r) => r.json().catch(() => ({})))
      .then((data) => {
        if (!controller.signal.aborted && data?.previewUrl) setSafePreviewUrl(data.previewUrl)
      })
      .catch(() => {})
      .finally(() => { if (!controller.signal.aborted) setPreviewLoading(false) })
    return () => { controller.abort() }
  }, [isHtmlSheet, htmlWarningAcked, sheet?.id])

  /* Load interactive runtime URL on demand (owner/admin only) */
  const loadInteractiveRuntime = useCallback(() => {
    if (!isHtmlSheet || !sheet?.id || runtimeUrl) return
    setRuntimeLoading(true)
    fetch(`${API}/api/sheets/${sheet.id}/html-runtime`, {
      headers: authHeaders(),
      credentials: 'include',
    })
      .then((r) => r.json().catch(() => ({})))
      .then((data) => {
        if (data?.runtimeUrl) setRuntimeUrl(data.runtimeUrl)
        else setViewerInteractive(false)
      })
      .catch(() => { setViewerInteractive(false) })
      .finally(() => { setRuntimeLoading(false) })
  }, [isHtmlSheet, sheet?.id, runtimeUrl])

  const toggleViewerInteractive = useCallback(() => {
    if (viewerInteractive) {
      setViewerInteractive(false)
    } else {
      setViewerInteractive(true)
      if (!runtimeUrl) loadInteractiveRuntime()
    }
  }, [viewerInteractive, runtimeUrl, loadInteractiveRuntime])

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
        throw new Error(getApiErrorMessage(data, 'Could not update the star.'))
      }
      setSheetState((current) => ({
        ...current,
        sheet: current.sheet ? { ...current.sheet, starred: data.starred, stars: data.stars } : current.sheet,
        error: '',
      }))
      trackEvent(data.starred ? 'sheet_starred' : 'sheet_unstarred', { sheetId: sheet.id })
      if (data.starred) showToast('Starred! Find it in your feed sidebar or browse starred sheets.', 'success')
    } catch (error) {
      showToast(error.message || 'Could not update the star.', 'error')
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
        throw new Error(getApiErrorMessage(data, 'Could not update the reaction.'))
      }
      setSheetState((current) => ({
        ...current,
        sheet: current.sheet ? { ...current.sheet, reactions: data } : current.sheet,
        error: '',
      }))
    } catch (error) {
      showToast(error.message || 'Could not update the reaction.', 'error')
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
      if (!response.ok) throw new Error(getApiErrorMessage(data, 'Could not fork this sheet.'))
      showToast('Sheet forked! Opening your copy in SheetLab…', 'success')
      trackEvent('sheet_forked', { sheetId: sheet.id })
      navigate(`/sheets/${data.id}/lab`)
    } catch (error) {
      showToast(error.message || 'Could not fork this sheet.', 'error')
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
      if (!response.ok) throw new Error(getApiErrorMessage(data, 'Could not submit contribution.'))
      showToast('Contribution submitted!', 'success')
      setShowContributeModal(false)
      setContributeMessage('')
      loadSheet()
    } catch (error) {
      showToast(error.message || 'Could not submit contribution.', 'error')
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
      if (!response.ok) throw new Error(getApiErrorMessage(data, `Could not ${action} contribution.`))
      showToast(`Contribution ${action}ed`, 'success')
      loadSheet()
    } catch (error) {
      showToast(error.message, 'error')
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
        throw new Error(getApiErrorMessage(data, 'Could not post the comment.'))
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
        throw new Error(getApiErrorMessage(data, 'Could not delete comment.'))
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
    safePreviewUrl,
    runtimeUrl,
    previewLoading,
    runtimeLoading,
    htmlWarningAcked,
    viewerInteractive,
    toggleViewerInteractive,
    relatedSheets,
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
    studyStatus,
    setStudyStatus,
    STUDY_STATUSES,
  }
}
