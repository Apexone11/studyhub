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
import { useRef, useState, useCallback, useEffect } from 'react'
import useVideoUpload, { UPLOAD_STATUS } from '../../lib/useVideoUpload'
import { useSession } from '../../lib/session-context'
import { API } from '../../config'

const ACCEPT = '.mp4,.webm,.mov,video/mp4,video/webm,video/quicktime'

// Tier-specific limits
const TIER_LIMITS = {
  free: { sizeMb: 500, durationMin: 30 },
  donor: { sizeMb: 1024, durationMin: 45 },
  pro_monthly: { sizeMb: 1536, durationMin: 60 },
  pro_yearly: { sizeMb: 1536, durationMin: 60 },
}

function getTierLabel(tier) {
  if (tier === 'pro_monthly' || tier === 'pro_yearly') return 'Pro'
  if (tier === 'donor') return 'Supporter'
  return 'Free'
}

export default function VideoUploader({
  onUploadComplete,
  onCancel,
  maxSize: maxSizeProp,
  compact = false,
}) {
  const { user } = useSession()
  const userTier = user?.plan && user.plan !== 'free' ? user.plan : user?.isDonor ? 'donor' : 'free'
  const limits = TIER_LIMITS[userTier] || TIER_LIMITS.free
  const maxSize = maxSizeProp || limits.sizeMb * 1024 * 1024
  const fileInputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [validationError, setValidationError] = useState('')
  const [videoDuration, setVideoDuration] = useState(null)

  const { upload, abort, reset, state } = useVideoUpload()

  // ── File selection with validation ──────────────────────────────────
  const handleFileSelect = useCallback(
    (selectedFile) => {
      if (!selectedFile) return
      setValidationError('')
      setVideoDuration(null)

      // Check file size
      if (selectedFile.size > maxSize) {
        const sizeMb = Math.round(selectedFile.size / (1024 * 1024))
        const limitMb = Math.round(maxSize / (1024 * 1024))
        setValidationError(
          `File is ${sizeMb} MB, which exceeds your ${getTierLabel(userTier)} limit of ${limitMb} MB. ` +
            (userTier === 'free'
              ? 'Upgrade to Pro or donate to increase your limit.'
              : userTier === 'donor'
                ? 'Upgrade to Pro for 1.5 GB uploads.'
                : ''),
        )
        return
      }

      // Create video preview URL and check duration
      if (preview) URL.revokeObjectURL(preview)
      const url = URL.createObjectURL(selectedFile)
      setPreview(url)
      setFile(selectedFile)

      // Check video duration via a temporary video element (separate URL to avoid revoking preview)
      const metadataUrl = URL.createObjectURL(selectedFile)
      const tempVideo = document.createElement('video')
      tempVideo.preload = 'metadata'
      tempVideo.onloadedmetadata = () => {
        const durationMin = tempVideo.duration / 60
        setVideoDuration(Math.round(durationMin * 10) / 10)
        URL.revokeObjectURL(metadataUrl)
        if (durationMin > limits.durationMin) {
          setValidationError(
            `Video is ${Math.round(durationMin)} minutes, which exceeds your ${getTierLabel(userTier)} limit of ${limits.durationMin} minutes. ` +
              (userTier === 'free'
                ? 'Upgrade to Pro or donate to increase your limit.'
                : userTier === 'donor'
                  ? 'Upgrade to Pro for 60-minute uploads.'
                  : ''),
          )
        }
      }
      tempVideo.src = metadataUrl

      // Default title from filename
      if (!title) {
        setTitle(selectedFile.name.replace(/\.[^.]+$/, ''))
      }
    },
    [preview, title, maxSize, limits.durationMin, userTier],
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

      {/* ── Validation error (shown when file rejected before selection) */}
      {!file && validationError && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 8,
            background: 'var(--sh-danger-bg)',
            border: '1px solid var(--sh-danger-border)',
            color: 'var(--sh-danger-text)',
            fontSize: 'var(--type-sm)',
            fontWeight: 600,
          }}
        >
          {validationError}
        </div>
      )}

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
            or click to browse -- MP4, WebM, MOV
          </p>
          <p style={{ color: 'var(--sh-muted)', fontSize: 'var(--type-xs)', marginTop: 6 }}>
            {getTierLabel(userTier)} plan: up to{' '}
            {limits.sizeMb >= 1024
              ? `${(limits.sizeMb / 1024).toFixed(1)} GB`
              : `${limits.sizeMb} MB`}
            , {limits.durationMin} min max
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

          {/* File info + tier limits */}
          <p style={{ color: 'var(--sh-muted)', fontSize: 'var(--type-xs)' }}>
            {file.name} -- {(file.size / (1024 * 1024)).toFixed(1)} MB
            {videoDuration != null && <span> -- {videoDuration} min</span>}
            <span>
              {' '}
              | {getTierLabel(userTier)} limit:{' '}
              {limits.sizeMb >= 1024
                ? `${(limits.sizeMb / 1024).toFixed(1)} GB`
                : `${limits.sizeMb} MB`}
              , {limits.durationMin} min
            </span>
          </p>

          {/* Validation error */}
          {validationError && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 8,
                background: 'var(--sh-danger-bg)',
                border: '1px solid var(--sh-danger-border)',
                color: 'var(--sh-danger-text)',
                fontSize: 'var(--type-sm)',
                fontWeight: 600,
              }}
            >
              {validationError}
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              style={{
                ...btnPrimary,
                opacity: validationError ? 0.5 : 1,
                cursor: validationError ? 'not-allowed' : 'pointer',
              }}
              onClick={handleUpload}
              disabled={!!validationError}
            >
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

      {/* ── Processing state with progress polling ─────────────────── */}
      {showProcessing && <VideoProcessingProgress videoId={state.videoId} />}

      {/* ── Error state ──────────────────────────────────────────── */}
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

