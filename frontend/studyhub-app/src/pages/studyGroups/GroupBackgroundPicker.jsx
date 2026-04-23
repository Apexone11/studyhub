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
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconUpload, IconX, IconInfoCircle } from '../../components/Icons'
import { uploadGroupMedia, updateGroupBackground } from './groupMediaService'
import { showToast } from '../../lib/toast'

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

  // Reset local state whenever the modal reopens with fresh props.
  useEffect(() => {
    if (!open) return
    setPendingUrl(currentBackgroundUrl || '')
    setPendingCredit(currentBackgroundCredit || '')
    setError('')
    setUploading(false)
    setUploadProgress(0)
  }, [open, currentBackgroundUrl, currentBackgroundCredit])

  // Escape closes the modal.
  useEffect(() => {
    if (!open) return
    const handler = (event) => {
      if (event.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const handleFile = async (file) => {
    if (!file) return
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
      setError(err.message || 'Upload failed.')
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

  const handleClear = () => {
    setPendingUrl('')
    setPendingCredit('')
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
            media quota.
          </span>
        </div>

        {error ? <div style={errorStyle}>{error}</div> : null}

        {/* Current/pending preview */}
        <div style={previewStyle}>
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
            />
          ) : (
            <div style={emptyPreviewStyle}>
              <span>No background set</span>
            </div>
          )}
        </div>

        {/* Upload button */}
        <label style={uploadLabelStyle(uploading)}>
          <IconUpload size={14} aria-hidden="true" />
          <span>
            {uploading ? `Uploading… ${Math.round(uploadProgress * 100)}%` : 'Upload image'}
          </span>
          <input
            type="file"
            accept="image/*"
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
        </div>

        <div style={actionsStyle}>
          {pendingUrl ? (
            <button type="button" onClick={handleClear} style={secondaryBtnStyle}>
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

const previewStyle = {
  borderRadius: 10,
  border: '1px solid var(--sh-border)',
  background: 'var(--sh-soft)',
  overflow: 'hidden',
}

const emptyPreviewStyle = {
  height: 120,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--sh-muted)',
  fontSize: 12,
  fontStyle: 'italic',
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
