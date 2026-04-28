/**
 * GroupBackgroundPicker — owner/moderator tool for setting a custom
 * background image behind the group header.
 *
 * Phase 4 v1 ships with a "custom upload" path only. The schema + API
 * both support a curated /art/... gallery path — adding a gallery tab
 * later is purely a frontend change (add preset URLs to a state array).
 *
 * The upload reuses the /api/study-groups/:id/resources/upload endpoint
 * so it goes through the same weekly media quota as discussion and
 * resource attachments.
 *
 * Rendered via createPortal so it sits above the anime.js animated
 * header container without being clipped by a transform.
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconUpload, IconX, IconInfoCircle } from '../../components/Icons'
import { uploadGroupMedia, updateGroupBackground } from './groupMediaService'
import { showToast } from '../../lib/toast'

// Client-side guards. Server caps at 25 MB and a strict mime allowlist;
// these stricter limits give the user a fast, friendly rejection for
// banner-sized images without paying for the upload first.
const MAX_BG_BYTES = 10 * 1024 * 1024 // 10 MB
const ACCEPTED_MIME_PREFIX = 'image/'

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function GroupBackgroundPicker({
  open,
  groupId,
  currentBackgroundUrl,
  currentBackgroundCredit,
  onClose,
  onSaved,
}) {
  const [pendingUrl, setPendingUrl] = useState(currentBackgroundUrl || '')
  const [pendingCredit, setPendingCredit] = useState(currentBackgroundCredit || '')
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [confirmingClear, setConfirmingClear] = useState(false)
  const dropZoneRef = useRef(null)

  // Reset local state whenever the modal reopens with fresh props.
  useEffect(() => {
    if (!open) return
    setPendingUrl(currentBackgroundUrl || '')
    setPendingCredit(currentBackgroundCredit || '')
    setError('')
    setUploading(false)
    setUploadProgress(0)
    setDragActive(false)
    setConfirmingClear(false)
  }, [open, currentBackgroundUrl, currentBackgroundCredit])

  // Escape closes the modal (or the inline confirm if it's open).
  useEffect(() => {
    if (!open) return
    const handler = (event) => {
      if (event.key !== 'Escape') return
      if (confirmingClear) {
        setConfirmingClear(false)
        return
      }
      onClose?.()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose, confirmingClear])

  if (!open) return null

  const validateFile = (file) => {
    if (!file) return 'No file selected.'
    if (!file.type || !file.type.startsWith(ACCEPTED_MIME_PREFIX)) {
      return 'File must be an image (PNG, JPEG, WebP, or GIF).'
    }
    if (file.size > MAX_BG_BYTES) {
      return `Image is ${formatBytes(file.size)}. Max ${formatBytes(MAX_BG_BYTES)}.`
    }
    return null
  }

  const handleFile = async (file) => {
    if (!file) return
    const validationError = validateFile(file)
    if (validationError) {
      setError(validationError)
      return
    }

    setError('')
    setUploading(true)
    setUploadProgress(0)
    try {
      const result = await uploadGroupMedia(groupId, file, {
        onProgress: (fraction) => setUploadProgress(fraction),
      })
      if (!result?.url) {
        throw new Error('Upload returned no URL.')
      }
      setPendingUrl(result.url)
    } catch (err) {
      // Quota errors carry a structured snapshot — surface plan-aware copy.
      if (err?.status === 429 && err?.quota?.quota) {
        const plan = err.quota.plan || 'free'
        setError(
          `Weekly media quota reached on the ${plan} plan (${err.quota.used}/${err.quota.quota}). Try again after it resets.`,
        )
      } else {
        setError(err.message || 'Upload failed.')
      }
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async () => {
    setError('')
    setSaving(true)
    try {
      const updated = await updateGroupBackground(groupId, {
        backgroundUrl: pendingUrl || null,
        backgroundCredit: pendingCredit || null,
      })
      showToast('Group background updated.', 'success')
      onSaved?.(updated)
      onClose?.()
    } catch (err) {
      setError(err.message || 'Could not save background.')
    } finally {
      setSaving(false)
    }
  }

  const requestClear = () => {
    // Only confirm if the user already had a saved background — clearing
    // an unsaved pending preview is cheap to reverse.
    if (currentBackgroundUrl) {
      setConfirmingClear(true)
      return
    }
    setPendingUrl('')
    setPendingCredit('')
  }

  const confirmClear = () => {
    setPendingUrl('')
    setPendingCredit('')
    setConfirmingClear(false)
  }

  // Drag-and-drop wiring. We keep the visible drop target on the preview
  // panel so users can drop directly onto the spot the image will render.
  const handleDragEnter = (event) => {
    event.preventDefault()
    event.stopPropagation()
    if (uploading) return
    setDragActive(true)
  }
  const handleDragLeave = (event) => {
    event.preventDefault()
    event.stopPropagation()
    // Ignore drag-leave when the cursor is still inside a child element.
    if (dropZoneRef.current && dropZoneRef.current.contains(event.relatedTarget)) return
    setDragActive(false)
  }
  const handleDragOver = (event) => {
    event.preventDefault()
    event.stopPropagation()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  }
  const handleDrop = (event) => {
    event.preventDefault()
    event.stopPropagation()
    setDragActive(false)
    if (uploading) return
    const file = event.dataTransfer?.files?.[0]
    if (file) handleFile(file)
  }

  return createPortal(
    <div style={overlayStyle} onClick={onClose}>
      <div
        style={dialogStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bg-picker-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div style={headerStyle}>
          <h2 id="bg-picker-title" style={titleStyle}>
            Group background
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close background picker"
            style={iconButtonStyle}
          >
            <IconX size={16} />
          </button>
        </div>

        <div style={hintStyle}>
          <IconInfoCircle size={13} style={{ flexShrink: 0 }} aria-hidden="true" />
          <span>
            Upload a banner image to customize the group header. Uploads count toward your weekly
            media quota. Max {formatBytes(MAX_BG_BYTES)}, PNG / JPEG / WebP / GIF.
          </span>
        </div>

        {error ? (
          <div style={errorStyle} role="alert">
            {error}
          </div>
        ) : null}

        {/* Current/pending preview — also serves as the drop zone */}
        <div
          ref={dropZoneRef}
          style={dropZoneStyle(dragActive, Boolean(pendingUrl))}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          aria-label="Drop image here to upload"
        >
          {pendingUrl ? (
            <img
              src={pendingUrl}
              alt="Group background preview"
              style={{
                width: '100%',
                height: 160,
                objectFit: 'cover',
                display: 'block',
                borderRadius: 10,
              }}
              onError={() => setError('Could not load preview image.')}
            />
          ) : (
            <div style={emptyPreviewStyle}>
              <span>{dragActive ? 'Drop image to upload' : 'No background set'}</span>
            </div>
          )}
          {uploading ? (
            <div style={progressOverlayStyle}>
              <div style={progressBarTrackStyle}>
                <div style={progressBarFillStyle(uploadProgress)} />
              </div>
              <span style={progressLabelStyle}>Uploading… {Math.round(uploadProgress * 100)}%</span>
            </div>
          ) : null}
        </div>

        {/* Upload button */}
        <label style={uploadLabelStyle(uploading)}>
          <IconUpload size={14} aria-hidden="true" />
          <span>{uploading ? 'Uploading…' : pendingUrl ? 'Replace image' : 'Upload image'}</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0]
              handleFile(file)
              event.target.value = ''
            }}
            style={{ display: 'none' }}
            aria-label="Choose background image"
          />
        </label>

        {/* Optional credit line */}
        <div style={fieldStyle}>
          <label htmlFor="bg-credit" style={labelStyle}>
            Attribution (optional)
          </label>
          <input
            id="bg-credit"
            type="text"
            value={pendingCredit}
            onChange={(event) => setPendingCredit(event.target.value.slice(0, 200))}
            placeholder="e.g. Photo by Jane Doe · Unsplash"
            style={inputStyle}
            maxLength={200}
          />
          <span style={charCountStyle}>{pendingCredit.length}/200</span>
        </div>

        {confirmingClear ? (
          <div style={confirmBoxStyle} role="alertdialog" aria-labelledby="bg-clear-confirm-title">
            <p id="bg-clear-confirm-title" style={confirmTextStyle}>
              Remove the saved background? Members will see the default header until you upload a
              new image.
            </p>
            <div style={confirmActionsStyle}>
              <button
                type="button"
                onClick={() => setConfirmingClear(false)}
                style={secondaryBtnStyle}
              >
                Keep it
              </button>
              <button type="button" onClick={confirmClear} style={dangerBtnStyle}>
                Yes, clear background
              </button>
            </div>
          </div>
        ) : null}

        <div style={actionsStyle}>
          {pendingUrl ? (
            <button
              type="button"
              onClick={requestClear}
              style={secondaryBtnStyle}
              disabled={confirmingClear}
            >
              Clear
            </button>
          ) : null}
          <button type="button" onClick={onClose} style={secondaryBtnStyle}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || uploading}
            style={primaryBtnStyle(saving || uploading)}
          >
            {saving ? 'Saving…' : 'Save background'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/* ── Styles (token-only, dark-mode compatible) ──────────────────── */

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 42, 0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 10000,
  padding: 16,
}

