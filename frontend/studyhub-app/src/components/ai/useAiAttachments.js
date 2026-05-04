/* ═══════════════════════════════════════════════════════════════════════════
 * useAiAttachments.js — Shared upload pipeline for the Hub AI composer.
 *
 * Owns the attachment list state plus the XHR upload flow with progress
 * + Idempotency-Key header. Used by both the file-picker button and the
 * drag-drop zone so dropped files take the same code path as picked
 * files.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useCallback, useState } from 'react'
import { API } from '../../config'

const MAX_FILES = 5
const MAX_BYTES_CLIENT = 50 * 1024 * 1024
const STALL_MS = 60_000

function fileExt(name) {
  const i = (name || '').lastIndexOf('.')
  return i >= 0 ? name.slice(i + 1).toUpperCase() : ''
}

function uuidV4() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function uploadOne(file, onProgress) {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append('file', file)

    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API}/api/ai/attachments`, true)
    xhr.withCredentials = true
    xhr.setRequestHeader('Idempotency-Key', uuidV4())

    let reachedQuarter = false
    const stallTimer = setTimeout(() => {
      if (!reachedQuarter) {
        try {
          xhr.abort()
        } catch {
          /* ignore */
        }
        reject(new Error('Upload stalled — try again'))
      }
    }, STALL_MS)

    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return
      const pct = Math.round((e.loaded / e.total) * 100)
      if (pct >= 25) reachedQuarter = true
      onProgress(pct)
    }
    xhr.onerror = () => {
      clearTimeout(stallTimer)
      reject(new Error('Network error'))
    }
    xhr.onabort = () => {
      clearTimeout(stallTimer)
      reject(new Error('Upload aborted'))
    }
    xhr.onload = () => {
      clearTimeout(stallTimer)
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText))
        } catch {
          reject(new Error('Bad server response'))
        }
      } else {
        let msg = 'Upload failed'
        try {
          const body = JSON.parse(xhr.responseText)
          if (body && body.error) msg = body.error
        } catch {
          /* ignore */
        }
        reject(new Error(msg))
      }
    }

    xhr.send(form)
  })
}

/**
 * @returns {{
 *   attachments: Array,
 *   addFiles: (files: FileList | File[]) => void,
 *   removeAttachment: (localId: string) => void,
 *   clear: () => void,
 *   atMax: boolean,
 *   anyUploading: boolean,
 * }}
 */
export function useAiAttachments() {
  const [attachments, setAttachments] = useState([])

  const addFiles = useCallback((files) => {
    const arr = Array.from(files || [])
    if (arr.length === 0) return

    let seedsToUpload = []
    setAttachments((prev) => {
      const remaining = MAX_FILES - prev.length
      const toProcess = arr.slice(0, remaining).filter((f) => f.size <= MAX_BYTES_CLIENT)
      const seeds = toProcess.map((file) => ({
        localId: uuidV4(),
        file,
        name: file.name,
        ext: fileExt(file.name),
        bytes: file.size,
        mimeType: file.type,
        status: 'uploading',
        progress: 0,
      }))
      seedsToUpload = seeds
      return [...prev, ...seeds]
    })

    // React 19 StrictMode invokes state updaters twice in dev, so any side
    // effect inside the updater would fire two XHRs per file. Kick off uploads
    // here, after the updater has committed, using the seeds that ended up in
    // state.
    for (const seed of seedsToUpload) {
      uploadOne(seed.file, (pct) => {
        setAttachments((current) =>
          current.map((a) => (a.localId === seed.localId ? { ...a, progress: pct } : a)),
        )
      })
        .then((row) => {
          setAttachments((current) =>
            current.map((a) =>
              a.localId === seed.localId
                ? {
                    ...a,
                    status: 'done',
                    progress: 100,
                    attachmentId: row.id ?? row.attachmentId,
                    pageCount: row.pageCount,
                  }
                : a,
            ),
          )
        })
        .catch((err) => {
          setAttachments((current) =>
            current.map((a) =>
              a.localId === seed.localId ? { ...a, status: 'error', error: err.message } : a,
            ),
          )
        })
    }
  }, [])

  const removeAttachment = useCallback((localId) => {
    setAttachments((prev) => prev.filter((a) => a.localId !== localId))
  }, [])

  const clear = useCallback(() => setAttachments([]), [])

  return {
    attachments,
    addFiles,
    removeAttachment,
    clear,
    atMax: attachments.length >= MAX_FILES,
    anyUploading: attachments.some((a) => a.status === 'uploading'),
  }
}

export const AI_ATTACHMENT_MAX_FILES = MAX_FILES
export const AI_ATTACHMENT_MAX_BYTES = MAX_BYTES_CLIENT
