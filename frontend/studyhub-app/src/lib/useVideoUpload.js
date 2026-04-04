/* ═══════════════════════════════════════════════════════════════════════════
 * useVideoUpload.js — Chunked multipart video upload hook
 *
 * Handles the full upload lifecycle:
 *   1. Init   — POST /api/video/upload/init   -> videoId, uploadId, r2Key
 *   2. Chunks — POST /api/video/upload/chunk   -> sequential 10 MB parts
 *   3. Done   — POST /api/video/upload/complete -> triggers processing
 *
 * Returns { upload, abort, reset, state } where state includes:
 *   status, progress (0-100), videoId, error
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useState, useRef, useCallback } from 'react'
import { API } from '../config'

const CHUNK_SIZE = 2 * 1024 * 1024 // 2 MB — Railway HTTP/2 proxy rejects bodies larger than ~2 MB
const MAX_VIDEO_SIZE = 500 * 1024 * 1024 // 500 MB
const ALLOWED_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime'])
const ALLOWED_EXTENSIONS = new Set(['.mp4', '.webm', '.mov'])

const STATUS = {
  IDLE: 'idle',
  VALIDATING: 'validating',
  UPLOADING: 'uploading',
  COMPLETING: 'completing',
  PROCESSING: 'processing',
  DONE: 'done',
  ERROR: 'error',
  ABORTED: 'aborted',
}

export { STATUS as UPLOAD_STATUS }

export default function useVideoUpload() {
  const [status, setStatus] = useState(STATUS.IDLE)
  const [progress, setProgress] = useState(0)
  const [videoId, setVideoId] = useState(null)
  const [error, setError] = useState(null)
  const [maxDuration, setMaxDuration] = useState(null)
  const [maxSize, setMaxSize] = useState(null)

  // Refs for abort support
  const abortRef = useRef(false)
  const uploadIdRef = useRef(null)
  const r2KeyRef = useRef(null)
  const videoIdRef = useRef(null)

  const reset = useCallback(() => {
    setStatus(STATUS.IDLE)
    setProgress(0)
    setVideoId(null)
    setError(null)
    setMaxDuration(null)
    setMaxSize(null)
    abortRef.current = false
    uploadIdRef.current = null
    r2KeyRef.current = null
    videoIdRef.current = null
  }, [])

  // ── Abort current upload ──────────────────────────────────────────────
  const abort = useCallback(async () => {
    abortRef.current = true
    setStatus(STATUS.ABORTED)

    if (uploadIdRef.current && r2KeyRef.current) {
      try {
        await fetch(`${API}/api/video/upload/abort`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            videoId: videoIdRef.current,
            uploadId: uploadIdRef.current,
            r2Key: r2KeyRef.current,
          }),
        })
      } catch {
        // Best-effort cleanup
      }
    }
  }, [])

  // ── Main upload function ──────────────────────────────────────────────
  const upload = useCallback(
    async (file, { title = '', description = '' } = {}) => {
      // Reset state
      abortRef.current = false
      setError(null)
      setProgress(0)
      setVideoId(null)
      setMaxDuration(null)
      setMaxSize(null)

      // ── Client-side validation ────────────────────────────────────────
      setStatus(STATUS.VALIDATING)

      if (!file) {
        setError('No file selected.')
        setStatus(STATUS.ERROR)
        return null
      }

      const ext = '.' + file.name.split('.').pop().toLowerCase()
      if (!ALLOWED_TYPES.has(file.type) && !ALLOWED_EXTENSIONS.has(ext)) {
        setError('Unsupported format. Use MP4, WebM, or MOV.')
        setStatus(STATUS.ERROR)
        return null
      }

      if (file.size > MAX_VIDEO_SIZE) {
        setError(`File too large. Maximum is ${MAX_VIDEO_SIZE / (1024 * 1024)} MB.`)
        setStatus(STATUS.ERROR)
        return null
      }

      if (file.size === 0) {
        setError('File is empty.')
        setStatus(STATUS.ERROR)
        return null
      }

      // ── Step 1: Init ─────────────────────────────────────────────────
      setStatus(STATUS.UPLOADING)

      let initData
      try {
        const res = await fetch(`${API}/api/video/upload/init`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type || 'video/mp4',
            title: title || file.name.replace(/\.[^.]+$/, ''),
            description,
          }),
        })

        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `Upload init failed (${res.status})`)
        }

        initData = await res.json()
      } catch (err) {
        setError(err.message)
        setStatus(STATUS.ERROR)
        return null
      }

      const { videoId: vid, uploadId, r2Key, maxDuration: dur, maxSize: size } = initData
      uploadIdRef.current = uploadId
      r2KeyRef.current = r2Key
      videoIdRef.current = vid
      setVideoId(vid)
      setMaxDuration(dur)
      setMaxSize(size)

      // ── Step 2: Upload chunks ────────────────────────────────────────
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE)
      const parts = []

      for (let i = 0; i < totalChunks; i++) {
        if (abortRef.current) return null

        const start = i * CHUNK_SIZE
        const end = Math.min(start + CHUNK_SIZE, file.size)
        const chunk = file.slice(start, end)
        const partNumber = i + 1

        // Read chunk as ArrayBuffer for raw binary upload
        const chunkBuffer = await chunk.arrayBuffer()

        let attempt = 0
        const maxRetries = 3
        let partData = null

        while (attempt < maxRetries) {
          try {
            const res = await fetch(`${API}/api/video/upload/chunk`, {
              method: 'POST',
              credentials: 'include',
              headers: {
                'x-upload-id': uploadId,
                'x-r2-key': r2Key,
                'x-part-number': String(partNumber),
                'x-video-id': String(vid),
              },
              body: chunkBuffer,
            })

            if (!res.ok) {
              const body = await res.json().catch(() => ({}))
              throw new Error(body.error || `Chunk ${partNumber} failed (${res.status})`)
            }

            partData = await res.json()
            break
          } catch (err) {
            attempt++
            if (attempt >= maxRetries) {
              setError(`Upload failed on chunk ${partNumber}: ${err.message}`)
              setStatus(STATUS.ERROR)
              // Try to abort the partial upload
              abort()
              return null
            }
            // Wait before retry with exponential backoff
            await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)))
          }
        }

        if (partData?.ETag || partData?.etag) {
          parts.push({ ETag: partData.ETag || partData.etag, PartNumber: partNumber })
        }

        // Update progress (chunks account for 90% of total progress)
        setProgress(Math.round(((i + 1) / totalChunks) * 90))
      }

      if (abortRef.current) return null

      // ── Step 3: Complete ─────────────────────────────────────────────
      setStatus(STATUS.COMPLETING)
      setProgress(95)

      try {
        const res = await fetch(`${API}/api/video/upload/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            videoId: vid,
            uploadId,
            r2Key,
            parts,
          }),
        })

        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `Upload completion failed (${res.status})`)
        }
      } catch (err) {
        setError(err.message)
        setStatus(STATUS.ERROR)
        return null
      }

      setProgress(100)
      setStatus(STATUS.PROCESSING)

      // Video is now processing server-side (transcoding, thumbnails, etc.)
      return vid
    },
    [abort],
  )

  return {
    upload,
    abort,
    reset,
    state: {
      status,
      progress,
      videoId,
      error,
      maxDuration,
      maxSize,
      isUploading: status === STATUS.UPLOADING || status === STATUS.COMPLETING,
      isProcessing: status === STATUS.PROCESSING,
      isDone: status === STATUS.DONE,
      isError: status === STATUS.ERROR,
      isIdle: status === STATUS.IDLE,
    },
  }
}
