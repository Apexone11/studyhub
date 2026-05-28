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
 * Fullscreen: uses the standard Fullscreen API on a wrapper inside the
 * dialog panel. ESC, click-outside, and the close button all dismiss.
 *
 * Accessibility: focus is trapped via <FocusTrappedDialog>; Tab cycles
 * within the dialog (W3C ARIA Authoring Practices §3.9 — Modal Dialog
 * Pattern); Escape closes; backdrop click closes; initial focus lands on
 * the close button so keyboard users can dismiss with Enter.
 *
 * 2026-05-27 — migrated from bespoke createPortal + manual Escape /
 * backdrop / focus handling to <FocusTrappedDialog>. Fullscreen API
 * target is now an inner wrapper div (panel chrome is hidden by the
 * browser's fullscreen mode regardless of where the target sits).
 * ════════════════════════════════════════════════════════════════════════ */
import { useEffect, useRef, useState } from 'react'
import FocusTrappedDialog from './Modal/FocusTrappedDialog'

const KIND_LABELS = {
  image: 'Image',
  pdf: 'PDF',
  video: 'Video',
  audio: 'Audio',
  doc: 'Document',
  other: 'File',
}

function inferKind(name = '', url = '', type = '') {
  // Inspect MIME type and the name+URL haystack independently. Older
  // callers passed `(name, urlOrType)`; the trigger picks `url` first
  // and `type` falls through, which broke `startsWith('image/')`
  // whenever both fields were present. Splitting the args means
  // `{ name: 'photo', url: 'blob:abc', type: 'image/png' }` correctly
  // resolves to 'image'.
  const ext = `${name} ${url}`.toLowerCase()
  const mime = String(type || (url && !url.startsWith('blob:') ? url : ''))
    .trim()
    .toLowerCase()
  if (/\.(png|jpe?g|gif|webp|svg|bmp)(\?|$)/.test(ext) || mime.startsWith('image/')) {
    return 'image'
  }
  if (/\.pdf(\?|$)/.test(ext) || mime.includes('application/pdf')) return 'pdf'
  if (/\.(mp4|webm|mov|m4v|ogv)(\?|$)/.test(ext) || mime.startsWith('video/')) {
    return 'video'
  }
  if (/\.(mp3|wav|m4a|ogg|flac)(\?|$)/.test(ext) || mime.startsWith('audio/')) {
    return 'audio'
  }
  if (/\.(docx?|odt|rtf|txt|md|pptx?|xlsx?|csv)(\?|$)/.test(ext)) return 'doc'
  return 'other'
}

export function AttachmentPreviewModal({ attachment, onClose }) {
  const containerRef = useRef(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const kind = attachment.kind || inferKind(attachment.name, attachment.url, attachment.type)

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

  return (
    <FocusTrappedDialog
      open
      onClose={onClose}
      ariaLabel={attachment.name || 'Attachment preview'}
      // Land focus on the close button (legacy behaviour) so keyboard
      // users can dismiss with Enter the moment the modal opens.
      initialFocusSelector="[data-attachment-close]"
      mobileLayout="fullscreen"
      overlayStyle={{
        background: 'rgba(0,0,0,0.65)',
        padding: 24,
        zIndex: 10000,
      }}
      panelStyle={{
        padding: 0,
        gap: 0,
        background: 'var(--sh-surface)',
        borderRadius: isFullscreen ? 0 : 14,
        border: isFullscreen ? 'none' : '1px solid var(--sh-border)',
        width: 'min(960px, 100%)',
        maxWidth: 'min(960px, 100%)',
        maxHeight: isFullscreen ? '100%' : '90vh',
        height: isFullscreen ? '100%' : 'auto',
      }}
    >
      <div
        ref={containerRef}
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          minHeight: 0,
          overflow: 'hidden',
          background: 'var(--sh-surface)',
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
              data-attachment-close
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
    </FocusTrappedDialog>
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
  const kind = attachment.kind || inferKind(attachment.name, attachment.url, attachment.type)

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
            <span
              aria-hidden
              style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: 'var(--sh-muted)',
              }}
            >
              {KIND_LABELS[kind] || 'File'}
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
