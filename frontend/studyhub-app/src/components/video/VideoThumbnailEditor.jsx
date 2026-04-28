/* ═══════════════════════════════════════════════════════════════════════════
 * VideoThumbnailEditor.jsx — modal for editing a video's thumbnail.
 *
 * Two paths to a new thumbnail:
 *   1. Frame picker — three timestamps (10%, 50%, 90% of duration) plus
 *      a current-playhead "Use this frame" button. Sends frameTimestamp
 *      to PATCH /api/video/:id/thumbnail; backend re-runs ffmpeg.
 *   2. Custom upload — JPG/PNG file ≤ 2 MB, validated server-side by
 *      magic bytes. Sent as multipart to the same endpoint.
 *
 * Renders into document.body via createPortal so the modal isn't
 * trapped inside the lazy-loaded VideoUploader's animated container
 * (mirrors the modal pattern used elsewhere in StudyHub).
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { API } from '../../config'

const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024
const ALLOWED_THUMBNAIL_TYPES = new Set(['image/jpeg', 'image/png'])

export default function VideoThumbnailEditor({ video, streamUrl, onClose, onSaved }) {
  const videoRef = useRef(null)
  const fileInputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [previewSrc, setPreviewSrc] = useState(video?.thumbnailUrl || null)
  const [currentTime, setCurrentTime] = useState(0)

  const duration = Number(video?.duration) || 0
  const candidates = useMemo(() => {
    if (!duration) return []
    return [
      { label: 'Start', timestamp: Math.min(1, duration * 0.05) },
      { label: 'Middle', timestamp: duration * 0.5 },
      { label: 'End', timestamp: Math.max(0, duration - 1) },
    ]
  }, [duration])

  // Keep preview in sync with the parent — when the modal opens after
  // a previous edit, show whatever the parent currently believes the
  // thumbnail URL is.
  useEffect(() => {
    setPreviewSrc(video?.thumbnailUrl || null)
  }, [video?.thumbnailUrl])

  const handleScrubberTimeUpdate = () => {
    if (!videoRef.current) return
    setCurrentTime(videoRef.current.currentTime || 0)
  }

  const submitFrameTimestamp = async (timestamp) => {
    if (!Number.isFinite(timestamp) || timestamp < 0) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`${API}/api/video/${video.id}/thumbnail`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frameTimestamp: timestamp }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not update thumbnail.')
      setPreviewSrc(data.thumbnailUrl || previewSrc)
      onSaved?.(data)
    } catch (err) {
      setError(err.message || 'Could not update thumbnail.')
    } finally {
      setBusy(false)
    }
  }

  const submitFile = async (file) => {
    if (!file) return
    if (!ALLOWED_THUMBNAIL_TYPES.has(file.type)) {
      setError('Only JPG and PNG images are allowed.')
      return
    }
    if (file.size > MAX_THUMBNAIL_BYTES) {
      setError(`Image must be under ${MAX_THUMBNAIL_BYTES / (1024 * 1024)} MB.`)
      return
    }

    setBusy(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`${API}/api/video/${video.id}/thumbnail`, {
        method: 'PATCH',
        credentials: 'include',
        body: formData,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not update thumbnail.')
      setPreviewSrc(data.thumbnailUrl || previewSrc)
      onSaved?.(data)
    } catch (err) {
      setError(err.message || 'Could not update thumbnail.')
    } finally {
      setBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const overlayStyle = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.55)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  }

  const dialogStyle = {
    background: 'var(--sh-surface)',
    border: '1px solid var(--sh-border)',
    borderRadius: 'var(--radius-card)',
    padding: 20,
    width: 'min(640px, 100%)',
    maxHeight: 'calc(100vh - 32px)',
    overflowY: 'auto',
    boxShadow: '0 18px 40px var(--sh-shadow, rgba(15,23,42,0.18))',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  }

  const sectionLabel = {
    fontSize: 'var(--type-xs)',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: 'var(--sh-muted)',
  }

  const candidateButton = (active) => ({
    flex: 1,
    minWidth: 0,
    padding: '8px 10px',
    background: active ? 'var(--sh-brand-soft, var(--sh-info-bg))' : 'var(--sh-surface)',
    border: active ? '1px solid var(--sh-brand)' : '1px solid var(--sh-border)',
    borderRadius: 'var(--radius)',
    color: active ? 'var(--sh-brand)' : 'var(--sh-text)',
    fontSize: 'var(--type-sm)',
    fontWeight: 600,
    cursor: busy ? 'wait' : 'pointer',
    opacity: busy ? 0.6 : 1,
  })

  return createPortal(
    <div style={overlayStyle} onClick={onClose} role="presentation">
      <div
        style={dialogStyle}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Edit video thumbnail"
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 'var(--type-lg)', color: 'var(--sh-heading)' }}>
            Edit thumbnail
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close thumbnail editor"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--sh-muted)',
              fontSize: 18,
              cursor: busy ? 'wait' : 'pointer',
              padding: 4,
            }}
          >
            ×
          </button>
        </div>

        {previewSrc ? (
          <div
            style={{
              borderRadius: 'var(--radius)',
              overflow: 'hidden',
              border: '1px solid var(--sh-border)',
              background: 'var(--sh-soft)',
            }}
          >
            <img
              src={previewSrc}
              alt="Current thumbnail"
              style={{
                width: '100%',
                height: 'auto',
                display: 'block',
                aspectRatio: '16 / 9',
                objectFit: 'cover',
              }}
            />
          </div>
        ) : null}

        {streamUrl && duration > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={sectionLabel}>Scrub to a frame</span>
            <video
              ref={videoRef}
              src={streamUrl}
              controls
              playsInline
              preload="metadata"
              onTimeUpdate={handleScrubberTimeUpdate}
              style={{
                width: '100%',
                maxHeight: 280,
                borderRadius: 'var(--radius)',
                background: '#000',
              }}
            />
            <button
              type="button"
              onClick={() => submitFrameTimestamp(currentTime)}
              disabled={busy}
              style={{
                ...candidateButton(false),
                width: '100%',
              }}
            >
              {busy ? 'Saving…' : `Use frame at ${currentTime.toFixed(1)}s`}
            </button>
          </div>
        ) : null}

        {candidates.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={sectionLabel}>Quick picks</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {candidates.map((candidate) => (
                <button
                  key={candidate.label}
                  type="button"
                  onClick={() => submitFrameTimestamp(candidate.timestamp)}
                  disabled={busy}
                  style={candidateButton(false)}
                >
                  {candidate.label}
                  <span
                    style={{
                      display: 'block',
                      fontSize: 'var(--type-xs)',
                      color: 'var(--sh-muted)',
                      fontWeight: 500,
                    }}
                  >
                    {candidate.timestamp.toFixed(1)}s
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={sectionLabel}>Or upload a custom image</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png"
            onChange={(e) => submitFile(e.target.files?.[0])}
            disabled={busy}
            style={{ fontSize: 'var(--type-sm)' }}
          />
          <span style={{ fontSize: 'var(--type-xs)', color: 'var(--sh-muted)' }}>
            JPG or PNG, up to 2 MB. Image content is verified server-side.
          </span>
        </div>

        {error ? (
          <div
            style={{
              padding: '10px 12px',
              background: 'var(--sh-danger-bg)',
              border: '1px solid var(--sh-danger-border)',
              color: 'var(--sh-danger-text)',
              borderRadius: 'var(--radius)',
              fontSize: 'var(--type-sm)',
            }}
          >
            {error}
          </div>
        ) : null}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{
              padding: '8px 16px',
              background: 'var(--sh-surface)',
              border: '1px solid var(--sh-border)',
              color: 'var(--sh-text)',
              borderRadius: 'var(--radius)',
              fontWeight: 600,
              fontSize: 'var(--type-sm)',
              cursor: busy ? 'wait' : 'pointer',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
