import { memo, useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import MentionText from '../../components/MentionText'
import PendingReviewBanner from '../../components/PendingReviewBanner'
import { IconDownload, IconEye, IconFork, IconStar, IconStarFilled } from '../../components/Icons'
import { attachmentEndpoints, attachmentPreviewKind } from './feedHelpers'
import { popScale } from '../../lib/animations'
import { Avatar } from './FeedWidgets'
import CommentSection from './CommentSection'
import {
  FONT,
  timeAgo,
  actionButton,
  linkButton,
  pillStyle,
  statsBarStyle,
  statsCountStyle,
  statsLinkStyle,
  actionBarStyle,
  actionBarButton,
  shareToastStyle,
} from './feedConstants'
import { API } from '../../config'
import ProBadge from '../../components/ProBadge'
import StudyStatusChip from '../../components/StudyStatusChip'

/* ── SVG icon components for post actions ──────────────────────────────── */

function ThumbUpIcon({ size = 20, filled = false }) {
  if (filled) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z" />
      </svg>
    )
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
    </svg>
  )
}

function ThumbDownIcon({ size = 20, filled = false }) {
  if (filled) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06l1.06 1.05 6.57-6.59C16.78 14.95 17 14.45 17 14V5c0-1.1-.9-2-2-2zm4 0v12h4V3h-4z" />
      </svg>
    )
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 15V19a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10zM17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3" />
    </svg>
  )
}

