import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { API } from '../../../config'
import { getApiErrorMessage, isAuthSessionFailure, readJsonSafely } from '../../../lib/http'
import { useSession } from '../../../lib/session-context'
import { useLivePolling } from '../../../lib/useLivePolling'
import { fadeInUp } from '../../../lib/animations'
import { showToast } from '../../../lib/toast'
import { usePageTitle } from '../../../lib/usePageTitle'
import { trackEvent } from '../../../lib/telemetry'
import { recordSheetView, removeRecentlyViewedEntry } from '../../../lib/useRecentlyViewed'
import { useStudyStatus } from '../../../lib/useStudyStatus'
import { usePageTiming } from '../../../lib/usePageTiming'
import { authHeaders, attachmentPreviewKind } from './sheetViewerConstants'

export default function useSheetViewer() {
  const navigate = useNavigate()
  const { id } = useParams()
  usePageTitle('Sheet Viewer')
  const { user, clearSession } = useSession()
  const [sheetState, setSheetState] = useState({ sheet: null, loading: true, error: '' })
  const [commentsState, setCommentsState] = useState({
    comments: [],
    total: 0,
    loading: true,
    error: '',
  })
  const [commentDraft, setCommentDraft] = useState('')
  const [commentAttachments, setCommentAttachments] = useState([])
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
  const [runtimeError, setRuntimeError] = useState('')
  const [htmlWarningAcked, setHtmlWarningAcked] = useState(false)
  const [viewerInteractive, setViewerInteractive] = useState(false)
  const [relatedSheets, setRelatedSheets] = useState([])
  const [readmeData, setReadmeData] = useState(null)
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

  const loadSheet = useCallback(
    async ({ signal, startTransition } = {}) => {
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
          apply(() =>
            setSheetState({
              sheet: null,
              loading: false,
              error: getApiErrorMessage(
                data,
                'This sheet is private or you don\u2019t have permission to view it.',
              ),
            }),
          )
          return
        }

        if (!response.ok) {
          if (response.status === 404) {
            // Soft-retry once to absorb the brief race that can happen right
            // after a fork or upload, then fall back to a friendlier message.
            await new Promise((resolve) => setTimeout(resolve, 800))
            const retry = await fetch(`${API}/api/sheets/${sheetId}`, {
              headers: authHeaders(),
              credentials: 'include',
              signal,
            })
            const retryData = await readJsonSafely(retry, {})
            if (retry.ok) {
              apply(() => setSheetState({ sheet: retryData, loading: false, error: '' }))
              return
            }
            removeRecentlyViewedEntry(sheetId)
            throw new Error(
              getApiErrorMessage(
                retryData,
                'Hang tight \u2014 this sheet is still loading. If it does not appear in a moment, it may have been removed.',
              ),
            )
          }
          throw new Error(getApiErrorMessage(data, 'Could not load this sheet. Please try again.'))
        }

        apply(() => setSheetState({ sheet: data, loading: false, error: '' }))
      } catch (error) {
        if (error?.name === 'AbortError') return
        apply(() =>
          setSheetState({
            sheet: null,
            loading: false,
            error: error.message || 'Could not load this sheet.',
          }),
        )
      }
    },
    [clearSession, navigate, sheetId, timing],
  )

  // Report timing when sheet content arrives
  useEffect(() => {
    if (!sheetState.loading && sheetState.sheet) timing.markContentVisible()
  }, [sheetState.loading, sheetState.sheet, timing])

  const loadComments = useCallback(
    async ({ signal, startTransition } = {}) => {
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
          setCommentsState({
            comments: [],
            total: 0,
            loading: false,
            error: error.message || 'Could not load comments.',
          })
        })
      }
    },
    [clearSession, navigate, sheetId],
  )

  useLivePolling(loadSheet, {
    enabled: Number.isInteger(sheetId),
    intervalMs: 45000,
  })

  useLivePolling(loadComments, {
    enabled: Number.isInteger(sheetId),
    intervalMs: 60000,
  })

  const { sheet } = sheetState
  const canEdit = useMemo(
    () => user && sheet && (user.role === 'admin' || user.id === sheet.userId),
    [sheet, user],
  )
  const canToggleInteractive = useMemo(() => Boolean(user && sheet), [sheet, user])
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
    return () => {
      controller.abort()
    }
  }, [sheet?.course?.id, sheet?.id])

  /* ── README extras (contributors, latest commit) ────────────── */
  useEffect(() => {
    if (!sheet?.id) return
    const controller = new AbortController()
    ;(async () => {
      try {
        const response = await fetch(`${API}/api/sheets/${sheet.id}/readme`, {
          headers: authHeaders(),
          credentials: 'include',
          signal: controller.signal,
        })
        if (!response.ok) return // Non-200 — readme section simply won't render
        const data = await readJsonSafely(response, null)
        if (!controller.signal.aborted && data) setReadmeData(data)
      } catch (err) {
        if (err?.name === 'AbortError') return
        /* README is supplementary — don't block the page for it */
      }
    })()
    return () => {
      controller.abort()
    }
  }, [sheet?.id])

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
      .finally(() => {
        if (!controller.signal.aborted) setPreviewLoading(false)
      })
    return () => {
      controller.abort()
    }
  }, [isHtmlSheet, htmlWarningAcked, sheet?.id])

  /* Load interactive runtime URL on demand. Per the publish-with-warning
   * policy (CLAUDE.md HTML Security Policy + interactive-preview.test.js),
   * Tier 0 + Tier 1 sheets are interactive for any authenticated viewer;
   * only Tier 2+ HIGH_RISK sheets restrict to owner/admin. Older comment
   * here said "owner/admin only" — that was wrong, fixed below. The
   * silent fallback to safe-preview when the fetch failed was the actual
   * cause of "user can't interact with the iframe" reports: we'd toggle
   * viewerInteractive on, click the button, the runtime fetch would 4xx
   * (e.g. unauthenticated, expired session) or return an empty body, and
   * we'd flip viewerInteractive back off with no UI feedback. Surface a
   * specific error message instead so the user knows why interaction
   * isn't engaging. */
  const loadInteractiveRuntime = useCallback(() => {
    if (!isHtmlSheet || !sheet?.id || runtimeUrl) return
    setRuntimeLoading(true)
    setRuntimeError('')
    fetch(`${API}/api/sheets/${sheet.id}/html-runtime`, {
      headers: authHeaders(),
      credentials: 'include',
    })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) {
          // Backend returns 401 for unauth, 403 for non-owner on Tier 2,
          // 404 for missing sheet. Surface the server-supplied message
          // when available — it's the most accurate diagnosis.
          throw new Error(data?.error || `Could not load interactive preview (HTTP ${r.status}).`)
        }
        if (!data?.runtimeUrl) {
          throw new Error('Interactive preview is not available for this sheet.')
        }
        setRuntimeUrl(data.runtimeUrl)
      })
      .catch((err) => {
        setViewerInteractive(false)
        setRuntimeError(err?.message || 'Could not load interactive preview.')
      })
      .finally(() => {
        setRuntimeLoading(false)
      })
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
        sheet: current.sheet
          ? { ...current.sheet, starred: data.starred, stars: data.stars }
          : current.sheet,
        error: '',
      }))
      trackEvent(data.starred ? 'sheet_starred' : 'sheet_unstarred', { sheetId: sheet.id })
      if (data.starred)
        showToast('Starred! Find it in your feed sidebar or browse starred sheets.', 'success')
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
      navigate(`/sheets/${data.id}/lab?tab=editor`)
    } catch (error) {
      showToast(error.message || 'Could not fork this sheet.', 'error')
    } finally {
      setForking(false)
    }
  }

  const handleShare = () => {
    navigator.clipboard
      .writeText(window.location.href)
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
      if (!response.ok)
        throw new Error(getApiErrorMessage(data, `Could not ${action} contribution.`))
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
    const trimmedComment = commentDraft.trim()
    if (!trimmedComment && commentAttachments.length === 0) return

    setCommentSaving(true)
    try {
      const response = await fetch(`${API}/api/sheets/${sheetId}/comments`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ content: trimmedComment, attachments: commentAttachments }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(getApiErrorMessage(data, 'Could not post the comment.'))
      }

      setCommentDraft('')
      setCommentAttachments([])
      setCommentsState((current) => ({
        ...current,
        comments: [data, ...current.comments],
        total: current.total + 1,
        error: '',
      }))
      setSheetState((current) => ({
        ...current,
        sheet: current.sheet
          ? { ...current.sheet, commentCount: (current.sheet.commentCount || 0) + 1 }
          : current.sheet,
      }))
    } catch (error) {
      setCommentsState((current) => ({
        ...current,
        error: error.message || 'Could not post the comment.',
      }))
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
        sheet: current.sheet
          ? { ...current.sheet, commentCount: Math.max(0, (current.sheet.commentCount || 1) - 1) }
          : current.sheet,
      }))
    } catch (error) {
      setCommentsState((current) => ({ ...current, error: error.message }))
    }
  }

  const reactToComment = async (commentId, type) => {
    try {
      // Optimistic update
      setCommentsState((current) => ({
        ...current,
        comments: current.comments.map((comment) => {
          if (comment.id !== commentId) return comment

          const oldType = comment.userReaction
          const newType = oldType === type ? null : type

          const oldLikes = comment.reactionCounts.like || 0
          const oldDislikes = comment.reactionCounts.dislike || 0

          let newLikes = oldLikes
          let newDislikes = oldDislikes

          // Remove old reaction
          if (oldType === 'like') newLikes -= 1
          else if (oldType === 'dislike') newDislikes -= 1

          // Add new reaction
          if (newType === 'like') newLikes += 1
          else if (newType === 'dislike') newDislikes += 1

          return {
            ...comment,
            userReaction: newType,
            reactionCounts: { like: newLikes, dislike: newDislikes },
          }
        }),
      }))

      const response = await fetch(`${API}/api/sheets/${sheetId}/comments/${commentId}/react`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ type }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(getApiErrorMessage(data, 'Could not save reaction.'))
      }
    } catch (error) {
      setCommentsState((current) => ({ ...current, error: error.message }))
    }
  }

  const handleSheetUpdate = useCallback((patch) => {
    setSheetState((current) => ({
      ...current,
      sheet: current.sheet ? { ...current.sheet, ...patch } : current.sheet,
    }))
  }, [])

  return {
    user,
    sheet,
    sheetState,
    commentsState,
    commentDraft,
    setCommentDraft,
    commentAttachments,
    setCommentAttachments,
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
    runtimeError,
    htmlWarningAcked,
    viewerInteractive,
    toggleViewerInteractive,
    relatedSheets,
    readmeData,
    sheetPanelRef,
    canEdit,
    canToggleInteractive,
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
    reactToComment,
    studyStatus,
    setStudyStatus,
    STUDY_STATUSES,
    handleSheetUpdate,
  }
}
