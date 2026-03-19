/* ═══════════════════════════════════════════════════════════════════════════
 * UploadSheetPage.jsx — Create and edit study sheets
 *
 * Supports two content modes:
 *   - HTML mode: WYSIWYG editing with security scan workflow (import HTML,
 *     scan for XSS/phishing, acknowledge findings, submit for review).
 *   - Legacy Markdown mode: plain-text editor with live preview.
 *
 * Unsaved-changes protection:
 *   - Browser `beforeunload` event: warns on tab/window close.
 *   - React Router `useBlocker`: intercepts in-app navigation with custom
 *     ConfirmDialog instead of browser default.
 *   - `hasUnsavedChanges` flag tracks mutations; reset on save.
 *
 * Attachment: Single file (PDF or image), max 10MB, validated client-side.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useBlocker, useNavigate, useParams } from 'react-router-dom'
import Navbar from '../../components/Navbar'
import SafeJoyride from '../../components/SafeJoyride'
import ConfirmDialog from '../../components/ConfirmDialog'
import { IconCheck, IconEye, IconUpload } from '../../components/Icons'
import { API } from '../../config'
import { pageShell } from '../../lib/ui'
import { useTutorial } from '../../lib/useTutorial'
import { UPLOAD_STEPS } from '../../lib/tutorialSteps'
import { usePageTitle } from '../../lib/usePageTitle'
import { showToast } from '../../lib/toast'
import { checkImageSafety, isImageFile } from '../../lib/imageSafety'
import {
  UPLOAD_TUTORIAL_KEY,
  canEditHtmlWorkingCopy,
  canSubmitHtmlReview,
  reduceScanState,
} from './uploadSheetWorkflow'

function useSafeBlocker(predicate) {
  try {
    return useBlocker(predicate)
  } catch {
    return { state: 'unblocked' }
  }
}

/* ── Shared constants ──────────────────────────────────────────────────── */
const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"

/* Allowed attachment types — validated on both client and server */
const ATTACH_ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp']
const ATTACH_ALLOWED_EXT = ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp']
const ATTACH_MAX_BYTES = 10 * 1024 * 1024 // 10 MB

function authHeaders() {
  return {
    'Content-Type': 'application/json',
  }
}

function validateAttachment(file) {
  if (!file) return ''
  const ext = `.${String(file.name).split('.').pop().toLowerCase()}`
  if (!ATTACH_ALLOWED_TYPES.includes(file.type) || !ATTACH_ALLOWED_EXT.includes(ext)) {
    return 'Attachment must be a PDF or image (JPEG, PNG, GIF, WebP).'
  }
  if (file.size > ATTACH_MAX_BYTES) return 'Attachment must be 10 MB or smaller.'
  return ''
}

function MiniPreview({ md }) {
  if (!md) return <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>Start typing to preview…</div>
  return (
    <div
      style={{
        borderRadius: 12,
        border: '1px solid #e2e8f0',
        background: '#f8fafc',
        padding: 14,
        color: '#1e293b',
        fontSize: 13,
        lineHeight: 1.8,
        whiteSpace: 'pre-wrap',
      }}
    >
      {md}
    </div>
  )
}

function statusColor(status) {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'passed') return '#16a34a'
  if (normalized === 'failed') return '#dc2626'
  if (normalized === 'running') return '#1d4ed8'
  return '#64748b'
}

