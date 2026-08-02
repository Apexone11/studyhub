/**
 * AttachmentSlideshow.jsx — paged viewer for a post's attachments.
 *
 * With a single attachment this renders exactly what the feed card
 * rendered before multi-attachment support: one preview box, no chrome.
 * With two or more it adds prev/next arrows, an "n / N" counter, the
 * current file's name, and dot indicators.
 *
 * PDF slides deliberately render in an UNsandboxed iframe: Chrome's
 * built-in PDF viewer cannot initialize inside a sandboxed frame
 * (crbug.com/41131921). That is safe here because the response is
 * first-party `application/pdf` with `nosniff` and a `script-src 'none'`
 * CSP, so it can never be reinterpreted as scriptable HTML. Every other
 * document type keeps `sandbox="allow-same-origin"`.
 */
import { useCallback, useEffect, useState } from 'react'
import { attachmentUrlsFor, kindForAttachment } from './feedHelpers'

function IconChevron({ direction }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ transform: direction === 'prev' ? 'rotate(180deg)' : undefined }}
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}

function arrowStyle(side) {
  return {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    [side]: 8,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    // 44x44 is the WCAG 2.5.5 target-size floor the project holds itself to.
    width: 44,
    height: 44,
    borderRadius: '50%',
    border: '1px solid var(--sh-border)',
    background: 'var(--sh-surface)',
    color: 'var(--sh-text)',
    cursor: 'pointer',
    boxShadow: 'var(--shadow-sm)',
    zIndex: 2,
  }
}

export default function AttachmentSlideshow({ postId, attachments = [], height = 300 }) {
  const [index, setIndex] = useState(0)
  const count = attachments.length

  // A shorter list (post edited, filters changed) must never leave the
  // viewer parked past the end.
  useEffect(() => {
    setIndex((current) => (current >= count ? 0 : current))
  }, [count])

  const goPrev = useCallback(() => {
    setIndex((current) => (current - 1 + count) % count)
  }, [count])

  const goNext = useCallback(() => {
    setIndex((current) => (current + 1) % count)
  }, [count])

  const onKeyDown = useCallback(
    (event) => {
      if (count < 2) return
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        goPrev()
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        goNext()
      }
    },
    [count, goPrev, goNext],
  )

  if (count === 0) return null

  const current = attachments[Math.min(index, count - 1)]
  const kind = kindForAttachment(current)
  const { previewUrl } = attachmentUrlsFor(postId, current)
  const isMulti = count > 1
  const frameStyle = {
    width: '100%',
    height,
    border: 'none',
    background: 'var(--sh-paper)',
    colorScheme: 'light',
    display: 'block',
  }

  return (
    <div
      role={isMulti ? 'group' : undefined}
      aria-roledescription={isMulti ? 'carousel' : undefined}
      aria-label={isMulti ? `Post attachments, ${count} files` : undefined}
      tabIndex={isMulti ? 0 : undefined}
      onKeyDown={onKeyDown}
      style={{ outline: 'none' }}
    >
      <div
        style={{
          position: 'relative',
          border: '1px solid var(--sh-paper-border)',
          borderRadius: 10,
          background: 'var(--sh-paper)',
          overflow: 'hidden',
          maxHeight: height,
        }}
      >
        {kind === 'image' ? (
          <img
            src={previewUrl}
            alt={current.name || 'Attachment preview'}
            loading="lazy"
            style={{
              width: '100%',
              maxHeight: height,
              objectFit: 'contain',
              background: 'var(--sh-paper-soft)',
              display: 'block',
            }}
          />
        ) : kind === 'pdf' ? (
          <iframe
            key={previewUrl}
            src={previewUrl}
            title={current.name || 'Attachment preview'}
            referrerPolicy="no-referrer"
            loading="lazy"
            style={frameStyle}
          />
        ) : (
          <iframe
            key={previewUrl}
            src={previewUrl}
            title={current.name || 'Attachment preview'}
            sandbox="allow-same-origin"
            referrerPolicy="no-referrer"
            loading="lazy"
            style={frameStyle}
          />
        )}

        {isMulti && (
          <>
            <button
              type="button"
              onClick={goPrev}
              aria-label="Previous attachment"
              style={arrowStyle('left')}
            >
              <IconChevron direction="prev" />
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label="Next attachment"
              style={arrowStyle('right')}
            >
              <IconChevron direction="next" />
            </button>
          </>
        )}
      </div>

      {isMulti && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginTop: 8,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--sh-text)' }}>
            {index + 1} / {count}
          </span>
          <span
            style={{
              fontSize: 12,
              color: 'var(--sh-subtext)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
              flex: 1,
            }}
            title={current.name}
          >
            {current.name}
          </span>
          {count <= 5 && (
            <span style={{ display: 'inline-flex', gap: 6 }} aria-hidden="true">
              {attachments.map((attachment, dotIndex) => (
                <button
                  key={attachment.id ?? dotIndex}
                  type="button"
                  tabIndex={-1}
                  onClick={() => setIndex(dotIndex)}
                  // The visible dot stays 7px, but the hit area is padded
                  // out so a thumb can land on it; the arrows and counter
                  // remain the primary, fully-sized controls.
                  style={{
                    width: 7,
                    height: 7,
                    padding: 0,
                    boxSizing: 'content-box',
                    border: '8px solid transparent',
                    backgroundClip: 'padding-box',
                    borderRadius: '50%',
                    cursor: 'pointer',
                    background:
                      dotIndex === index ? 'var(--sh-brand)' : 'var(--sh-slate-300, #cbd5e1)',
                  }}
                />
              ))}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