const dialogStyle = {
  background: 'var(--sh-surface)',
  color: 'var(--sh-heading)',
  borderRadius: 14,
  border: '1px solid var(--sh-border)',
  padding: '20px 22px',
  maxWidth: 520,
  width: '100%',
  maxHeight: '90vh',
  overflowY: 'auto',
  boxShadow: '0 20px 50px rgba(15, 23, 42, 0.3)',
  display: 'grid',
  gap: 14,
}

const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
}

const titleStyle = {
  margin: 0,
  fontSize: 17,
  fontWeight: 800,
  color: 'var(--sh-heading)',
}

const iconButtonStyle = {
  width: 28,
  height: 28,
  border: 'none',
  background: 'transparent',
  color: 'var(--sh-muted)',
  cursor: 'pointer',
  borderRadius: 6,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const hintStyle = {
  display: 'flex',
  gap: 8,
  alignItems: 'flex-start',
  padding: '8px 12px',
  borderRadius: 8,
  background: 'var(--sh-info-bg)',
  border: '1px solid var(--sh-border)',
  color: 'var(--sh-muted)',
  fontSize: 12,
  lineHeight: 1.5,
}

const errorStyle = {
  padding: '8px 12px',
  borderRadius: 8,
  background: 'var(--sh-danger-bg)',
  color: 'var(--sh-danger-text)',
  border: '1px solid var(--sh-danger-border)',
  fontSize: 12,
  fontWeight: 600,
}

function dropZoneStyle(dragActive, hasImage) {
  return {
    position: 'relative',
    borderRadius: 10,
    border: dragActive
      ? '2px dashed var(--sh-brand)'
      : hasImage
        ? '1px solid var(--sh-border)'
        : '2px dashed var(--sh-border)',
    background: dragActive ? 'var(--sh-info-bg)' : 'var(--sh-soft)',
    overflow: 'hidden',
    transition: 'border-color 120ms, background 120ms',
  }
}

const emptyPreviewStyle = {
  height: 120,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--sh-muted)',
  fontSize: 12,
  fontStyle: 'italic',
  pointerEvents: 'none',
}

