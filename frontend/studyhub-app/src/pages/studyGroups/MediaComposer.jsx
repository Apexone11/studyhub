/**
 * MediaComposer — shared file attachment control for group resources
 * and discussion posts.
 *
 * Responsibilities:
 *   - Drag-drop zone, file picker, paste handler (images from clipboard)
 *   - Per-file thumbnail + remove button + progress bar
 *   - Quota banner: "3/5 media this week" with reset-in time hint
 *   - Upload CTA disabled when out of quota; shows upgrade link to /pricing
 *   - Emits attachments[] up to the parent via onAttachmentsChange
 *
 * Design rules honored:
 *   - All colors via var(--sh-*) tokens (dark-mode compatible)
 *   - No emojis — icons sourced from the project Icons.jsx library
 *   - aria-labels on every interactive element
 *   - createPortal not needed here; MediaComposer lives inline in the
 *     parent modal which already uses createPortal.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { IconUpload, IconX, IconInfoCircle, IconCheck } from '../../components/Icons'
import { uploadGroupMedia } from './groupMediaService'
import useMediaQuota from './useMediaQuota'

const KB = 1024
const MB = 1024 * 1024

function formatBytes(bytes) {
  if (bytes == null) return ''
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`
  if (bytes >= KB) return `${Math.round(bytes / KB)} KB`
  return `${bytes} B`
}

function formatResetHint(resetsAt) {
  if (!resetsAt) return ''
  const ms = new Date(resetsAt).getTime() - Date.now()
  if (Number.isNaN(ms) || ms <= 0) return 'resets soon'
  const hours = Math.floor(ms / (1000 * 60 * 60))
  if (hours >= 24) return `resets in ${Math.floor(hours / 24)}d`
  if (hours >= 1) return `resets in ${hours}h`
  return 'resets in under an hour'
}

export default function MediaComposer({ groupId, maxFiles = 4, attachments, onAttachmentsChange }) {
  const { quota, refresh: refreshQuota, loading: quotaLoading } = useMediaQuota(groupId)
  const [dragging, setDragging] = useState(false)
  const [uploads, setUploads] = useState([]) // [{ id, name, progress, error }]
  const fileInputRef = useRef(null)

  const remaining = quota?.unlimited ? Infinity : (quota?.remaining ?? 0)
  const isOverQuota = !quotaLoading && quota && !quota.unlimited && remaining <= 0
  const atMaxFiles = attachments.length >= maxFiles

  const handleFiles = useCallback(
    async (files) => {
      const list = Array.from(files || [])
      if (list.length === 0) return

      // Respect the maxFiles cap across the existing attachment list
      const slotsLeft = Math.max(0, maxFiles - attachments.length)
      const accepted = list.slice(0, slotsLeft)
      if (accepted.length === 0) return

      for (const file of accepted) {
        const pendingId = `${Date.now()}-${file.name}`
        setUploads((prev) => [...prev, { id: pendingId, name: file.name, progress: 0, error: '' }])

        try {
          const result = await uploadGroupMedia(groupId, file, {
            onProgress: (p) => {
              setUploads((prev) =>
                prev.map((u) => (u.id === pendingId ? { ...u, progress: p } : u)),
              )
            },
          })
          setUploads((prev) => prev.filter((u) => u.id !== pendingId))
          onAttachmentsChange([...attachments, result])
          await refreshQuota()
        } catch (error) {
          const isQuotaError = error.status === 429
          setUploads((prev) =>
            prev.map((u) =>
              u.id === pendingId
                ? {
                    ...u,
                    progress: 1,
                    error: isQuotaError ? 'Quota reached.' : error.message || 'Upload failed.',
                  }
                : u,
            ),
          )
          if (isQuotaError) {
            await refreshQuota()
          }
        }
      }
    },
    [groupId, attachments, maxFiles, onAttachmentsChange, refreshQuota],
  )

  // Paste handler so users can ctrl+v an image from clipboard.
  useEffect(() => {
    const onPaste = (event) => {
      if (!event.clipboardData) return
      const items = Array.from(event.clipboardData.items || [])
      const files = items
        .filter((item) => item.kind === 'file')
        .map((item) => item.getAsFile())
        .filter(Boolean)
      if (files.length > 0) {
        event.preventDefault()
        handleFiles(files)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [handleFiles])

  const handleDrop = (event) => {
    event.preventDefault()
    setDragging(false)
    handleFiles(event.dataTransfer.files)
  }

  const removeAttachment = (index) => {
    const next = attachments.slice()
    next.splice(index, 1)
    onAttachmentsChange(next)
  }

  const dismissUpload = (id) => {
    setUploads((prev) => prev.filter((u) => u.id !== id))
  }

  return (
    <div style={wrapperStyle}>
      {/* Quota banner */}
      <div style={quotaBannerStyle(isOverQuota)}>
        <IconInfoCircle
          size={13}
          style={{ color: 'var(--sh-muted)', flexShrink: 0 }}
          aria-hidden="true"
        />
        {quotaLoading ? (
          <span>Loading media quota…</span>
        ) : quota?.unlimited ? (
          <span>Unlimited uploads (admin).</span>
        ) : quota ? (
          <span>
            <strong>
              {quota.used}/{quota.quota}
            </strong>{' '}
            media this week · {formatResetHint(quota.resetsAt)}
            {isOverQuota ? (
              <>
                {' · '}
                <Link to="/pricing" style={{ color: 'var(--sh-brand)', fontWeight: 700 }}>
                  Upgrade to Pro for 100/week
                </Link>
              </>
            ) : null}
          </span>
        ) : (
          <span>Media quota unavailable.</span>
        )}
      </div>

      {/* Drop zone + file picker */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Drop files here or click to pick from your computer"
        aria-disabled={isOverQuota || atMaxFiles}
        onClick={() => {
          if (isOverQuota || atMaxFiles) return
          fileInputRef.current?.click()
        }}
        onKeyDown={(event) => {
          if ((event.key === 'Enter' || event.key === ' ') && !isOverQuota && !atMaxFiles) {
            event.preventDefault()
            fileInputRef.current?.click()
          }
        }}
        onDragOver={(event) => {
          event.preventDefault()
          if (!isOverQuota && !atMaxFiles) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        style={dropZoneStyle(dragging, isOverQuota || atMaxFiles)}
      >
        <IconUpload
          size={20}
          style={{ color: 'var(--sh-brand)', marginBottom: 6 }}
          aria-hidden="true"
        />
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sh-heading)' }}>
          {atMaxFiles
            ? `Max ${maxFiles} attachments reached`
            : isOverQuota
              ? 'Weekly quota reached'
              : 'Drop files, paste an image, or click to browse'}
        </div>
        <div style={{ fontSize: 11, color: 'var(--sh-muted)', marginTop: 4 }}>
          Images, video, PDF, zip, markdown · up to 25 MB each
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={(event) => {
            handleFiles(event.target.files)
            event.target.value = ''
          }}
          aria-label="Choose files to upload"
        />
      </div>

      {/* In-flight uploads */}
      {uploads.length > 0 ? (
        <div style={{ display: 'grid', gap: 6 }}>
          {uploads.map((item) => (
            <div key={item.id} style={uploadRowStyle}>
              <span style={{ flex: 1, fontSize: 12, color: 'var(--sh-text)' }}>{item.name}</span>
              {item.error ? (
                <span style={{ fontSize: 11, color: 'var(--sh-danger)', fontWeight: 700 }}>
                  {item.error}
                </span>
              ) : (
                <div style={progressTrackStyle}>
                  <div style={progressFillStyle(item.progress)} />
                </div>
              )}
              <button
                type="button"
                onClick={() => dismissUpload(item.id)}
                style={iconButtonStyle}
                aria-label={`Dismiss upload ${item.name}`}
              >
                <IconX size={12} />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {/* Committed attachments */}
      {attachments.length > 0 ? (
        <div style={{ display: 'grid', gap: 6 }}>
          {attachments.map((attachment, index) => (
            <div key={`${attachment.url}-${index}`} style={attachmentRowStyle}>
              <IconCheck size={13} style={{ color: 'var(--sh-success)' }} aria-hidden="true" />
              <span style={{ flex: 1, fontSize: 12, color: 'var(--sh-heading)' }}>
                {attachment.originalName || attachment.url.split('/').pop()}
              </span>
              <span style={{ fontSize: 11, color: 'var(--sh-muted)' }}>
                {formatBytes(attachment.bytes)}
              </span>
              <button
                type="button"
                onClick={() => removeAttachment(index)}
                style={iconButtonStyle}
                aria-label={`Remove attachment ${attachment.originalName || attachment.url}`}
              >
                <IconX size={12} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/* ── Styles (token-only, dark-mode compatible) ──────────────────── */

const wrapperStyle = {
  display: 'grid',
  gap: 10,
  padding: 12,
  borderRadius: 12,
  background: 'var(--sh-soft)',
  border: '1px solid var(--sh-border)',
}

function quotaBannerStyle(isOverQuota) {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 10px',
    borderRadius: 8,
    background: isOverQuota ? 'var(--sh-warning-bg)' : 'var(--sh-surface)',
    border: `1px solid ${isOverQuota ? 'var(--sh-warning-border)' : 'var(--sh-border)'}`,
    fontSize: 12,
    color: isOverQuota ? 'var(--sh-warning-text)' : 'var(--sh-muted)',
  }
}

function dropZoneStyle(dragging, disabled) {
  return {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px 16px',
    borderRadius: 10,
    border: `2px dashed ${dragging ? 'var(--sh-brand)' : 'var(--sh-border)'}`,
    background: dragging ? 'var(--sh-info-bg)' : 'var(--sh-surface)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
    textAlign: 'center',
    transition: 'background 0.15s, border-color 0.15s',
  }
}

const uploadRowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 10px',
  borderRadius: 8,
  background: 'var(--sh-surface)',
  border: '1px solid var(--sh-border)',
}

const progressTrackStyle = {
  flex: 1,
  height: 4,
  borderRadius: 2,
  background: 'var(--sh-border)',
  overflow: 'hidden',
}

function progressFillStyle(fraction) {
  return {
    width: `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`,
    height: '100%',
    background: 'var(--sh-brand)',
    transition: 'width 0.15s ease',
  }
}

const attachmentRowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 10px',
  borderRadius: 8,
  background: 'var(--sh-surface)',
  border: '1px solid var(--sh-border)',
}

const iconButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 22,
  height: 22,
  border: 'none',
  background: 'transparent',
  color: 'var(--sh-muted)',
  cursor: 'pointer',
  borderRadius: 6,
}
