/* ═══════════════════════════════════════════════════════════════════════════
 * uploadSheetActions.js — Action handlers (save, discard, import, submit,
 * attachment, scan acknowledgement) for the upload sheet hook.
 *
 * Each function is a factory that receives state/setters and returns a
 * callback, so the hook stays lean while preserving identical behavior.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useCallback } from 'react'
import { API } from '../../config'
import { showToast } from '../../lib/toast'
import { checkImageSafety, isImageFile } from '../../lib/imageSafety'
import { reduceScanState } from './uploadSheetWorkflow'
import { authHeaders, validateAttachment } from './uploadSheetConstants'

/* ── Save draft now ──────────────────────────────────────────────────── */
export function useSaveDraftNow({
  courseId, title, content, description, allowDownloads,
  draftId, legacyMarkdownMode, autosaveTimer,
  setError, setSaved, setDraftId, setStatus, setScanState, setHasUnsavedChanges,
}) {
  return useCallback(async () => {
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
  }, [allowDownloads, autosaveTimer, content, courseId, description, draftId, legacyMarkdownMode, setDraftId, setError, setHasUnsavedChanges, setSaved, setScanState, setStatus, title])
}

/* ── Attachment upload ───────────────────────────────────────────────── */
export function useUploadAttachment({ attachFile, setAttachUploading }) {
  return useCallback(async (sheetIdToUpload) => {
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
  }, [attachFile, setAttachUploading])
}

/* ── Attachment select ───────────────────────────────────────────────── */
export function makeHandleAttachmentSelect({
  setAttachErr, setAttachFile, setRemoveExistingAttachment, setHasUnsavedChanges,
}) {
  return async function handleAttachmentSelect(event) {
    const file = event.target.files?.[0]
    if (!file) return
    const validationError = validateAttachment(file)
    if (validationError) {
      setAttachErr(validationError)
      event.target.value = ''
      return
    }

    if (isImageFile(file)) {
      try {
        const safetyResult = await checkImageSafety(file)
        if (safetyResult.warnings.length > 0) {
          showToast(safetyResult.warnings[0], 'info')
        }
      } catch {
        // Safety check is best-effort
      }
    }

    setAttachErr('')
    setAttachFile(file)
    setRemoveExistingAttachment(false)
    setHasUnsavedChanges(true)
  }
}

/* ── Clear selected attachment ───────────────────────────────────────── */
export function makeClearAttachFile({ setAttachFile, setAttachErr, attachmentInputRef }) {
  return function clearAttachFile() {
    setAttachFile(null)
    setAttachErr('')
    if (attachmentInputRef.current) attachmentInputRef.current.value = ''
  }
}

/* ── Discard draft ───────────────────────────────────────────────────── */
export function makeDiscardDraft({
  draftId, setTitle, setDescription, setContent, setCourseId,
  setAllowDownloads, setContentFormat, setLegacyMarkdownMode, setStatus,
  setAttachFile, setAttachErr, setExistingAttachment, setRemoveExistingAttachment,
  setHasUnsavedChanges, setSaved, setError, setDraftId,
  setScanState, setDraftReloadKey, setDiscarding, setShowDiscardDialog,
}) {
  return async function discardDraft() {
    if (!Number.isInteger(draftId)) {
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

      setDraftReloadKey((prev) => prev + 1)
    } catch (discardError) {
      setError(discardError.message || 'Could not discard draft.')
    } finally {
      setDiscarding(false)
      setShowDiscardDialog(false)
    }
  }
}

/* ── HTML import ─────────────────────────────────────────────────────── */
export function makeHandleHtmlImport({
  courseId, draftId, title, description, allowDownloads,
  setError, setLoading, setDraftId, setScanState,
  setScanModalDismissed, setSaved, setHasUnsavedChanges, hydrateFromSheet,
}) {
  return async function handleHtmlImport(event) {
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
      showToast('Security scan started. We\'ll show details only if something is flagged.', 'info')
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
}

/* ── Scan acknowledgement ────────────────────────────────────────────── */
export function makeAcknowledgeScanAndDismiss({
  activeSheetId, setScanModalDismissed, setShowScanModal, setScanAckChecked,
}) {
  return async function acknowledgeScanAndDismiss() {
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
}

/* ── Submit / publish ────────────────────────────────────────────────── */
export function useHandleSubmit({
  activeSheetId, allowDownloads, attachFile, canSubmitHtml,
  content, courseId, description, draftId, isEditing,
  legacyMarkdownMode, navigate, removeExistingAttachment, sheetId, title,
  uploadAttachment,
  setError, setLoading, setHasUnsavedChanges,
}) {
  return useCallback(async () => {
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
        setHasUnsavedChanges(false)
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
        throw new Error(findings ? `${data.error || 'Could not submit sheet.'} ${findings}` : (data.error || 'Could not submit sheet.'))
      }

      if (attachFile) {
        await uploadAttachment(data.id)
      }

      setHasUnsavedChanges(false)
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
    setError,
    setHasUnsavedChanges,
    setLoading,
    sheetId,
    title,
    uploadAttachment,
  ])
}
