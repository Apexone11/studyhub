/* ════════════════════════════════════════════════════════════════════════
 * AttachmentPreview.jsx — Reusable preview window for group / discussion
 * attachments. Click a thumbnail or attachment row → modal opens with the
 * file rendered inline (image, PDF, video, audio) plus a fullscreen
 * toggle and a download fallback.
 *
 * Sandbox model:
 *   - Image:   <img>; no scripts, no extra rules needed.
 *   - PDF:     <iframe sandbox="allow-same-origin" referrerPolicy="no-referrer">
 *              Same pattern as the admin ContentPreviewModal. Withholding
 *              allow-scripts means even a malicious PDF that smuggles HTML
 *              cannot run JS in the parent origin.
 *   - Video:   <video controls> (no sandbox needed; native).
 *   - Audio:   <audio controls>.
 *   - Other:   shows file metadata + a "Download" CTA.
 *
 * Fullscreen: uses the standard Fullscreen API on the modal container.
 * ESC, click-outside, and the close button all dismiss.
 *
 * Accessibility: focus is trapped on the close button when the modal
 * opens; Escape closes; backdrop click closes.
 * ════════════════════════════════════════════════════════════════════════ */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const KIND_LABELS = {
  image: 'Image',
  pdf: 'PDF',
  video: 'Video',
  audio: 'Audio',
  doc: 'Document',
  other: 'File',
}

function inferKind(name = '', urlOrType = '') {
  const haystack = `${name} ${urlOrType}`.toLowerCase()
  if (/\.(png|jpe?g|gif|webp|svg|bmp)(\?|$)/.test(haystack) || haystack.startsWith('image/')) {
    return 'image'
  }
  if (/\.pdf(\?|$)/.test(haystack) || haystack.includes('application/pdf')) return 'pdf'
  if (/\.(mp4|webm|mov|m4v|ogv)(\?|$)/.test(haystack) || haystack.startsWith('video/')) {
    return 'video'
  }
  if (/\.(mp3|wav|m4a|ogg|flac)(\?|$)/.test(haystack) || haystack.startsWith('audio/')) {
    return 'audio'
  }
  if (/\.(docx?|odt|rtf|txt|md|pptx?|xlsx?|csv)(\?|$)/.test(haystack)) return 'doc'
  return 'other'
}

export function AttachmentPreviewModal({ attachment, onClose }) {
  const containerRef = useRef(null)
  const closeButtonRef = useRef(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const kind = attachment.kind || inferKind(attachment.name, attachment.url || attachment.type)

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  useEffect(() => {
    closeButtonRef.current?.focus()
  }, [])

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else if (containerRef.current?.requestFullscreen) {
        await containerRef.current.requestFullscreen()
      }
    } catch {
      /* browser refused fullscreen — leave inline */
    }
  }

  function handleBackdropClick(event) {
    if (event.target === event.currentTarget) onClose()
  }

  return createPortal(
    <div
      role="presentation"
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        zIndex: 10000,
      }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={attachment.name || 'Attachment preview'}
        style={{
          background: 'var(--sh-surface)',
          borderRadius: isFullscreen ? 0 : 14,
          border: isFullscreen ? 'none' : '1px solid var(--sh-border)',
          width: 'min(960px, 100%)',
          maxHeight: isFullscreen ? '100%' : '90vh',
          height: isFullscreen ? '100%' : 'auto',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid var(--sh-border)',
            background: 'var(--sh-soft)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--sh-muted)',
              }}
            >
              {KIND_LABELS[kind] || 'File'}
            </span>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--sh-heading)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={attachment.name}
            >
              {attachment.name || 'Untitled'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={toggleFullscreen}
              style={iconButtonStyle}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
            >
              {isFullscreen ? '⤢' : '⛶'}
            </button>
            {attachment.url ? (
              <a
                href={attachment.url}
                download={attachment.name}
                rel="noopener noreferrer"
                style={iconButtonStyle}
                aria-label="Download"
                title="Download"
              >
                ↓
              </a>
            ) : null}
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              style={iconButtonStyle}
              aria-label="Close"
              title="Close (Esc)"
            >
              ✕
            </button>
          </div>
        </header>

        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--sh-soft)',
            overflow: 'auto',
            padding: kind === 'pdf' || kind === 'video' || kind === 'audio' ? 0 : 16,
          }}
        >
          {kind === 'image' && attachment.url ? (
            <img
              src={attachment.url}
              alt={attachment.name || ''}
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
            />
          ) : kind === 'pdf' && attachment.url ? (
            <iframe
              src={attachment.url}
              title={attachment.name || 'PDF preview'}
              sandbox="allow-same-origin"
              referrerPolicy="no-referrer"
              style={{
                width: '100%',
                height: isFullscreen ? '100%' : 'min(80vh, 720px)',
                border: 'none',
              }}
            />
          ) : kind === 'video' && attachment.url ? (
            <video
              src={attachment.url}
              controls
              controlsList="nodownload"
              preload="metadata"
              style={{ width: '100%', maxHeight: '100%' }}
            >
              <track kind="captions" />
            </video>
          ) : kind === 'audio' && attachment.url ? (
            <audio src={attachment.url} controls style={{ width: '100%' }} />
          ) : (
            <div
              style={{
                display: 'grid',
                gap: 12,
                placeItems: 'center',
                color: 'var(--sh-muted)',
                fontSize: 13,
                textAlign: 'center',
                padding: 32,
              }}
            >
              <div>Preview isn&rsquo;t available for this file type.</div>
              {attachment.url ? (
                <a
                  href={attachment.url}
                  download={attachment.name}
                  rel="noopener noreferrer"
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    background: 'var(--sh-brand)',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 700,
                    textDecoration: 'none',
                  }}
                >
                  Download {attachment.name || 'file'}
                </a>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

const iconButtonStyle = {
  width: 32,
  height: 32,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 8,
  border: '1px solid var(--sh-border)',
  background: 'var(--sh-surface)',
  color: 'var(--sh-text)',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  textDecoration: 'none',
}

/**
 * Small wrapper component: render a thumbnail / link, click → modal.
 *
 * Props:
 *   attachment: { url, name, kind?, type? }
 *   children:   what to render as the trigger (defaults to a name pill)
 */
export default function AttachmentPreview({ attachment, children, triggerStyle }) {
  const [open, setOpen] = useState(false)
  const kind = attachment.kind || inferKind(attachment.name, attachment.url || attachment.type)

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen(true)
        }}
        style={
          triggerStyle ?? {
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 10px',
            borderRadius: 8,
            border: '1px solid var(--sh-border)',
            background: 'var(--sh-surface)',
            color: 'var(--sh-text)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }
        }
        aria-label={`Open preview of ${attachment.name || 'attachment'}`}
      >
        {children ?? (
          <>
            <span aria-hidden style={{ color: 'var(--sh-muted)' }}>
              {kind === 'image'
                ? '🖼'
                : kind === 'pdf'
                  ? '📄'
                  : kind === 'video'
                    ? '🎬'
                    : kind === 'audio'
                      ? '🎵'
                      : '📎'}
            </span>
            <span
              style={{
                maxWidth: 220,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {attachment.name || 'Attachment'}
            </span>
          </>
        )}
      </button>
      {open ? (
        <AttachmentPreviewModal attachment={attachment} onClose={() => setOpen(false)} />
      ) : null}
    </>
  )
}
