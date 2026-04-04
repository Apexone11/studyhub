/* ═══════════════════════════════════════════════════════════════════════════
 * StudyHubPlayer.jsx — Custom Video.js player with YouTube-like controls
 *
 * Features:
 *   - Play/pause, seek bar with buffered progress, volume + mute
 *   - Quality switching (Auto, 1080p, 720p, 360p)
 *   - Playback speed (0.25x - 2x)
 *   - Captions toggle + language selector
 *   - Theater mode (full-width dark layout)
 *   - Loop toggle
 *   - Fullscreen
 *   - Keyboard shortcuts (Space, arrows, M, F, C, T, L)
 *   - Double-tap left/right to skip 10s (mobile)
 *   - Loading spinner overlay
 *
 * Props:
 *   src          — Video source URL (or object { src, type })
 *   variants     — { "360p": { url }, "720p": { url }, "1080p": { url } }
 *   poster       — Thumbnail URL
 *   captions     — [{ language, label, src }]
 *   autoPlay     — Boolean (default false)
 *   muted        — Boolean (default false, true for feed autoplay)
 *   onTheaterChange — Callback when theater mode toggles
 *   className    — Additional CSS class
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useRef, useEffect, useState, useCallback } from 'react'
import videojs from 'video.js'
import 'video.js/dist/video-js.css'
import './studyhub-player.css'

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

export default function StudyHubPlayer({
  src,
  variants = {},
  poster = '',
  captions = [],
  autoPlay = false,
  muted = false,
  onTheaterChange,
  className = '',
}) {
  const videoRef = useRef(null)
  const playerRef = useRef(null)
  const containerRef = useRef(null)
  const controlsTimerRef = useRef(null)
  const doubleTapRef = useRef({ side: null, timer: null })

  // ── Restore persisted preferences from localStorage ───────────────
  function readStorage(key, fallback) {
    try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback }
    catch { return fallback }
  }
  function writeStorage(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* quota or private mode */ }
  }

  // UI state
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [volume, setVolume] = useState(() => muted ? 0 : readStorage('studyhub_player_volume', 1))
  const [isMuted, setIsMuted] = useState(() => muted || readStorage('studyhub_player_muted', false))
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [loading, setLoading] = useState(true)
  const [theaterMode, setTheaterMode] = useState(false)
  const [loopEnabled, setLoopEnabled] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(() => readStorage('studyhub_player_speed', 1))
  const [showSpeedMenu, setShowSpeedMenu] = useState(false)
  const [showQualityMenu, setShowQualityMenu] = useState(false)
  const [showCaptionMenu, setShowCaptionMenu] = useState(false)
  const [activeQuality, setActiveQuality] = useState('auto')
  const [activeCaption, setActiveCaption] = useState('off')
  const [skipIndicator, setSkipIndicator] = useState(null) // { side, seconds }

  // ── Initialize Video.js ──────────────────────────────────────────────
  useEffect(() => {
    if (!videoRef.current) return

    const sourceObj = typeof src === 'string' ? { src, type: 'video/mp4' } : src

    const player = videojs(videoRef.current, {
      controls: false, // We build our own controls
      autoplay: autoPlay,
      muted,
      preload: 'metadata',
      responsive: true,
      fluid: false,
      poster,
      sources: sourceObj ? [sourceObj] : [],
    })

    playerRef.current = player

    // Event listeners
    player.on('play', () => setPlaying(true))
    player.on('pause', () => setPlaying(false))
    player.on('ended', () => setPlaying(false))
    player.on('waiting', () => setLoading(true))
    player.on('canplay', () => setLoading(false))
    player.on('playing', () => setLoading(false))
    player.on('loadedmetadata', () => {
      setDuration(player.duration() || 0)
      setLoading(false)
    })
    player.on('timeupdate', () => {
      setCurrentTime(player.currentTime() || 0)
      // Update buffered range
      const buf = player.buffered()
      if (buf && buf.length > 0) {
        setBuffered(buf.end(buf.length - 1))
      }
    })
    player.on('volumechange', () => {
      const v = player.volume()
      const m = player.muted()
      setVolume(v)
      setIsMuted(m)
      writeStorage('studyhub_player_volume', v)
      writeStorage('studyhub_player_muted', m)
    })

    // Apply persisted preferences
    const savedVol = readStorage('studyhub_player_volume', 1)
    const savedMuted = muted || readStorage('studyhub_player_muted', false)
    const savedSpeed = readStorage('studyhub_player_speed', 1)
    player.volume(savedVol)
    player.muted(savedMuted)
    player.playbackRate(savedSpeed)

    // Add caption tracks
    captions.forEach((cap) => {
      player.addRemoteTextTrack(
        {
          kind: 'subtitles',
          srclang: cap.language,
          label: cap.label,
          src: cap.src,
          default: false,
        },
        false,
      )
    })

    return () => {
      if (playerRef.current) {
        playerRef.current.dispose()
        playerRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Initialize once

  // Update source when src changes
  useEffect(() => {
    const player = playerRef.current
    if (!player) return

    const sourceObj = typeof src === 'string' ? { src, type: 'video/mp4' } : src

    if (sourceObj) {
      player.src(sourceObj)
    }
  }, [src])

  // ── Control Handlers ─────────────────────────────────────────────────

  const togglePlay = useCallback(() => {
    const player = playerRef.current
    if (!player) return
    if (player.paused()) player.play()
    else player.pause()
  }, [])

  const seek = useCallback(
    (time) => {
      const player = playerRef.current
      if (!player) return
      player.currentTime(Math.max(0, Math.min(time, duration)))
    },
    [duration],
  )

  const skip = useCallback(
    (seconds) => {
      const player = playerRef.current
      if (!player) return
      const newTime = player.currentTime() + seconds
      player.currentTime(Math.max(0, Math.min(newTime, duration)))
      setSkipIndicator({ side: seconds > 0 ? 'right' : 'left', seconds: Math.abs(seconds) })
      setTimeout(() => setSkipIndicator(null), 600)
    },
    [duration],
  )

  const changeVolume = useCallback((val) => {
    const player = playerRef.current
    if (!player) return
    const v = Math.max(0, Math.min(1, val))
    player.volume(v)
    if (v > 0) player.muted(false)
  }, [])

  const toggleMute = useCallback(() => {
    const player = playerRef.current
    if (!player) return
    player.muted(!player.muted())
  }, [])

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    if (document.fullscreenElement) {
      document.exitFullscreen()
      setIsFullscreen(false)
    } else {
      el.requestFullscreen()
        .then(() => setIsFullscreen(true))
        .catch(() => {})
    }
  }, [])

  const changeSpeed = useCallback((speed) => {
    const player = playerRef.current
    if (!player) return
    player.playbackRate(speed)
    setPlaybackSpeed(speed)
    setShowSpeedMenu(false)
    writeStorage('studyhub_player_speed', speed)
  }, [])

  const changeQuality = useCallback(
    (quality) => {
      const player = playerRef.current
      if (!player) return

      const currentTime = player.currentTime()
      const wasPlaying = !player.paused()

      let newSrc = null
      if (quality === 'auto') {
        // Use the highest available
        const priorities = ['1080p', '720p', '360p']
        for (const q of priorities) {
          if (variants[q]?.url) {
            newSrc = variants[q].url
            break
          }
        }
      } else if (variants[quality]?.url) {
        newSrc = variants[quality].url
      }

      if (newSrc) {
        player.src({ src: newSrc, type: 'video/mp4' })
        player.one('loadedmetadata', () => {
          player.currentTime(currentTime)
          if (wasPlaying) player.play()
        })
      }

      setActiveQuality(quality)
      setShowQualityMenu(false)
    },
    [variants],
  )

  const changeCaption = useCallback((language) => {
    const player = playerRef.current
    if (!player) return

    const tracks = player.textTracks()
    for (let i = 0; i < tracks.length; i++) {
      tracks[i].mode = tracks[i].language === language ? 'showing' : 'disabled'
    }
    setActiveCaption(language)
    setShowCaptionMenu(false)
  }, [])

  const toggleTheater = useCallback(() => {
    setTheaterMode((prev) => {
      const next = !prev
      if (onTheaterChange) onTheaterChange(next)
      return next
    })
  }, [onTheaterChange])

  const toggleLoop = useCallback(() => {
    const player = playerRef.current
    if (!player) return
    const next = !loopEnabled
    player.loop(next)
    setLoopEnabled(next)
  }, [loopEnabled])

  // ── Auto-hide controls ───────────────────────────────────────────────

  const showControlsTemporarily = useCallback(() => {
    setShowControls(true)
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current)
    controlsTimerRef.current = setTimeout(() => {
      if (playerRef.current && !playerRef.current.paused()) {
        setShowControls(false)
      }
    }, 3000)
  }, [])

  // ── Keyboard shortcuts ───────────────────────────────────────────────

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    function handleKey(e) {
      // Ignore if typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return

      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault()
          togglePlay()
          break
        case 'ArrowLeft':
          e.preventDefault()
          skip(-5)
          break
        case 'ArrowRight':
          e.preventDefault()
          skip(5)
          break
        case 'ArrowUp':
          e.preventDefault()
          changeVolume(volume + 0.1)
          break
        case 'ArrowDown':
          e.preventDefault()
          changeVolume(volume - 0.1)
          break
        case 'm':
        case 'M':
          toggleMute()
          break
        case 'f':
        case 'F':
          toggleFullscreen()
          break
        case 'c':
        case 'C':
          setShowCaptionMenu((prev) => !prev)
          break
        case 't':
        case 'T':
          toggleTheater()
          break
        case 'l':
        case 'L':
          toggleLoop()
          break
        default:
          break
      }
      showControlsTemporarily()
    }

    el.addEventListener('keydown', handleKey)
    return () => el.removeEventListener('keydown', handleKey)
  }, [
    togglePlay,
    skip,
    changeVolume,
    volume,
    toggleMute,
    toggleFullscreen,
    toggleTheater,
    toggleLoop,
    showControlsTemporarily,
  ])

  // ── Fullscreen change listener ───────────────────────────────────────

  useEffect(() => {
    function handleFsChange() {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFsChange)
    return () => document.removeEventListener('fullscreenchange', handleFsChange)
  }, [])

  // ── Double-tap to skip (mobile) ──────────────────────────────────────

  const handleVideoAreaClick = useCallback(
    (e) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return

      const x = e.clientX - rect.left
      const side = x < rect.width / 2 ? 'left' : 'right'

      if (doubleTapRef.current.timer && doubleTapRef.current.side === side) {
        // Double tap detected
        clearTimeout(doubleTapRef.current.timer)
        doubleTapRef.current.timer = null
        skip(side === 'right' ? 10 : -10)
      } else {
        // First tap — wait for second
        if (doubleTapRef.current.timer) clearTimeout(doubleTapRef.current.timer)
        doubleTapRef.current.side = side
        doubleTapRef.current.timer = setTimeout(() => {
          doubleTapRef.current.timer = null
          togglePlay()
        }, 250)
      }

      showControlsTemporarily()
    },
    [skip, togglePlay, showControlsTemporarily],
  )

  // ── Close menus on outside click ─────────────────────────────────────

  useEffect(() => {
    if (!showSpeedMenu && !showQualityMenu && !showCaptionMenu) return
    function handleClick() {
      setShowSpeedMenu(false)
      setShowQualityMenu(false)
      setShowCaptionMenu(false)
    }
    // Delay to avoid closing immediately on the click that opened it
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClick, { once: true })
    }, 50)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('click', handleClick)
    }
  }, [showSpeedMenu, showQualityMenu, showCaptionMenu])

  // ── Seek bar helpers ─────────────────────────────────────────────────

  const handleSeekBarClick = useCallback(
    (e) => {
      const bar = e.currentTarget
      const rect = bar.getBoundingClientRect()
      const pct = (e.clientX - rect.left) / rect.width
      seek(pct * duration)
    },
    [seek, duration],
  )

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0
  const bufferedPct = duration > 0 ? (buffered / duration) * 100 : 0

  // ── Available qualities ──────────────────────────────────────────────

  const availableQualities = ['auto']
  if (variants['1080p']?.url) availableQualities.push('1080p')
  if (variants['720p']?.url) availableQualities.push('720p')
  if (variants['360p']?.url) availableQualities.push('360p')

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      className={`shp-container ${theaterMode ? 'shp-theater' : ''} ${isFullscreen ? 'shp-fullscreen' : ''} ${className}`}
      onMouseMove={showControlsTemporarily}
      onMouseLeave={() => {
        if (playing) setShowControls(false)
      }}
      tabIndex={0}
      role="application"
      aria-label="Video player"
    >
      {/* Video element */}
      <div className="shp-video-wrapper" onClick={handleVideoAreaClick}>
        <div data-vjs-player>
          <video ref={videoRef} className="video-js" playsInline />
        </div>
      </div>

      {/* Loading spinner */}
      {loading && (
        <div className="shp-overlay shp-loading">
          <div className="shp-spinner" />
        </div>
      )}

      {/* Skip indicator */}
      {skipIndicator && (
        <div className={`shp-skip-indicator shp-skip-${skipIndicator.side}`}>
          {skipIndicator.side === 'left' ? '<<' : '>>'} {skipIndicator.seconds}s
        </div>
      )}

      {/* Big play button (when paused and controls visible) */}
      {!playing && !loading && showControls && (
        <button className="shp-big-play" onClick={togglePlay} aria-label="Play">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="white">
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>
      )}

      {/* Controls bar */}
      <div className={`shp-controls ${showControls ? 'shp-controls-visible' : ''}`}>
        {/* Seek bar */}
        <div
          className="shp-seek-bar"
          onClick={handleSeekBarClick}
          role="slider"
          aria-label="Seek"
          aria-valuenow={Math.round(currentTime)}
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
        >
          <div className="shp-seek-buffered" style={{ width: `${bufferedPct}%` }} />
          <div className="shp-seek-progress" style={{ width: `${progressPct}%` }}>
            <div className="shp-seek-thumb" />
          </div>
        </div>

        <div className="shp-controls-row">
          {/* Left controls */}
          <div className="shp-controls-left">
            <button
              className="shp-btn"
              onClick={togglePlay}
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {playing ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            {/* Volume */}
            <button
              className="shp-btn"
              onClick={toggleMute}
              aria-label={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted || volume === 0 ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                </svg>
              )}
            </button>

            <input
              type="range"
              className="shp-volume-slider"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={(e) => changeVolume(parseFloat(e.target.value))}
              aria-label="Volume"
            />

            {/* Time display */}
            <span className="shp-time">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          {/* Right controls */}
          <div className="shp-controls-right">
            {/* Speed */}
            <div className="shp-menu-anchor">
              <button
                className="shp-btn shp-btn-text"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowSpeedMenu(!showSpeedMenu)
                  setShowQualityMenu(false)
                  setShowCaptionMenu(false)
                }}
                aria-label="Playback speed"
              >
                {playbackSpeed}x
              </button>
              {showSpeedMenu && (
                <div className="shp-popup-menu" onClick={(e) => e.stopPropagation()}>
                  <div className="shp-menu-title">Speed</div>
                  {SPEEDS.map((s) => (
                    <button
                      key={s}
                      className={`shp-menu-item ${s === playbackSpeed ? 'shp-menu-active' : ''}`}
                      onClick={() => changeSpeed(s)}
                    >
                      {s === 1 ? 'Normal' : `${s}x`}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Quality */}
            {availableQualities.length > 1 && (
              <div className="shp-menu-anchor">
                <button
                  className="shp-btn shp-btn-text"
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowQualityMenu(!showQualityMenu)
                    setShowSpeedMenu(false)
                    setShowCaptionMenu(false)
                  }}
                  aria-label="Video quality"
                >
                  {activeQuality === 'auto' ? 'Auto' : activeQuality}
                </button>
                {showQualityMenu && (
                  <div className="shp-popup-menu" onClick={(e) => e.stopPropagation()}>
                    <div className="shp-menu-title">Quality</div>
                    {availableQualities.map((q) => (
                      <button
                        key={q}
                        className={`shp-menu-item ${q === activeQuality ? 'shp-menu-active' : ''}`}
                        onClick={() => changeQuality(q)}
                      >
                        {q === 'auto' ? 'Auto' : q}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Captions */}
            {captions.length > 0 && (
              <div className="shp-menu-anchor">
                <button
                  className="shp-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowCaptionMenu(!showCaptionMenu)
                    setShowSpeedMenu(false)
                    setShowQualityMenu(false)
                  }}
                  aria-label="Captions"
                  style={activeCaption !== 'off' ? { color: 'var(--sh-brand)' } : undefined}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 4H5c-1.11 0-2 .9-2 2v12c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-8 7H9.5v-.5h-2v3h2V13H11v1c0 .55-.45 1-1 1H7c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1zm7 0h-1.5v-.5h-2v3h2V13H18v1c0 .55-.45 1-1 1h-3c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1z" />
                  </svg>
                </button>
                {showCaptionMenu && (
                  <div className="shp-popup-menu" onClick={(e) => e.stopPropagation()}>
                    <div className="shp-menu-title">Captions</div>
                    <button
                      className={`shp-menu-item ${activeCaption === 'off' ? 'shp-menu-active' : ''}`}
                      onClick={() => changeCaption('off')}
                    >
                      Off
                    </button>
                    {captions.map((cap) => (
                      <button
                        key={cap.language}
                        className={`shp-menu-item ${activeCaption === cap.language ? 'shp-menu-active' : ''}`}
                        onClick={() => changeCaption(cap.language)}
                      >
                        {cap.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Loop */}
            <button
              className="shp-btn"
              onClick={toggleLoop}
              aria-label={loopEnabled ? 'Disable loop' : 'Enable loop'}
              style={loopEnabled ? { color: 'var(--sh-brand)' } : undefined}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" />
              </svg>
            </button>

            {/* Theater mode */}
            <button
              className="shp-btn"
              onClick={toggleTheater}
              aria-label={theaterMode ? 'Exit theater mode' : 'Theater mode'}
            >
              {theaterMode ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 11h-8v6h8v-6zm4 8V5c0-1.1-.9-2-2-2H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2zm-2 .02H3V4.98h18v14.04z" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 7H5v10h14V7zm4 12V5c0-1.1-.9-2-2-2H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2zm-2 .02H3V4.98h18v14.04z" />
                </svg>
              )}
            </button>

            {/* Fullscreen */}
            <button
              className="shp-btn"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Utility ──────────────────────────────────────────────────────────────

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}