export default function UploadSheetPage() {
  usePageTitle('Upload Sheet')
  const navigate = useNavigate()
  const { id: sheetId } = useParams()
  const isEditing = Boolean(sheetId)

  const [title, setTitle] = useState('')
  const [courseId, setCourseId] = useState('')
  const [description, setDescription] = useState('')
  const [allowDownloads, setAllowDownloads] = useState(true)
  const [content, setContent] = useState('')
  const [contentFormat, setContentFormat] = useState('html')
  const [status, setStatus] = useState(isEditing ? 'published' : 'draft')
  const [draftId, setDraftId] = useState(null)
  const [legacyMarkdownMode, setLegacyMarkdownMode] = useState(false)
  const tutorial = useTutorial('upload', UPLOAD_STEPS)

  const [courses, setCourses] = useState([])
  const [error, setError] = useState('')
  const [initializing, setInitializing] = useState(true)
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)

  const [scanState, setScanState] = useState({
    status: 'passed',
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

  const [showTutorial, setShowTutorial] = useState(false)

  const [attachFile, setAttachFile] = useState(null)
  const [attachErr, setAttachErr] = useState('')
  const [attachUploading, setAttachUploading] = useState(false)
  const [existingAttachment, setExistingAttachment] = useState(null)
  const [removeExistingAttachment, setRemoveExistingAttachment] = useState(false)

  /* ── Draft management ──────────────────────────────────────────────────
   * draftReloadKey increments to force the init effect to re-run after
   * discarding a draft, so the editor resets to a blank state.
   * ─────────────────────────────────────────────────────────────────── */
  const [draftReloadKey, setDraftReloadKey] = useState(0)
  const [showDiscardDialog, setShowDiscardDialog] = useState(false)
  const [discarding, setDiscarding] = useState(false)

  /* ── Unsaved-changes tracking ────────────────────────────────────────────
   * Tracks whether the user has modified any content since the last save.
   * Used by beforeunload (browser nav) and useBlocker (in-app nav) to warn
   * before losing work. Set to true on any content mutation, reset on save.
   * ─────────────────────────────────────────────────────────────────────── */
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [showLeaveDialog, setShowLeaveDialog] = useState(false)
  const pendingBlockerRef = useRef(null)

  const htmlImportInputRef = useRef(null)
  const attachmentInputRef = useRef(null)
  const autosaveTimer = useRef(null)

  const activeSheetId = isEditing ? Number.parseInt(sheetId, 10) : draftId
  const canEditHtml = canEditHtmlWorkingCopy()
  const canSubmitHtml = canSubmitHtmlReview({
    hasOriginalVersion: scanState.hasOriginalVersion,
    scanStatus: scanState.status,
    scanAcknowledged: Boolean(scanState.acknowledgedAt) || scanModalDismissed,
    title,
    courseId,
    description,
    html: content,
  })

  const isHtmlMode = !legacyMarkdownMode && contentFormat === 'html'

  const loadCourses = useCallback(async () => {
    try {
      const response = await fetch(`${API}/api/courses/schools`, { headers: authHeaders(), credentials: 'include' })
      const data = await response.json().catch(() => ([]))
      setCourses(
        (data || []).flatMap((school) =>
          (school.courses || []).map((course) => ({ ...course, schoolName: school.name })),
        ),
      )
    } catch {
      setCourses([])
    }
  }, [])

  const hydrateFromSheet = useCallback((sheet) => {
    setTitle(sheet.title || '')
    setCourseId(sheet.courseId ? String(sheet.courseId) : '')
    setDescription(sheet.description || '')
    setAllowDownloads(sheet.allowDownloads !== false)
    setContent(sheet.content || '')
    setContentFormat(sheet.contentFormat === 'html' ? 'html' : 'markdown')
    setStatus(sheet.status || 'draft')
    setExistingAttachment(sheet.hasAttachment ? { name: sheet.attachmentName || 'Current attachment' } : null)
    setRemoveExistingAttachment(false)

    const incoming = sheet.htmlWorkflow || {}
    setScanState((prev) => reduceScanState(prev, {
      status: incoming.scanStatus || 'queued',
      findings: incoming.scanFindings || [],
      updatedAt: incoming.scanUpdatedAt,
      acknowledgedAt: incoming.scanAcknowledgedAt,
      hasOriginalVersion: Boolean(incoming.hasOriginalVersion),
      hasWorkingVersion: Boolean(incoming.hasWorkingVersion),
      originalSourceName: incoming.originalSourceName || null,
    }))

    const isLegacy = sheet.contentFormat !== 'html'
    setLegacyMarkdownMode(Boolean(isLegacy))
  }, [])

  useEffect(() => {
    void loadCourses()
  }, [loadCourses])

  useEffect(() => {
    let cancelled = false
    setInitializing(true)
    setError('')

    async function loadData() {
      try {
        if (isEditing) {
          const response = await fetch(`${API}/api/sheets/${sheetId}`, { headers: authHeaders(), credentials: 'include' })
          const data = await response.json().catch(() => ({}))
          if (!response.ok) throw new Error(data.error || 'Could not load sheet.')
          if (cancelled) return
          setDraftId(data.id)
          hydrateFromSheet(data)
          return
        }

        const response = await fetch(`${API}/api/sheets/drafts/latest`, { headers: authHeaders(), credentials: 'include' })
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
          setScanState((prev) => reduceScanState(prev, {
            status: 'queued',
            findings: [],
            hasOriginalVersion: false,
            hasWorkingVersion: false,
            originalSourceName: null,
          }))
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
  }, [hydrateFromSheet, isEditing, sheetId, draftReloadKey])
  useEffect(() => {
    if (initializing || isEditing) return
    if (typeof window === 'undefined') return

    const hasSeenTutorial = window.localStorage.getItem(UPLOAD_TUTORIAL_KEY) === '1'
    if (!hasSeenTutorial) {
      setShowTutorial(true)
    }
  }, [initializing, isEditing])

  const dismissTutorial = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(UPLOAD_TUTORIAL_KEY, '1')
    }
    setShowTutorial(false)
  }

  /* ── Browser beforeunload: warns when closing tab/browser with unsaved work ── */
  useEffect(() => {
    if (!hasUnsavedChanges) return
    const handler = (e) => {
      e.preventDefault()
      // Modern browsers show their own generic message; returnValue is required by spec
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasUnsavedChanges])

  /* ── React Router blocker: intercepts in-app navigation with unsaved changes ── */
  const blocker = useSafeBlocker(
    ({ currentLocation, nextLocation }) =>
      hasUnsavedChanges && currentLocation.pathname !== nextLocation.pathname,
  )

  /* When the blocker fires, show our custom confirmation dialog */
  useEffect(() => {
    if (blocker.state === 'blocked') {
      pendingBlockerRef.current = blocker
      setShowLeaveDialog(true)
    }
  }, [blocker])

  /* User confirmed leaving — proceed with blocked navigation */
  const confirmLeave = useCallback(() => {
    setShowLeaveDialog(false)
    if (pendingBlockerRef.current?.proceed) {
      pendingBlockerRef.current.proceed()
    }
    pendingBlockerRef.current = null
  }, [])

  /* User cancelled leaving — stay on the page */
  const cancelLeave = useCallback(() => {
    setShowLeaveDialog(false)
    if (pendingBlockerRef.current?.reset) {
      pendingBlockerRef.current.reset()
    }
    pendingBlockerRef.current = null
  }, [])

  useEffect(() => {
    if (initializing || legacyMarkdownMode || !isHtmlMode || !Number.isInteger(activeSheetId)) return

    let cancelled = false

    async function pollScanStatus() {
      try {
        const response = await fetch(`${API}/api/sheets/drafts/${activeSheetId}/scan-status`, { headers: authHeaders(), credentials: 'include' })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) return
        if (cancelled) return

        setScanState((prev) => reduceScanState(prev, data))

        const normalizedStatus = String(data.status || '').toLowerCase()
        if (!scanModalDismissed && ['queued', 'running', 'failed'].includes(normalizedStatus)) {
          setShowScanModal(true)
        }
      } catch {
        // polling is best-effort
      }
    }

    void pollScanStatus()
    const interval = setInterval(pollScanStatus, 2500)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [activeSheetId, initializing, isHtmlMode, legacyMarkdownMode, scanModalDismissed])

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

    if (!Number.isInteger(draftId)) return
    if (!canEditHtml) return
    if (!courseId) return

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
        if (data?.scan) {
          setScanState((prev) => reduceScanState(prev, data.scan))
        }
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

  const saveDraftNow = useCallback(async () => {
    if (!courseId || (!title.trim() && !content.trim())) {
      setError('Add a title and select a course before saving.')
      return
    }
    clearTimeout(autosaveTimer.current)
    setSaved(false)
    try {
      if (legacyMarkdownMode) {
        const response = await fetch(`${API}/api/sheets/drafts/autosave`, {
          method: 'POST',
          headers: authHeaders(),
          credentials: 'include',
          body: JSON.stringify({ id: draftId, title, courseId: Number.parseInt(courseId, 10), content, contentFormat: 'markdown', description, allowDownloads }),
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error || 'Draft save failed.')
        if (data?.draft?.id) setDraftId(data.draft.id)
      } else if (Number.isInteger(draftId)) {
        const response = await fetch(`${API}/api/sheets/drafts/${draftId}/working-html`, {
          method: 'PATCH',
          headers: authHeaders(),
          credentials: 'include',
          body: JSON.stringify({ title, courseId: Number.parseInt(courseId, 10), description, allowDownloads, html: content }),
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error || 'Draft save failed.')
        if (data?.draft?.status) setStatus(data.draft.status)
        if (data?.scan) setScanState((prev) => reduceScanState(prev, data.scan))
      } else {
        const response = await fetch(`${API}/api/sheets/drafts/autosave`, {
          method: 'POST',
          headers: authHeaders(),
          credentials: 'include',
          body: JSON.stringify({ id: null, title, courseId: Number.parseInt(courseId, 10), content, contentFormat: 'html', description, allowDownloads }),
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error || 'Draft save failed.')
        if (data?.draft?.id) setDraftId(data.draft.id)
      }
      setSaved(true)
      setHasUnsavedChanges(false)
    } catch (err) {
      setError(err.message || 'Draft save failed.')
    }
  }, [allowDownloads, content, courseId, description, draftId, legacyMarkdownMode, title])

  async function handleAttachmentSelect(event) {
    const file = event.target.files?.[0]
    if (!file) return
    const validationError = validateAttachment(file)
    if (validationError) {
      setAttachErr(validationError)
      event.target.value = ''
      return
    }

    /* Pre-upload image safety screening (client-side heuristic) */
    if (isImageFile(file)) {
      try {
        const safetyResult = await checkImageSafety(file)
        if (safetyResult.warnings.length > 0) {
          showToast(safetyResult.warnings[0], 'info')
        }
      } catch {
        // Safety check is best-effort — never block attachment selection
      }
    }

    setAttachErr('')
    setAttachFile(file)
    setRemoveExistingAttachment(false)
    setHasUnsavedChanges(true)
  }

  /* ── Discard draft: deletes the current draft and resets the editor ──── */
  async function discardDraft() {
    if (!Number.isInteger(draftId)) {
      // No draft saved yet — just reset local state
      setTitle('')
      setDescription('')
      setContent('')
      setCourseId('')
      setAttachFile(null)
      setExistingAttachment(null)
      setRemoveExistingAttachment(false)
      setHasUnsavedChanges(false)
      setShowDiscardDialog(false)
      return
    }

    setDiscarding(true)
    try {
      const response = await fetch(`${API}/api/sheets/${draftId}`, {
        method: 'DELETE',
        headers: authHeaders(),
        credentials: 'include',
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Could not discard draft.')
      }

      // Reset all editor state
      setDraftId(null)
      setTitle('')
      setDescription('')
      setContent('')
      setCourseId('')
      setAllowDownloads(true)
      setContentFormat('html')
      setLegacyMarkdownMode(false)
      setStatus('draft')
      setAttachFile(null)
      setAttachErr('')
      setExistingAttachment(null)
      setRemoveExistingAttachment(false)
      setHasUnsavedChanges(false)
      setSaved(false)
      setError('')
      setScanState({
        status: 'queued',
        findings: [],
        updatedAt: null,
        acknowledgedAt: null,
        hasOriginalVersion: false,
        hasWorkingVersion: false,
        originalSourceName: null,
      })

      // Force re-init to pick up clean state
      setDraftReloadKey((prev) => prev + 1)
    } catch (discardError) {
      setError(discardError.message || 'Could not discard draft.')
    } finally {
      setDiscarding(false)
      setShowDiscardDialog(false)
    }
  }

  /* ── Clear selected (new) attachment file ──────────────────────────── */
  function clearAttachFile() {
    setAttachFile(null)
    setAttachErr('')
    if (attachmentInputRef.current) attachmentInputRef.current.value = ''
  }

  async function handleHtmlImport(event) {
    const file = event.target.files?.[0]
    if (!file) return

    const extension = `.${String(file.name).split('.').pop().toLowerCase()}`
    if (!['.html', '.htm'].includes(extension)) {
      setError('Only .html or .htm files are allowed for this workflow.')
      event.target.value = ''
      return
    }

    if (!courseId) {
      setError('Select a course before importing HTML.')
      event.target.value = ''
      return
    }

    try {
      setLoading(true)
      setError('')

      const html = await file.text()
      const response = await fetch(`${API}/api/sheets/drafts/import-html`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          id: draftId,
          title,
          courseId: Number.parseInt(courseId, 10),
          description,
          allowDownloads,
          html,
          sourceName: file.name,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Could not import HTML file.')
      }

      setDraftId(data.draft.id)
      hydrateFromSheet(data.draft)
      if (data.scan) {
        setScanState((prev) => reduceScanState(prev, data.scan))
      }
      setShowScanModal(true)
      setScanModalDismissed(false)
      setSaved(true)
      setHasUnsavedChanges(false)
    } catch (importError) {
      setError(importError.message || 'Could not import HTML file.')
    } finally {
      setLoading(false)
      event.target.value = ''
    }
  }

  async function acknowledgeScanAndDismiss() {
    if (!Number.isInteger(activeSheetId)) {
      setShowScanModal(false)
      return
    }

    try {
      await fetch(`${API}/api/sheets/drafts/${activeSheetId}/scan-status/acknowledge`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
      })
    } catch {
      // acknowledgement is best-effort
    }

    setScanModalDismissed(true)
    setShowScanModal(false)
    setScanAckChecked(false)
  }

  const openHtmlPreview = useCallback(() => {
    if (!Number.isInteger(activeSheetId)) {
      setError('Save your draft first before opening preview.')
      return
    }

    navigate(`/sheets/preview/html/${activeSheetId}`)
  }, [activeSheetId, navigate])

  const uploadAttachment = useCallback(async (sheetIdToUpload) => {
    if (!attachFile) return

    setAttachUploading(true)
    try {
      const formData = new FormData()
      formData.append('attachment', attachFile)

      const uploadResponse = await fetch(`${API}/api/upload/attachment/${sheetIdToUpload}`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      })
      const uploadData = await uploadResponse.json().catch(() => ({}))
      if (!uploadResponse.ok) {
        throw new Error(uploadData.error || 'Attachment upload failed.')
      }
    } finally {
      setAttachUploading(false)
    }
  }, [attachFile])
  const handleSubmit = useCallback(async () => {
    setError('')

    if (legacyMarkdownMode) {
      if (!title.trim()) return setError('Please enter a title.')
      if (!courseId) return setError('Please select a course.')
      if (!content.trim()) return setError('Content cannot be empty.')

      setLoading(true)
      try {
        const targetSheetId = isEditing ? Number.parseInt(sheetId, 10) : draftId
        const endpoint = Number.isInteger(targetSheetId)
          ? `${API}/api/sheets/${targetSheetId}`
          : `${API}/api/sheets`
        const method = Number.isInteger(targetSheetId) ? 'PATCH' : 'POST'

        const response = await fetch(endpoint, {
          method,
          headers: authHeaders(),
          credentials: 'include',
          body: JSON.stringify({
            title,
            description,
            courseId: Number.parseInt(courseId, 10),
            content,
            contentFormat: 'markdown',
            allowDownloads,
            removeAttachment: removeExistingAttachment && !attachFile,
          }),
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error || 'Failed to save sheet.')

        await uploadAttachment(data.id)
        setHasUnsavedChanges(false) // Clear before navigating so blocker doesn't fire
        navigate(`/sheets/${data.id}`)
      } catch (publishError) {
        setError(publishError.message || 'Failed to save sheet.')
      } finally {
        setLoading(false)
      }

      return
    }

    if (!Number.isInteger(activeSheetId)) {
      setError('Save your draft first before submitting.')
      return
    }
    if (!canSubmitHtml) {
      setError('Complete required fields and either pass the security scan or acknowledge the findings before submit.')
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`${API}/api/sheets/${activeSheetId}/submit-review`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        const findings = Array.isArray(data.findings)
          ? data.findings.map((entry) => entry?.message || entry).filter(Boolean).join(' | ')
          : ''
        throw new Error(findings ? `${data.error || 'Submit blocked.'} ${findings}` : (data.error || 'Submit blocked.'))
      }

      if (attachFile) {
        await uploadAttachment(data.id)
      }

      setHasUnsavedChanges(false) // Clear before navigating so blocker doesn't fire
      navigate(`/sheets/${data.id}`)
    } catch (submitError) {
      setError(submitError.message || 'Could not submit for review.')
    } finally {
      setLoading(false)
    }
  }, [
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
  ])

  const navActions = useMemo(() => (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {saved ? (
        <span style={{ fontSize: 11, color: '#16a34a', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <IconCheck size={12} /> Saved
        </span>
      ) : (
        <span style={{ fontSize: 11, color: '#64748b' }}>{legacyMarkdownMode ? 'Draft autosave…' : 'Working draft sync…'}</span>
      )}
      <button
        type="button"
        onClick={saveDraftNow}
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: '#059669',
          padding: '6px 12px',
          background: '#ecfdf5',
          border: '1px solid #a7f3d0',
          borderRadius: 8,
          cursor: 'pointer',
          fontFamily: FONT,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <IconCheck size={13} /> Save Draft
      </button>
      {isHtmlMode ? (
        <button
          type="button"
          onClick={openHtmlPreview}
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: '#b45309',
            padding: '6px 12px',
            background: '#fffbeb',
            border: '1px solid #fcd34d',
            borderRadius: 8,
            cursor: 'pointer',
            fontFamily: FONT,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <IconEye size={13} /> Preview
        </button>
      ) : null}
      <Link
        to="/sheets"
        style={{
          fontSize: 12,
          color: '#64748b',
          textDecoration: 'none',
          padding: '6px 10px',
          border: '1px solid #cbd5e1',
          borderRadius: 8,
        }}
      >
        Cancel
      </Link>
      <button
        type="button"
        onClick={handleSubmit}
        disabled={loading || attachUploading || (isHtmlMode && !canSubmitHtml)}
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: '#fff',
          padding: '6px 14px',
          background: (loading || attachUploading || (isHtmlMode && !canSubmitHtml)) ? '#93c5fd' : '#2563eb',
          border: 'none',
          borderRadius: 8,
          cursor: (loading || attachUploading || (isHtmlMode && !canSubmitHtml)) ? 'not-allowed' : 'pointer',
          fontFamily: FONT,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <IconUpload size={13} />
        {loading ? 'Saving…' : legacyMarkdownMode ? (isEditing ? 'Save Changes' : 'Publish Sheet') : 'Submit For Review'}
      </button>
    </div>
  ), [attachUploading, canSubmitHtml, handleSubmit, isEditing, isHtmlMode, legacyMarkdownMode, loading, openHtmlPreview, saved, saveDraftNow])

  if (initializing) {
    return (
      <div style={{ minHeight: '100vh', background: '#edf0f5', fontFamily: FONT }}>
        <Navbar crumbs={[{ label: 'Study Sheets', to: '/sheets' }, { label: isEditing ? 'Edit Sheet' : 'New Sheet', to: null }]} hideTabs hideSearch />
        <div style={{ ...pageShell('editor', 20, 60), color: '#64748b', fontSize: 14 }}>Loading editor…</div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#edf0f5', fontFamily: FONT }}>
      <Navbar crumbs={[{ label: 'Study Sheets', to: '/sheets' }, { label: isEditing ? 'Edit Sheet' : 'New Sheet', to: null }]} hideTabs actions={navActions} hideSearch />
      <div style={pageShell('editor', 20, 60)}>
        <div data-tutorial="upload-info" style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '14px 20px', marginBottom: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, alignItems: 'end' }}>
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: '#64748b', letterSpacing: '.06em', display: 'block', marginBottom: 5 }}>SHEET TITLE</label>
            <input
              value={title}
              onChange={(event) => { setTitle(event.target.value); setHasUnsavedChanges(true) }}
              placeholder='e.g. "CMSC131 Final Exam Cheatsheet"'
              style={{ width: '100%', padding: '8px 12px', border: `1.5px solid ${error && !title.trim() ? '#fca5a5' : '#e2e8f0'}`, borderRadius: 8, fontSize: 13, fontFamily: FONT, outline: 'none', color: '#0f172a', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: '#64748b', letterSpacing: '.06em', display: 'block', marginBottom: 5 }}>COURSE</label>
            <select
              value={courseId}
              onChange={(event) => { setCourseId(event.target.value); setHasUnsavedChanges(true) }}
              style={{ width: '100%', padding: '8px 12px', border: `1.5px solid ${error && !courseId ? '#fca5a5' : '#e2e8f0'}`, borderRadius: 8, fontSize: 13, fontFamily: FONT, outline: 'none', color: courseId ? '#0f172a' : '#94a3b8', boxSizing: 'border-box' }}
            >
              <option value="">Select a course…</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>{course.code} — {course.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: '#64748b', letterSpacing: '.06em', display: 'block', marginBottom: 5 }}>DOWNLOADS</label>
            <label style={{ padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, color: '#64748b', background: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={allowDownloads} onChange={(event) => { setAllowDownloads(event.target.checked); setHasUnsavedChanges(true) }} />
              Allow downloads
            </label>
          </div>
        </div>

        <div data-tutorial="upload-content" style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '14px 20px', marginBottom: 12 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: '#64748b', letterSpacing: '.06em', display: 'block', marginBottom: 5 }}>
            DESCRIPTION <span style={{ fontSize: 9, color: '#94a3b8', textTransform: 'none', letterSpacing: 0 }}>(required for HTML review)</span>
          </label>
          <textarea
            value={description}
            onChange={(event) => { setDescription(event.target.value.slice(0, 300)); setHasUnsavedChanges(true) }}
            rows={2}
            maxLength={300}
            placeholder="Brief summary of what this sheet covers…"
            style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: FONT, outline: 'none', color: '#0f172a', boxSizing: 'border-box', resize: 'none', lineHeight: 1.6 }}
          />
          <div style={{ fontSize: 10, color: '#94a3b8', textAlign: 'right', marginTop: 3 }}>{description.length}/300</div>
        </div>
        {isHtmlMode ? (
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '14px 20px', marginBottom: 12 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: '#64748b', letterSpacing: '.06em', display: 'block', marginBottom: 8 }}>
              HTML IMPORT <span style={{ fontSize: 9, color: '#94a3b8', textTransform: 'none', letterSpacing: 0 }}>(optional — or type directly below)</span>
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <input
                ref={htmlImportInputRef}
                type="file"
                accept=".html,.htm,text/html"
                style={{ display: 'none' }}
                onChange={handleHtmlImport}
              />
              <button
                type="button"
                onClick={() => htmlImportInputRef.current?.click()}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#f8fafc', border: '1.5px dashed #cbd5e1', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#64748b', cursor: 'pointer', fontFamily: FONT }}
              >
                <i className="fas fa-file-code" style={{ fontSize: 12 }}></i>
                Import HTML file
              </button>
              {scanState.originalSourceName ? (
                <span style={{ fontSize: 12, color: '#334155', fontWeight: 600 }}>{scanState.originalSourceName}</span>
              ) : null}
              <span style={{ fontSize: 12, fontWeight: 700, color: statusColor(scanState.status) }}>
                Scan: {scanState.status}
              </span>
            </div>
            {canEditHtml ? null : (
              <div style={{ marginTop: 8, fontSize: 12, color: '#b45309' }}>
                Import HTML first. Direct posting is disabled in strict beta workflow.
              </div>
            )}
          </div>
        ) : null}

        <div data-tutorial="upload-attachment" style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '14px 20px', marginBottom: 12 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: '#64748b', letterSpacing: '.06em', display: 'block', marginBottom: 8 }}>
            OPTIONAL ATTACHMENT <span style={{ fontSize: 9, color: '#94a3b8', textTransform: 'none', letterSpacing: 0 }}>(PDF, PNG, JPEG, GIF, WebP — max 10 MB)</span>
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <input ref={attachmentInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp" style={{ display: 'none' }} onChange={handleAttachmentSelect} />
            <button
              type="button"
              onClick={() => attachmentInputRef.current?.click()}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#f8fafc', border: '1.5px dashed #cbd5e1', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#64748b', cursor: 'pointer', fontFamily: FONT }}
            >
              <i className="fas fa-paperclip" style={{ fontSize: 12 }}></i>
              {attachFile || (existingAttachment && !removeExistingAttachment) ? 'Change file' : 'Attach file'}
            </button>
            {/* Show newly selected file with remove option */}
            {attachFile ? (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '4px 10px' }}>
                <span style={{ fontSize: 12, color: '#166534', fontWeight: 600 }}>{attachFile.name}</span>
                <button
                  type="button"
                  onClick={clearAttachFile}
                  style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: FONT, padding: '2px 4px' }}
                  title="Remove selected file"
                >
                  ✕
                </button>
              </div>
            ) : null}
            {/* Show existing (server-side) attachment with remove option */}
            {!attachFile && existingAttachment && !removeExistingAttachment ? (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '4px 10px' }}>
                <span style={{ fontSize: 12, color: '#1e40af', fontWeight: 600 }}>{existingAttachment.name}</span>
                <button
                  type="button"
                  onClick={() => { setRemoveExistingAttachment(true); setHasUnsavedChanges(true) }}
                  style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: FONT, padding: '2px 4px' }}
                  title="Remove attachment"
                >
                  ✕
                </button>
              </div>
            ) : null}
            {/* Show "removed" indicator */}
            {removeExistingAttachment && !attachFile ? (
              <span style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>Attachment will be removed on save</span>
            ) : null}
          </div>
          {attachErr ? <div style={{ marginTop: 6, fontSize: 12, color: '#dc2626' }}>{attachErr}</div> : null}
        </div>

        {/* ── Draft management banner ─────────────────────────────────────── */}
        {!isEditing && draftId && status === 'draft' ? (
          <div style={{
            background: 'linear-gradient(135deg, #fffbeb, #fef3c7)',
            border: '1px solid #fcd34d',
            borderRadius: 12,
            padding: '12px 16px',
            marginBottom: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>📝</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>Continuing your draft</div>
                <div style={{ fontSize: 11, color: '#a16207' }}>
                  {title.trim() ? `"${title.trim()}"` : 'Untitled draft'} — auto-saved
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowDiscardDialog(true)}
              disabled={discarding}
              style={{
                padding: '6px 14px',
                background: '#fff',
                border: '1px solid #fbbf24',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                color: '#92400e',
                cursor: 'pointer',
                fontFamily: FONT,
              }}
            >
              {discarding ? 'Discarding…' : 'Discard & Start New'}
            </button>
          </div>
        ) : null}

        {status && status !== 'draft' ? (
          <div style={{ background: status === 'rejected' ? '#fef2f2' : '#eff6ff', border: `1px solid ${status === 'rejected' ? '#fecaca' : '#bfdbfe'}`, borderRadius: 9, padding: '10px 14px', marginBottom: 10, fontSize: 13, color: status === 'rejected' ? '#b91c1c' : '#1d4ed8' }}>
            Status: <strong>{status}</strong>
          </div>
        ) : null}

        {error ? (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 9, padding: '10px 14px', marginBottom: 10, fontSize: 13, color: '#dc2626' }}>
            {error}
          </div>
        ) : null}

        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRight: '1px solid #e2e8f0' }}>
              <IconUpload size={13} style={{ color: '#3b82f6' }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: '#3b82f6' }}>{isHtmlMode ? 'HTML Working Editor' : 'Markdown Editor'}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px' }}>
              <IconEye size={13} style={{ color: '#64748b' }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Live Preview</span>
            </div>
          </div>

          <div className="upload-editor-split" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: 420 }}>
            <div style={{ borderRight: '1px solid #1e293b', background: '#0f172a' }}>
              <textarea
                value={content}
                onChange={(event) => { setContent(event.target.value); setHasUnsavedChanges(true) }}
                spellCheck={!isHtmlMode}
                disabled={isHtmlMode && !canEditHtml}
                placeholder={isHtmlMode && !canEditHtml ? 'Import HTML file to unlock editor...' : 'Start writing...'}
                style={{ width: '100%', height: '100%', minHeight: 420, background: 'transparent', border: 'none', outline: 'none', resize: 'none', padding: '16px 18px', fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 12.5, lineHeight: 1.9, color: '#e2e8f0', boxSizing: 'border-box', opacity: isHtmlMode && !canEditHtml ? 0.6 : 1 }}
              />
            </div>
            <div style={{ padding: '16px 20px', overflowY: 'auto', maxHeight: 600 }}>
              {isHtmlMode ? (
                <iframe
                  title="html-inline-preview"
                  sandbox="allow-forms allow-modals allow-pointer-lock allow-popups allow-scripts"
                  srcDoc={content}
                  style={{ width: '100%', minHeight: 520, border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff' }}
                />
              ) : (
                <MiniPreview md={content} />
              )}
            </div>
          </div>
        </div>
      </div>

      {showTutorial ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'grid', placeItems: 'center', zIndex: 80, padding: 20 }}>
          <div style={{ width: 'min(680px, 100%)', background: '#fff', borderRadius: 18, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ padding: '16px 18px', background: 'linear-gradient(135deg,#0f172a,#1d4ed8)', color: '#fff' }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>Welcome to HTML Upload Beta</div>
              <div style={{ marginTop: 4, fontSize: 12, opacity: 0.9 }}>Secure upload-first workflow with scan + sandbox preview.</div>
            </div>
            <div style={{ padding: 18, display: 'grid', gap: 10, fontSize: 13, color: '#334155', lineHeight: 1.7 }}>
              <div>1. Fill title, course, and description.</div>
              <div>2. Import an <strong>.html</strong> file to create original + working copies.</div>
              <div>3. Fix issues in editor while security scan runs.</div>
              <div>4. Use preview to test full-page behavior.</div>
              <div>5. Submit only after scan status shows <strong>passed</strong>.</div>
            </div>
            <div style={{ borderTop: '1px solid #e2e8f0', padding: 14, display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={dismissTutorial} style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
                Got it
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showScanModal ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'grid', placeItems: 'center', zIndex: 85, padding: 20 }}>
          <div style={{ width: 'min(720px, 100%)', background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>HTML Security Scan</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: statusColor(scanState.status) }}>{scanState.status}</div>
            </div>
            <div style={{ padding: 16, display: 'grid', gap: 10 }}>
              <div style={{ fontSize: 13, color: '#334155' }}>
                Scan checks policy rules + antivirus before review submission.
              </div>
              {scanState.findings?.length ? (
                <div style={{ border: '1px solid #fecaca', background: '#fff1f2', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#b91c1c', marginBottom: 6 }}>Findings</div>
                  <ul style={{ margin: 0, paddingLeft: 18, color: '#991b1b', fontSize: 12, lineHeight: 1.7 }}>
                    {scanState.findings.map((finding, index) => (
                      <li key={`${index}-${finding?.message || finding}`}>{finding?.message || finding}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {scanState.status === 'failed' ? (
                <div style={{ border: '1px solid #fde68a', background: '#fffbeb', borderRadius: 10, padding: 12, fontSize: 12, color: '#92400e', lineHeight: 1.6 }}>
                  You can still submit this sheet for review. It will be placed in <strong>Pending</strong> status and sent to an admin for approval. Other users will see it listed but the HTML preview will be disabled until an admin approves it.
                </div>
              ) : null}

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: '#475569' }}>
                <input type="checkbox" checked={scanAckChecked} onChange={(event) => setScanAckChecked(event.target.checked)} style={{ marginTop: 2 }} />
                I understand this sheet may contain flagged HTML. I acknowledge it will be sent to an admin for review and will remain in Pending status until approved.
              </label>
            </div>
            <div style={{ borderTop: '1px solid #e2e8f0', padding: 14, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <button
                type="button"
                onClick={() => setShowScanModal(false)}
                style={{ background: '#fff', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 12px', fontSize: 12, cursor: 'pointer', fontFamily: FONT }}
              >
                Keep open
              </button>
              <button
                type="button"
                disabled={!scanAckChecked}
                onClick={acknowledgeScanAndDismiss}
                style={{ background: scanAckChecked ? '#2563eb' : '#93c5fd', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 12px', fontSize: 12, fontWeight: 700, cursor: scanAckChecked ? 'pointer' : 'not-allowed', fontFamily: FONT }}
              >
                Acknowledge and dismiss
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Unsaved changes confirmation dialog ─────────────────────────────
       * Shown when the user tries to navigate away (in-app) with pending edits.
       * Browser navigation is handled by the beforeunload event above.
       * ────────────────────────────────────────────────────────────────── */}
      <ConfirmDialog
        open={showLeaveDialog}
        title="Discard unsaved changes?"
        message="You have unsaved changes on this sheet. If you leave now, your pending work will be lost. Would you like to stay and finish?"
        confirmLabel="Leave"
        cancelLabel="Stay"
        variant="danger"
        onConfirm={confirmLeave}
        onCancel={cancelLeave}
      />

      <SafeJoyride {...tutorial.joyrideProps} />

      <ConfirmDialog
        open={showDiscardDialog}
        title="Discard this draft?"
        message="This will permanently delete your current draft and start a fresh sheet. Any saved content, imported HTML, and attachments will be removed."
        confirmLabel={discarding ? 'Discarding…' : 'Discard Draft'}
        cancelLabel="Keep Draft"
        variant="danger"
        onConfirm={discardDraft}
        onCancel={() => setShowDiscardDialog(false)}
      />
    </div>
  )
}
