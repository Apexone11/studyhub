/**
 * Frontend wrappers for the group media endpoints added in Phase 4.
 *
 *   GET  /api/study-groups/:groupId/resources/media-quota
 *   POST /api/study-groups/:groupId/resources/upload   (multipart/form-data)
 *   PATCH /api/study-groups/:groupId                   (background fields)
 *
 * Each call sends credentials and throws a human-readable Error on
 * non-2xx responses so callers can route errors through showToast.
 */
import { API } from '../../config'
import { authHeaders } from '../shared/pageUtils'
import { getApiErrorMessage, readJsonSafely } from '../../lib/http'

export async function fetchGroupMediaQuota(groupId) {
  const response = await fetch(`${API}/api/study-groups/${groupId}/resources/media-quota`, {
    credentials: 'include',
    headers: authHeaders(),
  })
  const data = await readJsonSafely(response, {})
  if (!response.ok) {
    throw new Error(getApiErrorMessage(data, 'Could not load media quota.'))
  }
  return data
}

/**
 * Upload a single file to POST /resources/upload. Returns the media
 * metadata the caller can then attach to a resource row or discussion
 * post: { url, mime, bytes, kind, originalName }.
 *
 * Throws an Error on non-2xx. On 429 the thrown error has a `.quota`
 * property carrying the quota snapshot so the caller can show an
 * "upgrade to pro" CTA with the right numbers.
 *
 * `onProgress` is an optional (0..1) callback driven by XHR, used to
 * show a progress bar in the composer during large uploads.
 */
export function uploadGroupMedia(groupId, file, { onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append('file', file)

    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API}/api/study-groups/${groupId}/resources/upload`, true)
    xhr.withCredentials = true

    if (typeof onProgress === 'function') {
      xhr.upload.addEventListener('progress', (event) => {
        if (!event.lengthComputable) return
        onProgress(event.loaded / event.total)
      })
    }

    xhr.addEventListener('load', () => {
      let payload = {}
      try {
        payload = JSON.parse(xhr.responseText || '{}')
      } catch { /* ignore */ }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(payload)
        return
      }

      const error = new Error(payload?.error || `Upload failed (${xhr.status}).`)
      if (xhr.status === 429) {
        error.quota = {
          quota: payload?.quota,
          used: payload?.used,
          plan: payload?.plan,
          resetsAt: payload?.resetsAt,
        }
      }
      error.status = xhr.status
      reject(error)
    })

    xhr.addEventListener('error', () => reject(new Error('Network error during upload.')))
    xhr.addEventListener('abort', () => reject(new Error('Upload cancelled.')))

    xhr.send(form)
  })
}

export async function updateGroupBackground(groupId, { backgroundUrl, backgroundCredit }) {
  const body = {}
  if (backgroundUrl !== undefined) body.backgroundUrl = backgroundUrl
  if (backgroundCredit !== undefined) body.backgroundCredit = backgroundCredit

  const response = await fetch(`${API}/api/study-groups/${groupId}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: authHeaders(),
    body: JSON.stringify(body),
  })
  const data = await readJsonSafely(response, {})
  if (!response.ok) {
    throw new Error(getApiErrorMessage(data, 'Could not update group background.'))
  }
  return data
}
