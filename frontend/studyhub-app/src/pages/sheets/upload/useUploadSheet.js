/* ═══════════════════════════════════════════════════════════════════════════
 * useUploadSheet.js — Custom hook for UploadSheetPage state and effects.
 *
 * Action handlers (save, discard, import, submit, attachment) are in
 * uploadSheetActions.js to keep this file focused on state and effects.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { API } from '../../../config'
import { useTutorial } from '../../../lib/useTutorial'
import { UPLOAD_STEPS, TUTORIAL_VERSIONS } from '../../../lib/tutorialSteps'
import { usePageTitle } from '../../../lib/usePageTitle'
import {
  UPLOAD_TUTORIAL_KEY,
  canEditHtmlWorkingCopy,
  canSubmitHtmlReview,
  reduceScanState,
} from './uploadSheetWorkflow'
import { authHeaders, useSafeBlocker } from './uploadSheetConstants'
import {
  useSaveDraftNow,
  useUploadAttachment,
  useHandleSubmit,
  makeHandleAttachmentSelect,
  makeClearAttachFile,
  makeDiscardDraft,
  makeHandleHtmlImport,
  makeAcknowledgeScanAndDismiss,
} from './uploadSheetActions'

export default function useUploadSheet() {
  usePageTitle('Upload Sheet')
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { id: sheetId } = useParams()
  const isEditing = Boolean(sheetId)
  const draftQuery = searchParams.get('draft') || ''
  const requestedDraftId = Number.parseInt(draftQuery, 10)
  const hasRequestedDraft = Number.isInteger(requestedDraftId)

  /* ── Form state ────────────────────────────────────────────────────── */
  const [title, setTitle] = useState('')
  const [courseId, setCourseId] = useState('')
  const [description, setDescription] = useState('')
  const [allowDownloads, setAllowDownloads] = useState(true)
  const [content, setContent] = useState('')
  const [contentFormat, setContentFormat] = useState('html')
  const [status, setStatus] = useState(isEditing ? 'published' : 'draft')
  const [draftId, setDraftId] = useState(null)
  const [legacyMarkdownMode, setLegacyMarkdownMode] = useState(false)
  const tutorial = useTutorial('upload', UPLOAD_STEPS, { version: TUTORIAL_VERSIONS.upload })

  /* ── UI state ──────────────────────────────────────────────────────── */
  const [courses, setCourses] = useState([])
  const [error, setError] = useState('')
  const [initializing, setInitializing] = useState(true)
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [verificationRequired, setVerificationRequired] = useState(false)

  /* ── Scan state ────────────────────────────────────────────────────── */
  const [scanState, setScanState] = useState({
    status: 'passed',
    tier: 0,
    findings: [],
    updatedAt: null,
    acknowledgedAt: null,
    hasOriginalVersion: false,
    hasWorkingVersion: false,
    originalSourceName: null,
  })
  const [showScanModal, setShowScanModal] = useState(false)
  const [scanAckChecked, setScanAckChecked] = useState(false)
  const [scanModalDismissed, setScanModalDismissed] = useState(false)
  const [postSubmitNotice, setPostSubmitNotice] = useState(
    () => location.state?.postSubmitNotice || null,
  )

  /* ── Tutorial state ────────────────────────────────────────────────── */
  const [showTutorial, setShowTutorial] = useState(false)

  /* ── Attachment state ──────────────────────────────────────────────── */
  const [attachFile, setAttachFile] = useState(null)
  const [attachErr, setAttachErr] = useState('')
  const [attachUploading, setAttachUploading] = useState(false)
  const [existingAttachment, setExistingAttachment] = useState(null)
  const [removeExistingAttachment, setRemoveExistingAttachment] = useState(false)

  /* ── Draft management state ────────────────────────────────────────── */
  const [draftReloadKey, setDraftReloadKey] = useState(0)
  const [showDiscardDialog, setShowDiscardDialog] = useState(false)
  const [discarding, setDiscarding] = useState(false)

  /* ── Unsaved-changes state ─────────────────────────────────────────── */
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [showLeaveDialog, setShowLeaveDialog] = useState(false)
  const pendingBlockerRef = useRef(null)

  /* ── Refs ───────────────────────────────────────────────────────────── */
  const htmlImportInputRef = useRef(null)
  const attachmentInputRef = useRef(null)
  const autosaveTimer = useRef(null)

  /* ── Derived values ────────────────────────────────────────────────── */
  const activeSheetId = isEditing
    ? Number.parseInt(sheetId, 10)
    : hasRequestedDraft
      ? requestedDraftId
      : draftId
  const canEditHtml = canEditHtmlWorkingCopy()
  const canSubmitHtml = canSubmitHtmlReview({
    hasOriginalVersion: scanState.hasOriginalVersion,
    scanStatus: scanState.status,
    tier: scanState.tier,
    scanAcknowledged: Boolean(scanState.acknowledgedAt) || scanModalDismissed,
    title,
    courseId,
    description,
    html: content,
  })
  const isHtmlMode = !legacyMarkdownMode && contentFormat === 'html'

  useEffect(() => {
    if (location.state?.postSubmitNotice) {
      setPostSubmitNotice(location.state.postSubmitNotice)
    }
  }, [location.state])

  /* ── Hydrate helper ────────────────────────────────────────────────── */
  const hydrateFromSheet = useCallback((sheet) => {
    setTitle(sheet.title || '')
    setCourseId(sheet.courseId ? String(sheet.courseId) : '')
    setDescription(sheet.description || '')
    setAllowDownloads(sheet.allowDownloads !== false)
    setContent(sheet.content || '')
    setContentFormat(sheet.contentFormat === 'html' ? 'html' : 'markdown')
    setStatus(sheet.status || 'draft')
    setExistingAttachment(
      sheet.hasAttachment ? { name: sheet.attachmentName || 'Current attachment' } : null,
    )
    setRemoveExistingAttachment(false)

    const incoming = sheet.htmlWorkflow || {}
    setScanState((prev) =>
      reduceScanState(prev, {
        status: incoming.scanStatus || 'queued',
        tier: incoming.riskTier || 0,
        findings: incoming.scanFindings || [],
        riskSummary: incoming.riskSummary || '',
        tierExplanation: incoming.tierExplanation || '',
        findingsByCategory: incoming.findingsByCategory || {},
        updatedAt: incoming.scanUpdatedAt,
        acknowledgedAt: incoming.scanAcknowledgedAt,
        hasOriginalVersion: Boolean(incoming.hasOriginalVersion),
        hasWorkingVersion: Boolean(incoming.hasWorkingVersion),
        originalSourceName: incoming.originalSourceName || null,
      }),
    )

    setLegacyMarkdownMode(sheet.contentFormat !== 'html')
  }, [])

  /* ═══════════════════════════════════════════════════════════════════════
   * EFFECTS
   * ═══════════════════════════════════════════════════════════════════════ */

  /* ── Load courses ──────────────────────────────────────────────────── */
  const loadCourses = useCallback(async () => {
    try {
      const response = await fetch(`${API}/api/courses/schools`, {
        headers: authHeaders(),
        credentials: 'include',
      })
      const data = await response.json().catch(() => [])
      setCourses(
        (data || []).flatMap((school) =>
          (school.courses || []).map((course) => ({ ...course, schoolName: school.name })),
        ),
      )
    } catch {
      setCourses([])
    }
  }, [])

  useEffect(() => {
    void loadCourses()
  }, [loadCourses])

  /* ── Initial data load ─────────────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false
    setInitializing(true)
    setError('')

    async function loadData() {
      try {
        if (isEditing) {
          const response = await fetch(`${API}/api/sheets/${sheetId}`, {
            headers: authHeaders(),
            credentials: 'include',
          })
          const data = await response.json().catch(() => ({}))
          if (!response.ok) throw new Error(data.error || 'Could not load sheet.')
          if (cancelled) return
          setDraftId(data.id)
          hydrateFromSheet(data)
          return
        }

        if (hasRequestedDraft) {
          const response = await fetch(`${API}/api/sheets/${requestedDraftId}`, {
            headers: authHeaders(),
            credentials: 'include',
          })
          const data = await response.json().catch(() => ({}))
          if (!response.ok) throw new Error(data.error || 'Could not load sheet.')
          if (cancelled) return

          setDraftId(data.id)
          hydrateFromSheet(data)
          setSaved(true)
          return
        }

        const response = await fetch(`${API}/api/sheets/drafts/latest`, {
          headers: authHeaders(),
          credentials: 'include',
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error || 'Could not load latest draft.')
        if (cancelled) return

        if (data?.draft) {
          setDraftId(data.draft.id)
          hydrateFromSheet(data.draft)
          setSaved(true)
        } else {
          setLegacyMarkdownMode(false)
          setContentFormat('html')
          setStatus('draft')
          setContent('')
          setScanState((prev) =>
            reduceScanState(prev, {
              status: 'queued',
              findings: [],
              hasOriginalVersion: false,
              hasWorkingVersion: false,
              originalSourceName: null,
            }),
          )
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || 'Could not load editor.')
      } finally {
        if (!cancelled) setInitializing(false)
      }
    }

    void loadData()
    return () => {
      cancelled = true
    }
  }, [draftReloadKey, hasRequestedDraft, hydrateFromSheet, isEditing, requestedDraftId, sheetId])

  /* ── Tutorial check ────────────────────────────────────────────────── */
  useEffect(() => {
    if (initializing || isEditing) return
    if (typeof window === 'undefined') return
    if (window.localStorage.getItem(UPLOAD_TUTORIAL_KEY) !== '1') setShowTutorial(true)
  }, [initializing, isEditing])

  const dismissTutorial = () => {
    if (typeof window !== 'undefined') window.localStorage.setItem(UPLOAD_TUTORIAL_KEY, '1')
    setShowTutorial(false)
  }

  /* ── Browser beforeunload ──────────────────────────────────────────── */
  useEffect(() => {
    if (!hasUnsavedChanges) return
    const handler = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasUnsavedChanges])

  /* ── React Router blocker ──────────────────────────────────────────── */
  const blocker = useSafeBlocker(
    ({ currentLocation, nextLocation }) =>
      hasUnsavedChanges && currentLocation.pathname !== nextLocation.pathname,
  )

  useEffect(() => {
    if (blocker.state === 'blocked') {
      pendingBlockerRef.current = blocker
      setShowLeaveDialog(true)
    }
  }, [blocker])

  const confirmLeave = useCallback(() => {
    setShowLeaveDialog(false)
    if (pendingBlockerRef.current?.proceed) pendingBlockerRef.current.proceed()
    pendingBlockerRef.current = null
  }, [])

  const cancelLeave = useCallback(() => {
    setShowLeaveDialog(false)
    if (pendingBlockerRef.current?.reset) pendingBlockerRef.current.reset()
    pendingBlockerRef.current = null
  }, [])

  /* ── Scan status polling ───────────────────────────────────────────── */
  useEffect(() => {
    if (initializing || legacyMarkdownMode || !isHtmlMode || !Number.isInteger(activeSheetId))
      return
    let cancelled = false

    async function pollScanStatus() {
      try {
        const response = await fetch(`${API}/api/sheets/drafts/${activeSheetId}/scan-status`, {
          headers: authHeaders(),
          credentials: 'include',
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok || cancelled) return
        setScanState((prev) => reduceScanState(prev, data))
      } catch {
        /* polling is best-effort */
      }
    }

    void pollScanStatus()
    const interval = setInterval(pollScanStatus, 2500)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [activeSheetId, initializing, isHtmlMode, legacyMarkdownMode])

  /* ── Autosave effect ───────────────────────────────────────────────── */
  useEffect(() => {
    if (initializing || loading) return

    if (legacyMarkdownMode) {
      if (!courseId) return
      if (!title.trim() && !content.trim() && !description.trim()) return
      clearTimeout(autosaveTimer.current)
      autosaveTimer.current = setTimeout(async () => {
        try {
          setSaved(false)
          const response = await fetch(`${API}/api/sheets/drafts/autosave`, {
            method: 'POST',
            headers: authHeaders(),
            credentials: 'include',
            body: JSON.stringify({
              id: draftId,
              title,
              courseId: Number.parseInt(courseId, 10),
              content,
              contentFormat: 'markdown',
              description,
              allowDownloads,
            }),
          })
          const data = await response.json().catch(() => ({}))
          if (!response.ok) throw new Error(data.error || 'Draft autosave failed.')
          if (data?.draft?.id) setDraftId(data.draft.id)
          setSaved(true)
        } catch (autosaveError) {
          setError(autosaveError.message || 'Draft autosave failed.')
        }
      }, 1200)
      return () => clearTimeout(autosaveTimer.current)
    }

    if (!Number.isInteger(draftId) || !canEditHtml || !courseId) return
    clearTimeout(autosaveTimer.current)
    autosaveTimer.current = setTimeout(async () => {
      try {
        setSaved(false)
        const response = await fetch(`${API}/api/sheets/drafts/${draftId}/working-html`, {
          method: 'PATCH',
          headers: authHeaders(),
          credentials: 'include',
          body: JSON.stringify({
            title,
            courseId: Number.parseInt(courseId, 10),
            description,
            allowDownloads,
            html: content,
          }),
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error || 'Working draft save failed.')
        if (data?.draft?.status) setStatus(data.draft.status)
        if (data?.scan) setScanState((prev) => reduceScanState(prev, data.scan))
        setSaved(true)
      } catch (autosaveError) {
        setError(autosaveError.message || 'Working draft save failed.')
      }
    }, 1200)
    return () => clearTimeout(autosaveTimer.current)
  }, [
    allowDownloads,
    canEditHtml,
    content,
    courseId,
    description,
    draftId,
    initializing,
    legacyMarkdownMode,
    loading,
    title,
  ])

  /* ═══════════════════════════════════════════════════════════════════════
   * ACTION HANDLERS (delegated to uploadSheetActions.js)
   * ═══════════════════════════════════════════════════════════════════════ */

  const saveDraftNow = useSaveDraftNow({
    courseId,
    title,
    content,
    description,
    allowDownloads,
    draftId,
    legacyMarkdownMode,
    autosaveTimer,
    setError,
    setSaved,
    setDraftId,
    setStatus,
    setScanState,
    setHasUnsavedChanges,
  })

  const uploadAttachment = useUploadAttachment({ attachFile, setAttachUploading })

  const handleAttachmentSelect = makeHandleAttachmentSelect({
    setAttachErr,
    setAttachFile,
    setRemoveExistingAttachment,
    setHasUnsavedChanges,
  })

  const clearAttachFile = makeClearAttachFile({ setAttachFile, setAttachErr, attachmentInputRef })

  const discardDraft = makeDiscardDraft({
    draftId,
    setTitle,
    setDescription,
    setContent,
    setCourseId,
    setAllowDownloads,
    setContentFormat,
    setLegacyMarkdownMode,
    setStatus,
    setAttachFile,
    setAttachErr,
    setExistingAttachment,
    setRemoveExistingAttachment,
    setHasUnsavedChanges,
    setSaved,
    setError,
    setDraftId,
    setScanState,
    setDraftReloadKey,
    setDiscarding,
    setShowDiscardDialog,
    onAfterDiscard: hasRequestedDraft ? () => navigate('/sheets/upload', { replace: true }) : null,
  })

  const handleHtmlImport = makeHandleHtmlImport({
    courseId,
    draftId,
    title,
    description,
    allowDownloads,
    setError,
    setLoading,
    setDraftId,
    setScanState,
    setScanModalDismissed,
    setSaved,
    setHasUnsavedChanges,
    hydrateFromSheet,
  })

  const acknowledgeScanAndDismiss = makeAcknowledgeScanAndDismiss({
    activeSheetId,
    setScanModalDismissed,
    setShowScanModal,
    setScanAckChecked,
  })

  const openScanModal = useCallback(() => {
    setShowScanModal(true)
  }, [])

  const openHtmlPreview = useCallback(() => {
    if (!Number.isInteger(activeSheetId)) {
      setError('Save your draft first before opening preview.')
      return
    }
    navigate(`/sheets/preview/html/${activeSheetId}`)
  }, [activeSheetId, navigate])

  const handleSubmit = useHandleSubmit({
    activeSheetId,
    allowDownloads,
    attachFile,
    canSubmitHtml,
    content,
    courseId,
    description,
    draftId,
    isEditing,
    legacyMarkdownMode,
    navigate,
    removeExistingAttachment,
    sheetId,
    title,
    uploadAttachment,
    setError,
    setLoading,
    setHasUnsavedChanges,
    setVerificationRequired,
  })

  const dismissPostSubmitNotice = useCallback(() => {
    setPostSubmitNotice(null)
  }, [])

  const openMySheets = useCallback(() => {
    setPostSubmitNotice(null)
    navigate('/sheets?mine=1')
  }, [navigate])

  /* ═══════════════════════════════════════════════════════════════════════
   * RETURN
   * ═══════════════════════════════════════════════════════════════════════ */
  return {
    isEditing,
    sheetId,
    title,
    setTitle,
    courseId,
    setCourseId,
    description,
    setDescription,
    allowDownloads,
    setAllowDownloads,
    content,
    setContent,
    status,
    legacyMarkdownMode,
    isHtmlMode,
    canEditHtml,
    canSubmitHtml,
    courses,
    error,
    initializing,
    loading,
    saved,
    draftId,
    verificationRequired,
    scanState,
    showScanModal,
    setShowScanModal,
    scanAckChecked,
    setScanAckChecked,
    scanModalDismissed,
    setScanModalDismissed,
    postSubmitNotice,
    dismissPostSubmitNotice,
    openMySheets,
    tutorial,
    showTutorial,
    dismissTutorial,
    attachFile,
    attachErr,
    attachUploading,
    existingAttachment,
    removeExistingAttachment,
    setRemoveExistingAttachment,
    htmlImportInputRef,
    attachmentInputRef,
    discarding,
    showDiscardDialog,
    setShowDiscardDialog,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    showLeaveDialog,
    confirmLeave,
    cancelLeave,
    saveDraftNow,
    handleAttachmentSelect,
    clearAttachFile,
    discardDraft,
    handleHtmlImport,
    acknowledgeScanAndDismiss,
    openScanModal,
    openHtmlPreview,
    handleSubmit,
  }
}
