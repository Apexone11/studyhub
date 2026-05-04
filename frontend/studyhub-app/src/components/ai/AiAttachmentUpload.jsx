/* ═══════════════════════════════════════════════════════════════════════════
 * AiAttachmentUpload.jsx — Multi-format attachment UI for Hub AI v2.
 *
 * Three exports:
 *   - <AttachmentUploadButton onPick onAtMax /> — paperclip button that opens
 *     the native file picker. Stateless; the parent owns the attachment list
 *     (see `useAiAttachments`).
 *   - <AttachmentChipStrip attachments onRemove /> — horizontal chip list.
 *   - <AttachmentDropZone onFiles>{children}</AttachmentDropZone> — drag-drop
 *     overlay using the dragenter/dragleave counter pattern (L4-MED-4).
 *
 * Upload progress (via XHR) lives in `useAiAttachments` so dropped files
 * and picked files share one pipeline.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useRef, useState } from 'react'
import { IconX } from '../Icons'

const ACCEPT = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'application/json',
  'text/x-python',
  'text/javascript',
  'application/javascript',
  'text/x-java',
  'text/x-c',
  'text/x-c++',
  'text/x-go',
  'text/x-rust',
  'image/png',
  'image/jpeg',
  'image/webp',
]

/**
 * Paperclip button. Click → opens native file picker. Selected files are
 * forwarded to `onPick(files)` (an array of File objects). The parent
 * uploader owns state and progress.
 */
export function AttachmentUploadButton({ onPick, disabled, atMax, max = 5 }) {
  const inputRef = useRef(null)

  const handlePick = (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (files.length > 0 && typeof onPick === 'function') onPick(files)
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT.join(',')}
        onChange={handlePick}
        style={{ display: 'none' }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || atMax}
        aria-label={atMax ? `Maximum ${max} files reached` : 'Attach file'}
        title={atMax ? `Maximum ${max} files` : 'Attach a file'}
        style={{
          background: 'none',
          border: 'none',
          cursor: disabled || atMax ? 'not-allowed' : 'pointer',
          padding: 6,
          width: 44,
          height: 44,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--sh-subtext)',
          opacity: disabled || atMax ? 0.4 : 1,
          borderRadius: 8,
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
        </svg>
      </button>
    </>
  )
}

/**
 * Horizontal chip strip. Each chip shows file type, name, page count
 * (if known), upload progress bar, and a remove button.
 */
export function AttachmentChipStrip({ attachments, onRemove }) {
  if (!attachments || attachments.length === 0) return null
  return (
    <div
      role="list"
      aria-label="Attached files"
      style={{
        display: 'flex',
        gap: 8,
        padding: '4px 0 8px',
        flexWrap: 'wrap',
      }}
    >
      {attachments.map((att) => (
        <AttachmentChip key={att.localId} att={att} onRemove={() => onRemove(att.localId)} />
      ))}
    </div>
  )
}

function AttachmentChip({ att, onRemove }) {
  const isImage = att.mimeType?.startsWith('image/')
  const isError = att.status === 'error'
  const isLoading = att.status === 'uploading'

  return (
    <div
      role="listitem"
      style={{
        position: 'relative',
        width: 76,
        height: 76,
        borderRadius: 8,
        border: `1px solid ${isError ? 'var(--sh-danger-border)' : 'var(--sh-border)'}`,
        background: isError ? 'var(--sh-danger-bg)' : 'var(--sh-brand-soft)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 6,
        overflow: 'hidden',
        opacity: isLoading ? 0.85 : 1,
      }}
    >
      {isImage && att.file ? (
        <ImageThumb file={att.file} alt={att.name} />
      ) : (
        <>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: 'var(--sh-pill-text)',
              letterSpacing: '0.04em',
              marginBottom: 4,
            }}
          >
            {att.ext || 'FILE'}
          </div>
          <div
            style={{
              fontSize: 10,
              color: 'var(--sh-subtext)',
              maxWidth: 60,
              textAlign: 'center',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={att.name}
          >
            {att.name}
          </div>
          {att.pageCount ? (
            <div style={{ fontSize: 9, color: 'var(--sh-subtext)', marginTop: 2 }}>
              {att.pageCount}p
            </div>
          ) : null}
        </>
      )}

      {isLoading ? (
        <div
          aria-label={`Uploading ${Math.round(att.progress)}%`}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: 3,
            background: 'rgba(255, 255, 255, 0.5)',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${att.progress}%`,
              background: 'var(--sh-brand)',
              transition: 'width 120ms linear',
            }}
          />
        </div>
      ) : null}

      {isError ? (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            padding: '2px 4px',
            fontSize: 9,
            color: 'var(--sh-danger-text)',
            background: 'var(--sh-danger-bg)',
            textAlign: 'center',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={att.error}
        >
          {att.error || 'Failed'}
        </div>
      ) : null}

      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${att.name}`}
        style={{
          position: 'absolute',
          top: -6,
          right: -6,
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: 'var(--sh-surface)',
          border: '1px solid var(--sh-border)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
        }}
      >
        <IconX size={10} style={{ color: 'var(--sh-subtext)' }} />
      </button>
    </div>
  )
}

function ImageThumb({ file, alt }) {
  // Lazy-create the object URL so unmount safely revokes it.
  const [url] = useState(() => URL.createObjectURL(file))
  return (
    <img
      src={url}
      alt={alt}
      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      onLoad={() => URL.revokeObjectURL(url)}
    />
  )
}

/**
 * Drop zone with counter-based dragenter/dragleave per L4-MED-4 so child
 * element transitions don't flicker the overlay off.
 */
export function AttachmentDropZone({ onFiles, children }) {
  const [count, setCount] = useState(0)
  const visible = count > 0

  const handleEnter = (e) => {
    if (e.dataTransfer?.types?.includes('Files')) {
      e.preventDefault()
      setCount((c) => c + 1)
    }
  }
  const handleLeave = () => {
    setCount((c) => Math.max(0, c - 1))
  }
  const handleOver = (e) => {
    if (e.dataTransfer?.types?.includes('Files')) {
      e.preventDefault()
    }
  }
  const handleDrop = (e) => {
    e.preventDefault()
    setCount(0)
    const files = Array.from(e.dataTransfer?.files || [])
    if (files.length > 0 && typeof onFiles === 'function') onFiles(files)
  }

  return (
    <div
      onDragEnter={handleEnter}
      onDragLeave={handleLeave}
      onDragOver={handleOver}
      onDrop={handleDrop}
      style={{ position: 'relative' }}
    >
      {children}
      {visible ? (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--sh-brand-soft)',
            opacity: 0.92,
            border: '2px dashed var(--sh-brand)',
            borderRadius: 14,
            zIndex: 5,
            color: 'var(--sh-pill-text)',
            fontSize: 13,
            fontWeight: 600,
            pointerEvents: 'none',
          }}
        >
          Drop to attach (PDF, DOCX, images, text)
        </div>
      ) : null}
    </div>
  )
}