// ── Processing Progress Poller ──────────────────────────────────────────

const STEP_LABELS = {
  downloading: 'Downloading from storage...',
  analyzing: 'Analyzing video metadata...',
  thumbnail: 'Generating thumbnail...',
  transcoding: 'Transcoding video...',
  'transcoding 360p': 'Transcoding 360p quality...',
  'transcoding 720p': 'Transcoding 720p quality...',
  'transcoding 1080p': 'Transcoding 1080p quality...',
  finalizing: 'Finalizing and saving...',
}

function VideoProcessingProgress({ videoId }) {
  const [step, setStep] = useState(null)
  const [pct, setPct] = useState(0)
  const [done, setDone] = useState(false)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [downloadable, setDownloadable] = useState(true)
  const [toggling, setToggling] = useState(false)

  useEffect(() => {
    if (!videoId) return
    let active = true

    const poll = setInterval(async () => {
      try {
        const res = await fetch(`${API}/api/video/${videoId}`, { credentials: 'include' })
        if (!res.ok || !active) return
        const data = await res.json()
        if (data.status === 'ready') {
          setPct(100)
          setStep('finalizing')
          setDone(true)
          setDownloadable(data.downloadable !== false)
          clearInterval(poll)
          // Fetch stream URL for preview
          try {
            const streamRes = await fetch(`${API}/api/video/${videoId}/stream`, {
              credentials: 'include',
            })
            if (streamRes.ok) {
              const streamData = await streamRes.json()
              if (active) setPreviewUrl(streamData.url)
            }
          } catch {
            /* silent */
          }
          return
        }
        if (data.status === 'failed') {
          setStep('failed')
          clearInterval(poll)
          return
        }
        if (data.status === 'blocked') {
          setStep('blocked')
          clearInterval(poll)
          return
        }
        if (data.processingStep) setStep(data.processingStep)
        if (data.processingProgress != null) setPct(data.processingProgress)
      } catch {
        // silent
      }
    }, 3000)

    return () => {
      active = false
      clearInterval(poll)
    }
  }, [videoId])

  const toggleDownloadable = async () => {
    setToggling(true)
    try {
      const res = await fetch(`${API}/api/video/${videoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ downloadable: !downloadable }),
      })
      if (res.ok) setDownloadable(!downloadable)
    } catch {
      /* silent */
    } finally {
      setToggling(false)
    }
  }

  const label = done
    ? 'Processing complete -- your video is ready'
    : STEP_LABELS[step] || 'Processing video...'

  return (
    <div style={{ padding: '20px 16px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <span
          style={{
            color: done ? 'var(--sh-success-text)' : 'var(--sh-text)',
            fontSize: 'var(--type-sm)',
            fontWeight: 600,
          }}
        >
          {label}
        </span>
        <span style={{ color: 'var(--sh-muted)', fontSize: 'var(--type-xs)', fontWeight: 700 }}>
          {pct}%
        </span>
      </div>
      <div
        style={{
          width: '100%',
          height: 8,
          background: 'var(--sh-soft)',
          borderRadius: 4,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            background: done ? 'var(--sh-success)' : 'var(--sh-brand)',
            borderRadius: 4,
            transition: 'width 0.5s ease',
            width: `${pct}%`,
          }}
        />
      </div>

      {step === 'failed' && (
        <p style={{ color: 'var(--sh-danger-text)', fontSize: 'var(--type-xs)', marginTop: 8 }}>
          Video processing failed. Please try uploading again.
        </p>
      )}

      {step === 'blocked' && (
        <div
          style={{
            marginTop: 12,
            padding: '12px 16px',
            background: 'var(--sh-warning-bg)',
            border: '1px solid var(--sh-warning-border)',
            borderRadius: 8,
          }}
        >
          <p
            style={{
              color: 'var(--sh-warning-text)',
              fontSize: 'var(--type-sm)',
              fontWeight: 600,
              margin: '0 0 8px',
            }}
          >
            This video appears to belong to another user. Upload has been blocked.
          </p>
          <p style={{ color: 'var(--sh-warning-text)', fontSize: 'var(--type-xs)', margin: 0 }}>
            If this is your content, you can submit an appeal from your video settings.
          </p>
        </div>
      )}

      {!done && step !== 'failed' && (
        <p style={{ color: 'var(--sh-muted)', fontSize: 'var(--type-xs)', marginTop: 8 }}>
          This may take a few minutes depending on video length.
        </p>
      )}

      {/* Preview player after processing completes */}
      {done && previewUrl && (
        <div style={{ marginTop: 12, borderRadius: 10, overflow: 'hidden', background: '#000' }}>
          <video
            src={previewUrl}
            controls
            playsInline
            preload="metadata"
            style={{ width: '100%', display: 'block', maxHeight: 300 }}
          />
        </div>
      )}

      {/* Download toggle for the creator */}
      {done && (
        <div
          style={{
            marginTop: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            background: 'var(--sh-soft)',
            borderRadius: 8,
            border: '1px solid var(--sh-border)',
          }}
        >
          <div>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--sh-text)' }}>
              Allow downloads
            </span>
            <span style={{ fontSize: 11, color: 'var(--sh-muted)', display: 'block' }}>
              {downloadable ? 'Viewers can download this video' : 'Downloads are disabled'}
            </span>
          </div>
          <button
            onClick={toggleDownloadable}
            disabled={toggling}
            style={{
              width: 44,
              height: 24,
              borderRadius: 12,
              border: 'none',
              cursor: toggling ? 'not-allowed' : 'pointer',
              background: downloadable ? 'var(--sh-success)' : 'var(--sh-border)',
              position: 'relative',
              transition: 'background 0.2s',
            }}
          >
            <span
              style={{
                display: 'block',
                width: 18,
                height: 18,
                borderRadius: 9,
                background: '#fff',
                position: 'absolute',
                top: 3,
                left: downloadable ? 23 : 3,
                transition: 'left 0.2s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }}
            />
          </button>
        </div>
      )}
    </div>
  )
}