const progressOverlayStyle = {
  position: 'absolute',
  inset: 0,
  background: 'rgba(15, 23, 42, 0.55)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  pointerEvents: 'none',
}

const progressBarTrackStyle = {
  width: '70%',
  height: 6,
  borderRadius: 999,
  background: 'rgba(255, 255, 255, 0.25)',
  overflow: 'hidden',
}

function progressBarFillStyle(fraction) {
  const pct = Math.max(0, Math.min(1, Number(fraction) || 0)) * 100
  return {
    width: `${pct}%`,
    height: '100%',
    background: 'var(--sh-brand)',
    transition: 'width 120ms linear',
  }
}

const progressLabelStyle = {
  color: '#fff',
  fontSize: 12,
  fontWeight: 700,
}

function uploadLabelStyle(disabled) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 14px',
    borderRadius: 10,
    background: disabled ? 'var(--sh-border)' : 'var(--sh-brand)',
    color: disabled ? 'var(--sh-muted)' : 'var(--sh-btn-primary-text, #fff)',
    fontSize: 12,
    fontWeight: 700,
    cursor: disabled ? 'wait' : 'pointer',
    justifySelf: 'start',
  }
}

const fieldStyle = {
  display: 'grid',
  gap: 6,
}

const labelStyle = {
  fontSize: 11,
  fontWeight: 800,
  color: 'var(--sh-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.3px',
}

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid var(--sh-border)',
  background: 'var(--sh-surface)',
  color: 'var(--sh-heading)',
  fontSize: 13,
  fontFamily: 'inherit',
}

const charCountStyle = {
  fontSize: 11,
  color: 'var(--sh-muted)',
  textAlign: 'right',
}

const confirmBoxStyle = {
  padding: 12,
  borderRadius: 10,
  background: 'var(--sh-warning-bg)',
  border: '1px solid var(--sh-warning-border)',
  color: 'var(--sh-warning-text)',
  display: 'grid',
  gap: 10,
}

const confirmTextStyle = {
  margin: 0,
  fontSize: 12.5,
  lineHeight: 1.5,
}

const confirmActionsStyle = {
  display: 'flex',
  gap: 8,
  justifyContent: 'flex-end',
}

const actionsStyle = {
  display: 'flex',
  gap: 10,
  justifyContent: 'flex-end',
}

const secondaryBtnStyle = {
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px solid var(--sh-border)',
  background: 'var(--sh-surface)',
  color: 'var(--sh-heading)',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
}

const dangerBtnStyle = {
  padding: '8px 14px',
  borderRadius: 8,
  border: 'none',
  background: 'var(--sh-danger)',
  color: 'var(--sh-btn-primary-text, #fff)',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
}

function primaryBtnStyle(disabled) {
  return {
    padding: '8px 16px',
    borderRadius: 8,
    border: 'none',
    background: 'var(--sh-brand)',
    color: 'var(--sh-btn-primary-text, #fff)',
    fontSize: 12,
    fontWeight: 700,
    cursor: disabled ? 'wait' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  }
}
