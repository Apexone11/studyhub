/* ═══════════════════════════════════════════════════════════════════════════
 * VideoUploader.jsx — Drag-and-drop video upload component
 *
 * Features:
 *   - Drag-and-drop or click-to-browse file selection
 *   - Client-side validation (type, size)
 *   - Chunked upload with progress bar
 *   - Video preview after selection
 *   - Title and description fields
 *   - Abort / retry controls
 *   - Processing status indicator
 *
 * Props:
 *   onUploadComplete(videoId) — Called when upload finishes and processing starts
 *   onCancel()               — Called when user cancels the uploader
 *   maxSize                  — Optional max file size in bytes (default 500 MB)
 *   compact                  — Boolean, show a smaller inline variant
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useRef, useState, useCallback } from 'react'
import useVideoUpload, { UPLOAD_STATUS } from '../../lib/useVideoUpload'

const MAX_SIZE_DEFAULT = 500 * 1024 * 1024
const ACCEPT = '.mp4,.webm,.mov,video/mp4,video/webm,video/quicktime'

export default function VideoUploader({
  onUploadComplete,
  onCancel,
  maxSize = MAX_SIZE_DEFAULT,
  compact = false,
}) {
  const fileInputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dragOver, setDragOver] = useState(false)

  const { upload, abort, reset, state } = useVideoUpload()

  // ── File selection ──────────────────────────────────────────────────
  const handleFileSelect = useCallback(
    (selectedFile) => {
      if (!selectedFile) return

      // Create video preview URL
      if (preview) URL.revokeObjectURL(preview)
      const url = URL.createObjectURL(selectedFile)
      setPreview(url)
      setFile(selectedFile)

      // Default title from filename
      if (!title) {
        setTitle(selectedFile.name.replace(/\.[^.]+$/, ''))
      }
    },
    [preview, title],
  )

  const handleInputChange = (e) => {
    const f = e.target.files?.[0]
    if (f) handleFileSelect(f)
  }

  // ── Drag and drop ──────────────────────────────────────────────────
  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) handleFileSelect(f)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    setDragOver(true)
  }
  const handleDragLeave = () => setDragOver(false)

  // ── Upload ─────────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!file) return
    const vid = await upload(file, { title, description })
    if (vid && onUploadComplete) {
      onUploadComplete(vid)
    }
  }

  // ── Remove selected file ───────────────────────────────────────────
  const handleRemoveFile = () => {
    if (preview) URL.revokeObjectURL(preview)
    setFile(null)
    setPreview(null)
    reset()
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── Cancel entire uploader ─────────────────────────────────────────
  const handleCancel = () => {
    if (state.isUploading) abort()
    handleRemoveFile()
    if (onCancel) onCancel()
  }

  // ── Retry after error ──────────────────────────────────────────────
  const handleRetry = () => {
    reset()
  }

  const isUploading = state.isUploading
  const showForm = file && state.isIdle
  const showProgress = isUploading || state.status === UPLOAD_STATUS.COMPLETING
  const showProcessing = state.isProcessing
  const showError = state.isError

  // ── Styles ─────────────────────────────────────────────────────────
  const containerStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: compact ? '12px' : '16px',
    fontFamily: 'var(--font)',
  }

  const dropZoneStyle = {
    border: `2px dashed ${dragOver ? 'var(--sh-brand)' : 'var(--sh-border)'}`,
    borderRadius: 'var(--radius-card)',
    padding: compact ? '24px 16px' : '40px 24px',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'border-color 0.15s ease, background 0.15s ease',
    background: dragOver ? 'var(--sh-brand-soft-bg)' : 'var(--sh-soft)',
  }

  const previewContainerStyle = {
    position: 'relative',
    borderRadius: 'var(--radius-card)',
    overflow: 'hidden',
    background: '#000',
    aspectRatio: '16 / 9',
    maxHeight: compact ? '180px' : '280px',
  }

  const previewVideoStyle = {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
  }

  const inputStyle = {
    width: '100%',
    padding: '10px 14px',
    border: '1px solid var(--sh-border)',
    borderRadius: 'var(--radius)',
    fontSize: 'var(--type-sm)',
    fontFamily: 'var(--font)',
    background: 'var(--sh-input-bg)',
    color: 'var(--sh-input-text)',
    outline: 'none',
    transition: 'border-color 0.15s ease',
  }

  const labelStyle = {
    display: 'block',
    fontSize: 'var(--type-xs)',
    fontWeight: 600,
    color: 'var(--sh-subtext)',
    marginBottom: '4px',
  }

  const btnPrimary = {
    padding: '10px 20px',
    background: 'var(--sh-btn-primary-bg)',
    color: 'var(--sh-btn-primary-text)',
    border: 'none',
    borderRadius: 'var(--radius)',
    fontWeight: 600,
    fontSize: 'var(--type-sm)',
    fontFamily: 'var(--font)',
    cursor: 'pointer',
    transition: 'opacity 0.15s ease',
  }

  const btnSecondary = {
    padding: '10px 20px',
    background: 'var(--sh-btn-secondary-bg)',
    color: 'var(--sh-btn-secondary-text)',
    border: '1px solid var(--sh-btn-secondary-border)',
    borderRadius: 'var(--radius)',
    fontWeight: 600,
    fontSize: 'var(--type-sm)',
    fontFamily: 'var(--font)',
    cursor: 'pointer',
    transition: 'opacity 0.15s ease',
  }

  const progressBarOuter = {
    width: '100%',
    height: '8px',
    background: 'var(--sh-soft)',
    borderRadius: '4px',
    overflow: 'hidden',
  }

  const progressBarInner = {
    height: '100%',
    background: 'var(--sh-brand)',
    borderRadius: '4px',
    transition: 'width 0.3s ease',
    width: `${state.progress}%`,
  }

  return (
    <div style={containerStyle}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        onChange={handleInputChange}
        style={{ display: 'none' }}
      />

      {/* ── Drop zone (no file selected) ───────────────────────────── */}
      {!file && !showProcessing && (
        <div
          style={dropZoneStyle}
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter') fileInputRef.current?.click()
          }}
        >
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--sh-muted)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ margin: '0 auto 12px' }}
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <p
            style={{
              color: 'var(--sh-text)',
              fontWeight: 600,
              fontSize: 'var(--type-base)',
              marginBottom: '6px',
            }}
          >
            Drag and drop a video here
          </p>
          <p style={{ color: 'var(--sh-muted)', fontSize: 'var(--type-sm)' }}>
            or click to browse -- MP4, WebM, MOV up to {Math.round(maxSize / (1024 * 1024))} MB
          </p>
        </div>
      )}

      {/* ── Preview + form (file selected, not yet uploading) ──────── */}
      {showForm && (
        <>
          <div style={previewContainerStyle}>
            <video src={preview} style={previewVideoStyle} muted playsInline />
            <button
              onClick={handleRemoveFile}
              style={{
                position: 'absolute',
                top: '8px',
                right: '8px',
                background: 'rgba(0,0,0,0.6)',
                border: 'none',
                color: '#fff',
                borderRadius: '50%',
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: '14px',
              }}
              aria-label="Remove video"
            >
              x
            </button>
          </div>

          {/* Title */}
          <div>
            <label style={labelStyle}>Title</label>
            <input
              style={inputStyle}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Give your video a title"
              maxLength={200}
            />
          </div>

          {/* Description */}
          {!compact && (
            <div>
              <label style={labelStyle}>Description (optional)</label>
              <textarea
                style={{ ...inputStyle, minHeight: '72px', resize: 'vertical' }}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add a description..."
                maxLength={2000}
              />
            </div>
          )}

          {/* File info */}
          <p style={{ color: 'var(--sh-muted)', fontSize: 'var(--type-xs)' }}>
            {file.name} -- {(file.size / (1024 * 1024)).toFixed(1)} MB
          </p>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button style={btnPrimary} onClick={handleUpload}>
              Upload Video
            </button>
            <button style={btnSecondary} onClick={handleCancel}>
              Cancel
            </button>
          </div>
        </>
      )}

      {/* ── Upload progress ────────────────────────────────────────── */}
      {showProgress && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--sh-text)', fontSize: 'var(--type-sm)', fontWeight: 600 }}>
              Uploading...
            </span>
            <span style={{ color: 'var(--sh-muted)', fontSize: 'var(--type-xs)' }}>
              {state.progress}%
            </span>
          </div>
          <div style={progressBarOuter}>
            <div style={progressBarInner} />
          </div>
          <button
            style={{
              ...btnSecondary,
              alignSelf: 'flex-start',
              padding: '6px 14px',
              fontSize: 'var(--type-xs)',
            }}
            onClick={abort}
          >
            Cancel Upload
          </button>
        </div>
      )}

      {/* ── Processing state ───────────────────────────────────────── */}
      {showProcessing && (
        <div style={{ textAlign: 'center', padding: '24px 16px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              margin: '0 auto 12px',
              border: '3px solid var(--sh-border)',
              borderTopColor: 'var(--sh-brand)',
              borderRadius: '50%',
              animation: 'shp-spin 0.8s linear infinite',
            }}
          />
          <p
            style={{
              color: 'var(--sh-text)',
              fontWeight: 600,
              fontSize: 'var(--type-sm)',
              marginBottom: '4px',
            }}
          >
            Processing video...
          </p>
          <p style={{ color: 'var(--sh-muted)', fontSize: 'var(--type-xs)' }}>
            Your video is being transcoded. This may take a few minutes.
          </p>
        </div>
      )}

      {/* ── Error state ────────────────────────────────────────────── */}
      {showError && (
        <div
          style={{
            padding: '14px 16px',
            background: 'var(--sh-danger-bg)',
            border: '1px solid var(--sh-danger-border)',
            borderRadius: 'var(--radius)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <p
            style={{ color: 'var(--sh-danger-text)', fontSize: 'var(--type-sm)', fontWeight: 500 }}
          >
            {state.error}
          </p>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              style={{ ...btnPrimary, padding: '6px 14px', fontSize: 'var(--type-xs)' }}
              onClick={handleRetry}
            >
              Try Again
            </button>
            <button
              style={{ ...btnSecondary, padding: '6px 14px', fontSize: 'var(--type-xs)' }}
              onClick={handleCancel}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
