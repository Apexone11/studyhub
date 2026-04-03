/* ═══════════════════════════════════════════════════════════════════════════
 * AnnouncementMedia.jsx — Renders announcement image gallery + video
 *
 * Used by both AnnouncementsPage cards and FeedCard for announcements.
 * Renders images in a responsive grid (1-5 images) and inline video.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useState, useEffect } from 'react'
import { API } from '../config'

/* ── Inline video player for announcement videos ───────────────────────── */

function AnnouncementVideoPlayer({ video }) {
  const [streamUrl, setStreamUrl] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!video?.id || video.status !== 'ready') return
    let cancelled = false

    async function fetchStream() {
      try {
        const res = await fetch(`${API}/api/video/${video.id}/stream`, { credentials: 'include' })
        if (!res.ok) throw new Error()
        const data = await res.json()
        if (!cancelled) {
          setStreamUrl(data.url)
          setLoading(false)
        }
      } catch {
        if (!cancelled) setLoading(false)
      }
    }

    fetchStream()
    return () => {
      cancelled = true
    }
  }, [video?.id, video?.status])

  const thumbnailUrl = video?.thumbnailR2Key
    ? `${API}/api/video/media/${encodeURIComponent(video.thumbnailR2Key)}`
    : null

  if (video?.status === 'processing') {
    return (
      <div style={videoContainerStyle}>
        <div style={spinnerStyle} />
        <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 'var(--type-xs)' }}>
          Video processing...
        </span>
      </div>
    )
  }

  if (video?.status === 'failed') {
    return (
      <div style={{ ...videoContainerStyle, background: 'var(--sh-danger-bg)' }}>
        <span style={{ color: 'var(--sh-danger-text)', fontSize: 'var(--type-sm)' }}>
          Video processing failed.
        </span>
      </div>
    )
  }

  if (loading || !streamUrl) {
    return (
      <div style={videoContainerStyle}>
        <div style={spinnerStyle} />
      </div>
    )
  }

  return (
    <video
      src={streamUrl}
      poster={thumbnailUrl || undefined}
      controls
      playsInline
      preload="metadata"
      style={{ width: '100%', display: 'block', borderRadius: 'var(--radius)', maxHeight: 400 }}
    />
  )
}

const videoContainerStyle = {
  background: '#000',
  borderRadius: 'var(--radius)',
  overflow: 'hidden',
  aspectRatio: '16/9',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexDirection: 'column',
  gap: 8,
}

const spinnerStyle = {
  width: 28,
  height: 28,
  border: '3px solid rgba(255,255,255,0.2)',
  borderTopColor: 'var(--sh-brand)',
  borderRadius: '50%',
  animation: 'shp-spin 0.8s linear infinite',
}

/* ── Image gallery layouts ─────────────────────────────────────────────── */

function ImageGallery({ images }) {
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const count = images.length

  if (count === 0) return null

  const gridStyle =
    count === 1
      ? {
          display: 'grid',
          gridTemplateColumns: '1fr',
          gap: 4,
          borderRadius: 'var(--radius)',
          overflow: 'hidden',
        }
      : count === 2
        ? {
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 4,
            borderRadius: 'var(--radius)',
            overflow: 'hidden',
          }
        : count === 3
          ? {
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gridTemplateRows: 'auto auto',
              gap: 4,
              borderRadius: 'var(--radius)',
              overflow: 'hidden',
            }
          : {
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 4,
              borderRadius: 'var(--radius)',
              overflow: 'hidden',
            }

  return (
    <>
      <div style={gridStyle}>
        {images
          .map((img, idx) => {
            const isFirst3 = count === 3 && idx === 0
            return (
              <div
                key={img.id || idx}
                style={{
                  position: 'relative',
                  cursor: 'pointer',
                  ...(isFirst3 ? { gridColumn: '1 / -1' } : {}),
                }}
                onClick={() => setLightboxIndex(idx)}
              >
                <img
                  src={img.url}
                  alt={img.fileName || ''}
                  loading="lazy"
                  style={{
                    width: '100%',
                    height: count === 1 ? 'auto' : isFirst3 ? 220 : 160,
                    maxHeight: count === 1 ? 400 : undefined,
                    objectFit: 'cover',
                    display: 'block',
                  }}
                />
                {/* "+N more" overlay on last visible image if >4 */}
                {count > 4 && idx === 3 && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'rgba(0,0,0,0.5)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      fontSize: 18,
                      fontWeight: 700,
                    }}
                  >
                    +{count - 4}
                  </div>
                )}
              </div>
            )
          })
          .slice(0, count > 4 ? 4 : count)}
      </div>

      {/* Simple lightbox */}
      {lightboxIndex !== null && (
        <div
          onClick={() => setLightboxIndex(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            padding: 24,
          }}
        >
          <img
            src={images[lightboxIndex].url}
            alt=""
            style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8 }}
            onClick={(e) => e.stopPropagation()}
          />
          {/* Nav arrows */}
          {images.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setLightboxIndex((lightboxIndex - 1 + images.length) % images.length)
                }}
                style={arrowBtnStyle('left')}
                aria-label="Previous image"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                  <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
                </svg>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setLightboxIndex((lightboxIndex + 1) % images.length)
                }}
                style={arrowBtnStyle('right')}
                aria-label="Next image"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                  <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
                </svg>
              </button>
            </>
          )}
          {/* Close button */}
          <button
            onClick={() => setLightboxIndex(null)}
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              background: 'none',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 28,
            }}
            aria-label="Close"
          >
            x
          </button>
          <div
            style={{
              position: 'absolute',
              bottom: 16,
              color: 'rgba(255,255,255,0.6)',
              fontSize: 13,
            }}
          >
            {lightboxIndex + 1} / {images.length}
          </div>
        </div>
      )}
    </>
  )
}

function arrowBtnStyle(side) {
  return {
    position: 'absolute',
    [side]: 16,
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'rgba(0,0,0,0.5)',
    border: 'none',
    borderRadius: '50%',
    width: 44,
    height: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'background 0.15s',
  }
}

/* ── Main export ───────────────────────────────────────────────────────── */

export default function AnnouncementMediaGallery({ media }) {
  if (!Array.isArray(media) || media.length === 0) return null

  const images = media.filter((m) => m.type === 'image' && m.url)
  const videoMedia = media.find((m) => m.type === 'video' && m.video)

  return (
    <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
      {images.length > 0 && <ImageGallery images={images} />}
      {videoMedia && <AnnouncementVideoPlayer video={videoMedia.video} />}
    </div>
  )
}