function CommentIcon({ size = 20 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function ShareIcon({ size = 20 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  )
}

/* ── Inline feed video player (lazy loaded) ────────────────────────────── */

// Persisted across sessions so a user who muted yesterday isn't blasted
// today. Stored as a single boolean string under one key — no PII, no
// per-video state, safe to fail silently if storage is unavailable.
const MUTE_PREF_KEY = 'studyhub.feed.video.muted'

function readMutedPreference() {
  try {
    return window.localStorage.getItem(MUTE_PREF_KEY) === 'true'
  } catch {
    return false
  }
}

function writeMutedPreference(muted) {
  try {
    window.localStorage.setItem(MUTE_PREF_KEY, muted ? 'true' : 'false')
  } catch {
    /* private mode / disabled storage — ignore */
  }
}

function FeedVideoPlayer({ video }) {
  const [streamUrl, setStreamUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // `started` flips true after the first play() call; we never trap the
  // <video> at opacity:0 before that — the browser's native poster + play
  // button handle the pre-play state.
  const [started, setStarted] = useState(false)
  // Buffering only reflects mid-playback stalls — never the initial idle
  // state. Initial idle = `started === false` (show big play overlay).
  const [stalled, setStalled] = useState(false)
  // Hover/focus visual for the click-to-play overlay. State-driven (not
  // imperative `e.currentTarget.style` mutation) so :focus-visible from
  // keyboard navigation gets the same treatment as a mouse hover. Reset
  // alongside the other video-tied state below so a virtualised feed
  // doesn't carry a "hot" overlay over to the next video.
  const [overlayHot, setOverlayHot] = useState(false)
  const videoRef = useRef(null)

  useEffect(() => {
    if (!video?.id || video.status !== 'ready') return
    let cancelled = false

    // Reset every state that's tied to a specific video src. If a parent
    // ever swaps the `video` prop on the same mounted instance (virtualised
    // feed, FLIP animation, key-less conditional render), the previous
    // video's `started=true` would otherwise hide the click-to-play overlay
    // forever for the new video. Same for stalled / error / streamUrl.
    setStarted(false)
    setStalled(false)
    setError(null)
    setStreamUrl(null)
    setLoading(true)
    setOverlayHot(false)

    async function fetchStream() {
      try {
        const res = await fetch(`${API}/api/video/${video.id}/stream`, { credentials: 'include' })
        if (!res.ok) {
          // Translate the failure into playback-specific copy. The backend's
          // /stream endpoint is shared with the download path, so its raw
          // 403 ("Downloads are disabled for this video.") is misleading
          // when the user clicked Play. Map known statuses to playback
          // wording and fall back to the HTTP status for the long tail.
          // We don't render `body.error` directly for the same reason.
          let message
          switch (res.status) {
            case 403:
              message = 'Playback is restricted for this video.'
              break
            case 404:
              message = 'This video is no longer available.'
              break
            case 409:
              message = 'Video is still processing — try again in a minute.'
              break
            case 429:
              message = 'Too many requests — please wait a moment and try again.'
              break
            default:
              message = `Could not load video (HTTP ${res.status}).`
          }
          throw new Error(message)
        }
        const data = await res.json()
        if (!cancelled) {
          setStreamUrl(data.url)
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Could not load video.')
          setLoading(false)
        }
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

  // Apply the persisted mute preference once the <video> element exists
  // and a stream URL is in place. Doing this in an effect (rather than as
  // an attribute) keeps the muted state consistent if React re-renders
  // mid-playback; `muted` as a JSX attribute would otherwise reset the
  // user's in-session toggle.
  useEffect(() => {
    if (!videoRef.current || !streamUrl) return
    videoRef.current.muted = readMutedPreference()
  }, [streamUrl])

  const handlePlayClick = useCallback(() => {
    const el = videoRef.current
    if (!el) return
    setStarted(true)
    // Apply mute pref before play so autoplay-with-sound rejection rules
    // never block first frame.
    el.muted = readMutedPreference()
    const playPromise = el.play()
    if (playPromise && typeof playPromise.catch === 'function') {
      // User-gesture-rejected play (mobile autoplay policy, etc.) is
      // benign — the native controls still let them retry. Swallow the
      // unhandled-rejection without surfacing a fake error.
      playPromise.catch(() => {})
    }
  }, [])

  // Persist mute toggles on every change. `volumechange` covers both the
  // user clicking the mute button on native controls and any keyboard
  // shortcut handler below.
  const handleVolumeChange = useCallback(() => {
    if (!videoRef.current) return
    writeMutedPreference(videoRef.current.muted)
  }, [])

  // Keyboard shortcuts when the video element has focus. Mirrors the
  // standard YouTube / Mux Player bindings: Space = toggle play, M =
  // toggle mute, F = fullscreen, ←/→ = ±5s seek. Native <video controls>
  // already handles Space when the controls bar is focused, but binding
  // it on the element itself makes the whole surface keyboard-driven
  // once it's focused.
  const handleKeyDown = useCallback(
    (e) => {
      const el = videoRef.current
      if (!el) return
      // Don't steal keys from inputs (e.g. comment composer below the card).
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return
      // Don't intercept browser/OS/screen-reader chords. Cmd/Ctrl + ArrowRight
      // is browser navigation; Ctrl+M is the JAWS / NVDA modal-list toggle;
      // Alt+ combos are app-switcher in many shells. Plain key presses only.
      if (e.metaKey || e.ctrlKey || e.altKey) return
      switch (e.key) {
        case ' ':
        case 'k':
        case 'K':
          e.preventDefault()
          if (el.paused) el.play().catch(() => {})
          else el.pause()
          break
        case 'm':
        case 'M':
          e.preventDefault()
          el.muted = !el.muted
          break
        case 'f':
        case 'F': {
          // Honor the creator's `nofullscreen` controlsList — if downloads /
          // fullscreen are disabled, the keyboard shortcut must not bypass.
          if (video?.downloadable === false) break
          e.preventDefault()
          // Safari (iOS + Safari ≤15 on macOS) only exposes the webkit-
          // prefixed APIs; the standard `document.fullscreenElement` reads
          // null there. Check both, call both.
          const fsEl = document.fullscreenElement || document.webkitFullscreenElement
          if (fsEl === el) {
            const exit = document.exitFullscreen || document.webkitExitFullscreen
            exit?.call(document)?.catch?.(() => {})
          } else {
            const enter = el.requestFullscreen || el.webkitRequestFullscreen
            enter?.call(el)?.catch?.(() => {})
          }
          break
        }
        case 'ArrowLeft':
          e.preventDefault()
          el.currentTime = Math.max(0, el.currentTime - 5)
          break
        case 'ArrowRight':
          e.preventDefault()
          el.currentTime = Math.min(el.duration || 0, el.currentTime + 5)
          break
        default:
          break
      }
    },
    [video?.downloadable],
  )

  if (video?.status === 'processing') {
    return (
      <div
        style={{
          background: '#000',
          borderRadius: 'var(--radius-card)',
          overflow: 'hidden',
          aspectRatio: '16/9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 8,
          marginTop: 14,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            border: '3px solid rgba(255,255,255,0.2)',
            borderTopColor: 'var(--sh-brand)',
            borderRadius: '50%',
            animation: 'shp-spin 0.8s linear infinite',
          }}
        />
        <span
          style={{ color: 'rgba(255,255,255,0.7)', fontSize: 'var(--type-xs)', fontWeight: 500 }}
        >
          Video is processing...
        </span>
      </div>
    )
  }

  if (video?.status === 'failed') {
    return (
      <div
        style={{
          background: 'var(--sh-danger-bg)',
          borderRadius: 'var(--radius-card)',
          padding: 16,
          marginTop: 14,
          textAlign: 'center',
          color: 'var(--sh-danger-text)',
          fontSize: 'var(--type-sm)',
        }}
      >
        Video processing failed.
      </div>
    )
  }

  if (error) {
    return (
      <div
        style={{
          background: 'var(--sh-danger-bg)',
          borderRadius: 'var(--radius-card)',
          padding: 16,
          marginTop: 14,
          textAlign: 'center',
          color: 'var(--sh-danger-text)',
          fontSize: 'var(--type-sm)',
        }}
      >
        {error || 'Could not load video.'}
      </div>
    )
  }

  if (loading || !streamUrl) {
    return (
      <div
        style={{
          background: '#000',
          borderRadius: 'var(--radius-card)',
          overflow: 'hidden',
          aspectRatio: '16/9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 14,
        }}
      >
        {thumbnailUrl && (
          <img
            src={thumbnailUrl}
            alt=""
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: 0.5,
            }}
          />
        )}
        <div
          style={{
            width: 32,
            height: 32,
            border: '3px solid rgba(255,255,255,0.2)',
            borderTopColor: 'var(--sh-brand)',
            borderRadius: '50%',
            animation: 'shp-spin 0.8s linear infinite',
          }}
        />
      </div>
    )
  }

  return (
    <div
      style={{
        marginTop: 14,
        borderRadius: 'var(--radius-card)',
        overflow: 'hidden',
        background: '#000',
      }}
    >
      {/*
        Standard `<video poster>` pattern — the browser renders the poster
        image until first play, after which it shows decoded frames. No
        opacity hacks: the video element is always visible at full opacity,
        controls are always reachable. A custom click-to-play overlay sits
        on top of the poster only while `started === false`, so users get
        a big obvious play target instead of the small native control.
      */}
      <div style={{ position: 'relative', backgroundColor: '#000' }}>
        <video
          ref={videoRef}
          src={streamUrl}
          poster={thumbnailUrl || undefined}
          controls
          playsInline
          preload="metadata"
          tabIndex={0}
          controlsList={
            video.downloadable === false ? 'nodownload nofullscreen noremoteplayback' : undefined
          }
          disablePictureInPicture={video.downloadable === false}
          onContextMenu={video.downloadable === false ? (e) => e.preventDefault() : undefined}
          onPlay={() => {
            setStarted(true)
            setStalled(false)
          }}
          onPlaying={() => setStalled(false)}
          onWaiting={() => setStalled(true)}
          onCanPlay={() => setStalled(false)}
          // Without this, a mid-play network drop / stream 404 leaves the
          // spinner spinning forever — onWaiting fires but onCanPlay never
          // does. Surface the failure so the user isn't lied to.
          onError={() => {
            setStalled(false)
            setError('Video playback failed.')
          }}
          onVolumeChange={handleVolumeChange}
          onKeyDown={handleKeyDown}
          style={{
            width: '100%',
            display: 'block',
            maxHeight: 500,
            backgroundColor: '#000',
          }}
        />
        {!started && (
          <button
            type="button"
            onClick={handlePlayClick}
            onMouseEnter={() => setOverlayHot(true)}
            onMouseLeave={() => setOverlayHot(false)}
            onFocus={() => setOverlayHot(true)}
            onBlur={() => setOverlayHot(false)}
            aria-label={video.title ? `Play video: ${video.title}` : 'Play video'}
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: overlayHot ? 'rgba(0,0,0,0.32)' : 'rgba(0,0,0,0.18)',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              transition: 'background 0.15s ease',
              outline: 'none',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.92)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: overlayHot
                  ? '0 4px 24px rgba(0,0,0,0.45), 0 0 0 4px rgba(255,255,255,0.35)'
                  : '0 4px 16px rgba(0,0,0,0.3)',
                transform: overlayHot ? 'scale(1.06)' : 'scale(1)',
                transition: 'box-shadow 0.15s ease, transform 0.15s ease',
              }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="#111">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </button>
        )}
        {started && stalled && (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 40,
              height: 40,
              border: '3px solid rgba(255,255,255,0.25)',
              borderTopColor: '#fff',
              borderRadius: '50%',
              animation: 'shp-spin 0.8s linear infinite',
              pointerEvents: 'none',
            }}
          />
        )}
      </div>
      <div
        style={{
          padding: '8px 12px',
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          background: 'var(--sh-soft)',
          fontSize: 'var(--type-xs)',
          color: 'var(--sh-muted)',
        }}
      >
        <div style={{ flex: 1, display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
          {video.title && (
            <span
              style={{
                fontWeight: 600,
                color: 'var(--sh-text)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {video.title}
            </span>
          )}
          {video.duration > 0 && <span>{formatDuration(video.duration)}</span>}
          {video.width > 0 && video.height > 0 && (
            <span>
              {video.width}x{video.height}
            </span>
          )}
        </div>
        {video.downloadable !== false && streamUrl && (
          <a
            href={streamUrl}
            download
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              color: 'var(--sh-brand)',
              fontWeight: 600,
              fontSize: 11,
              textDecoration: 'none',
              padding: '3px 8px',
              borderRadius: 6,
              background: 'var(--sh-brand-soft)',
              whiteSpace: 'nowrap',
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download
          </a>
        )}
      </div>
    </div>
  )
}

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

/* ── Main FeedCard ──────────────────────────────────────────────────────── */

function FeedCardInner({
  item,
  onReact,
  onStar,
  onDeletePost,
  canDeletePost,
  isPostMenuOpen,
  onTogglePostMenu,
  isDeletingPost,
  currentUser,
  onReport,
  targetCommentId,
  studyStatus,
}) {
  const isSheet = item.type === 'sheet'
  const isPost = item.type === 'post'
  const isNote = item.type === 'note'
  const reaction = item.reactions || { likes: 0, dislikes: 0, userReaction: null }
  const urls = attachmentEndpoints(item)
  const previewKind = attachmentPreviewKind(item)

  const [showComments, setShowComments] = useState(!!targetCommentId)
  const [shareToastMessage, setShareToastMessage] = useState('')
  const shareToastTimerRef = useRef(null)

  const flashShareToast = useCallback((message) => {
    window.clearTimeout(shareToastTimerRef.current)
    setShareToastMessage(message)
    shareToastTimerRef.current = window.setTimeout(() => {
      setShareToastMessage('')
    }, 2000)
  }, [])

  useEffect(
    () => () => {
      window.clearTimeout(shareToastTimerRef.current)
    },
    [],
  )

  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}/feed?post=${item.id}`
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(url)
        flashShareToast('Link copied')
        return
      } catch {
        // Fall back to a manual copy flow below.
      }
    }

    if (typeof window.prompt === 'function') {
      window.prompt('Copy this link', url)
      flashShareToast('Copy link shown')
      return
    }

    flashShareToast('Could not copy link')
  }, [flashShareToast, item.id])

  return (
    <article
      className="sh-card"
      data-post-id={item.id}
      style={{ padding: '20px 24px', transition: 'box-shadow 0.2s ease' }}
    >
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        {item.author?.username ? (
          <Link
            to={`/users/${item.author.username}`}
            style={{ textDecoration: 'none', flexShrink: 0 }}
          >
            <Avatar
              username={item.author.username}
              role="student"
              avatarUrl={item.author.avatarUrl}
              plan={item.author.plan}
              isDonor={item.author.isDonor}
              donorLevel={item.author.donorLevel}
            />
          </Link>
        ) : (
          <Avatar username={item.type} role="student" />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}
          >
            <div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {item.author?.username ? (
                  <>
                    <Link
                      to={`/users/${item.author.username}`}
                      style={{
                        fontWeight: 700,
                        color: 'var(--sh-heading)',
                        fontSize: 14,
                        textDecoration: 'none',
                      }}
                    >
                      {item.author.username}
                    </Link>
                    <ProBadge plan={item.author.plan} size="xs" />
                  </>
                ) : (
                  <span style={{ fontWeight: 700, color: 'var(--sh-heading)', fontSize: 14 }}>
                    StudyHub
                  </span>
                )}
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '.04em',
                    borderRadius: 6,
                    padding: '2px 8px',
                    lineHeight: '18px',
                    ...(item.type === 'announcement'
                      ? { background: 'var(--sh-warning)', color: 'var(--sh-slate-900)' }
                      : item.type === 'sheet'
                        ? { background: 'var(--sh-success)', color: 'white' }
                        : item.type === 'note'
                          ? { background: 'var(--sh-info)', color: 'white' }
                          : { background: 'var(--sh-brand)', color: 'white' }),
                  }}
                >
                  {item.video ? 'video' : item.type}
                </span>
                {item.course?.code ? (
                  <span style={{ fontSize: 11, color: 'var(--sh-subtext)' }}>
                    {item.course.code}
                  </span>
                ) : null}
                {isSheet && studyStatus ? <StudyStatusChip status={studyStatus} /> : null}
              </div>
              {/* <time> for SR + structured-data parsers; native title
                  attribute reveals the absolute date on hover, no JS. */}
              <time
                dateTime={item.createdAt || ''}
                title={item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}
                style={{
                  display: 'block',
                  fontSize: 11,
                  color: 'var(--sh-muted)',
                  marginTop: 4,
                  cursor: 'default',
                }}
              >
                {timeAgo(item.createdAt)}
              </time>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {item.linkPath && item.type !== 'post' ? (
                <Link
                  to={item.linkPath}
                  style={{
                    fontSize: 12,
                    color: 'var(--sh-brand)',
                    fontWeight: 700,
                    textDecoration: 'none',
                  }}
                >
                  Open
                </Link>
              ) : null}
              {isPost && currentUser ? (
                <div style={{ position: 'relative' }}>
                  <button
                    type="button"
                    onClick={() => onTogglePostMenu(isPostMenuOpen ? null : item.id)}
                    className="feed-post-menu-btn"
                    style={{
                      border: '1px solid var(--sh-border)',
                      background: 'var(--sh-surface)',
                      borderRadius: 8,
                      color: 'var(--sh-muted)',
                      width: 32,
                      height: 32,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all .15s',
                    }}
                    aria-label="Post actions"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                      <circle cx="8" cy="3" r="1.5" />
                      <circle cx="8" cy="8" r="1.5" />
                      <circle cx="8" cy="13" r="1.5" />
                    </svg>
                  </button>
                  {isPostMenuOpen ? (
                    <div
                      style={{
                        position: 'absolute',
                        top: 36,
                        right: 0,
                        minWidth: 160,
                        borderRadius: 12,
                        border: '1px solid var(--sh-border)',
                        background: 'var(--sh-surface)',
                        boxShadow: 'var(--elevation-3)',
                        padding: 4,
                        zIndex: 3,
                      }}
                    >
                      {item.author?.id !== currentUser?.id && (
                        <button
                          type="button"
                          onClick={() => {
                            onTogglePostMenu(null)
                            onReport?.(
                              item.type === 'post'
                                ? 'post'
                                : item.type === 'note'
                                  ? 'note'
                                  : 'sheet',
                              item.id,
                            )
                          }}
                          className="feed-post-menu-item"
                          style={{
                            width: '100%',
                            borderRadius: 8,
                            border: 'none',
                            background: 'transparent',
                            color: 'var(--sh-warning-text)',
                            fontSize: 13,
                            fontWeight: 600,
                            textAlign: 'left',
                            padding: '8px 12px',
                            cursor: 'pointer',
                            fontFamily: FONT,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            transition: 'background .15s',
                          }}
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                            <line x1="4" y1="22" x2="4" y2="15" />
                          </svg>
                          Report
                        </button>
                      )}
                      {canDeletePost ? (
                        <button
                          type="button"
                          onClick={() => onDeletePost(item)}
                          disabled={isDeletingPost}
                          className="feed-post-delete-btn"
                          style={{
                            width: '100%',
                            borderRadius: 8,
                            border: 'none',
                            background: 'transparent',
                            color: 'var(--sh-danger)',
                            fontSize: 13,
                            fontWeight: 600,
                            textAlign: 'left',
                            padding: '8px 12px',
                            cursor: isDeletingPost ? 'wait' : 'pointer',
                            fontFamily: FONT,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            transition: 'background .15s',
                          }}
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                          {isDeletingPost ? 'Deleting...' : 'Delete post'}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          {item.moderationStatus === 'pending_review' && currentUser?.id === item.author?.id && (
            <PendingReviewBanner />
          )}
          {item.title ? (
            <h3
              style={{
                margin: '0 0 8px',
                color: 'var(--sh-heading)',
                fontSize: 17,
                fontWeight: 700,
              }}
            >
              {item.title}
            </h3>
          ) : null}
          {item.body || item.content || item.preview || item.description ? (
            <p
              style={{
                margin: 0,
                color: 'var(--sh-text)',
                fontSize: 14,
                lineHeight: 1.65,
                whiteSpace: 'pre-wrap',
              }}
            >
              <MentionText
                text={item.body || item.content || item.preview || item.description || ''}
              />
            </p>
          ) : null}

          {/* Video player */}
          {item.video && <FeedVideoPlayer video={item.video} />}

          {urls ? (
            <section
              style={{
                marginTop: 14,
                border: '1px solid var(--sh-border)',
                borderRadius: 'var(--radius-card)',
                background: 'var(--sh-soft)',
                padding: 12,
              }}
            >
              <div style={{ fontSize: 12, color: 'var(--sh-subtext)', marginBottom: 10 }}>
                Attachment:{' '}
                <span style={{ color: 'var(--sh-text)', fontWeight: 700 }}>
                  {item.attachmentName || 'Attachment'}
                </span>
              </div>
              <div
                style={{
                  border: '1px solid var(--sh-paper-border)',
                  borderRadius: 10,
                  background: 'var(--sh-paper)',
                  overflow: 'hidden',
                  maxHeight: 300,
                }}
              >
                {previewKind === 'image' ? (
                  <img
                    src={urls.previewUrl}
                    alt={item.attachmentName || 'Attachment preview'}
                    loading="lazy"
                    style={{
                      width: '100%',
                      maxHeight: 300,
                      objectFit: 'contain',
                      background: 'var(--sh-paper-soft)',
                    }}
                  />
                ) : (
                  <iframe
                    src={urls.previewUrl}
                    title={`Attachment preview ${item.id}`}
                    sandbox="allow-same-origin"
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    style={{
                      width: '100%',
                      height: 300,
                      border: 'none',
                      background: 'var(--sh-paper)',
                      colorScheme: 'light',
                    }}
                  />
                )}
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
                <Link to={urls.fullPreviewPath} style={linkButton()}>
                  <IconEye size={14} />
                  Full preview
                </Link>
                {item.allowDownloads !== false ? (
                  <a href={urls.downloadUrl} style={linkButton()}>
                    <IconDownload size={14} />
                    Download original
                  </a>
                ) : (
                  <span style={pillStyle()}>Downloads disabled</span>
                )}
              </div>
            </section>
          ) : null}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
            {isSheet ? (
              <button
                type="button"
                onClick={(e) => {
                  popScale(e.currentTarget)
                  onStar(item)
                }}
                style={actionButton(item.starred ? 'var(--sh-warning)' : 'var(--sh-slate-600)')}
              >
                {item.starred ? <IconStarFilled size={14} /> : <IconStar size={14} />}
                {item.stars || 0} stars
              </button>
            ) : null}
            {isSheet ? (
              <Link to={item.linkPath} style={linkButton()}>
                <IconDownload size={14} />
                View sheet
              </Link>
            ) : null}
            {isSheet ? (
              <button
                type="button"
                onClick={(e) => {
                  popScale(e.currentTarget)
                  onReact(item, 'like')
                }}
                style={actionButton(
                  reaction.userReaction === 'like' ? 'var(--sh-success)' : 'var(--sh-slate-600)',
                )}
              >
                Helpful {reaction.likes || 0}
              </button>
            ) : null}
            {isSheet ? (
              <button
                type="button"
                onClick={(e) => {
                  popScale(e.currentTarget)
                  onReact(item, 'dislike')
                }}
                style={actionButton(
                  reaction.userReaction === 'dislike' ? 'var(--sh-danger)' : 'var(--sh-slate-600)',
                )}
              >
                Needs work {reaction.dislikes || 0}
              </button>
            ) : null}
            {isNote ? (
              <Link to={item.linkPath} style={linkButton()}>
                <IconEye size={14} />
                Read note
              </Link>
            ) : null}
            {isNote && item.commentCount > 0 ? (
              <span style={pillStyle()}>
                {item.commentCount} {item.commentCount === 1 ? 'comment' : 'comments'}
              </span>
            ) : null}
            {item.downloads ? <span style={pillStyle()}>{item.downloads} downloads</span> : null}
            {item.forks ? (
              <span style={pillStyle()}>
                <IconFork size={13} /> {item.forks} forks
              </span>
            ) : null}
          </div>

          {/* Post stats bar + action bar (Facebook-style) */}
          {isPost && (
            <>
              {(reaction.likes > 0 || reaction.dislikes > 0 || (item.commentCount || 0) > 0) && (
                <div style={statsBarStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {reaction.likes > 0 && (
                      <span style={statsCountStyle}>
                        <ThumbUpIcon size={15} filled />
                        {reaction.likes}
                      </span>
                    )}
                    {reaction.dislikes > 0 && (
                      <span style={{ ...statsCountStyle, color: 'var(--sh-danger)' }}>
                        <ThumbDownIcon size={15} filled />
                        {reaction.dislikes}
                      </span>
                    )}
                  </div>
                  {(item.commentCount || 0) > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowComments((v) => !v)}
                      style={statsLinkStyle}
                    >
                      {item.commentCount} {item.commentCount === 1 ? 'comment' : 'comments'}
                    </button>
                  )}
                </div>
              )}

              <div style={actionBarStyle}>
                <button
                  type="button"
                  onClick={(e) => {
                    popScale(e.currentTarget)
                    onReact(item, 'like')
                  }}
                  style={actionBarButton(reaction.userReaction === 'like', 'var(--sh-success)')}
                >
                  <ThumbUpIcon size={18} filled={reaction.userReaction === 'like'} />
                  Like{reaction.likes > 0 ? ` ${reaction.likes}` : ''}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    popScale(e.currentTarget)
                    onReact(item, 'dislike')
                  }}
                  style={actionBarButton(reaction.userReaction === 'dislike', 'var(--sh-danger)')}
                >
                  <ThumbDownIcon size={18} filled={reaction.userReaction === 'dislike'} />
                  Dislike{reaction.dislikes > 0 ? ` ${reaction.dislikes}` : ''}
                </button>
                <button
                  type="button"
                  onClick={() => setShowComments((v) => !v)}
                  style={actionBarButton(showComments, 'var(--sh-brand)')}
                >
                  <CommentIcon size={18} />
                  Comment{(item.commentCount || 0) > 0 ? ` ${item.commentCount}` : ''}
                </button>
                <button
                  type="button"
                  onClick={handleShare}
                  style={actionBarButton(false, 'var(--sh-muted)')}
                >
                  <ShareIcon size={18} />
                  Share
                </button>
              </div>

              {showComments && (
                <CommentSection
                  postId={item.id}
                  commentCount={item.commentCount || 0}
                  user={currentUser}
                  targetCommentId={targetCommentId}
                  alwaysExpanded
                />
              )}
            </>
          )}

          {/* Share toast */}
          {shareToastMessage && <div style={shareToastStyle}>{shareToastMessage}</div>}
        </div>
      </div>
    </article>
  )
}

function feedCardPropsAreEqual(prev, next) {
  return (
    prev.item === next.item &&
    prev.canDeletePost === next.canDeletePost &&
    prev.isPostMenuOpen === next.isPostMenuOpen &&
    prev.isDeletingPost === next.isDeletingPost &&
    prev.currentUser === next.currentUser &&
    prev.targetCommentId === next.targetCommentId &&
    prev.studyStatus === next.studyStatus
  )
}

const FeedCard = memo(FeedCardInner, feedCardPropsAreEqual)
export default FeedCard
