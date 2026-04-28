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
import { getCachedCsrfToken, setCachedCsrfToken, getStoredUser } from '../../lib/session'
import { isNativePlatform } from '../../lib/mobile/detectMobile'
import { getNativeToken } from '../../lib/mobile/nativeToken'

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
 * Resolve the cached CSRF token, bootstrapping via /api/auth/me if absent.
 * Mirrors the logic in the window.fetch shim (lib/http.js) so XHR uploads
 * carry the same auth fingerprint as fetch-based mutations. Without this,
 * the server's CSRF middleware rejects FormData uploads with 403.
 */
async function resolveCsrfToken() {
  const cached = getCachedCsrfToken()
  if (cached) return cached
  if (!getStoredUser()) return ''

  // Use the global fetch — the shim itself is allowed to recurse here on
  // GET requests because the mutation guard skips them.
  try {
    const bootstrapHeaders = { 'Content-Type': 'application/json' }
    if (isNativePlatform()) {
      bootstrapHeaders['X-Client'] = 'mobile'
      const nativeToken = getNativeToken()
      if (nativeToken) bootstrapHeaders.Authorization = `Bearer ${nativeToken}`
    }
    const response = await fetch(`${API}/api/auth/me`, {
      credentials: 'include',
      headers: bootstrapHeaders,
    })
    if (!response.ok) return ''
    const data = await readJsonSafely(response, {})
    const token = typeof data?.csrfToken === 'string' ? data.csrfToken : ''
    if (token) setCachedCsrfToken(token)
    return token
  } catch {
    return ''
  }
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
export async function uploadGroupMedia(groupId, file, { onProgress, signal } = {}) {
  // Resolve CSRF up front so the XHR sends the same X-CSRF-Token header that
  // the window.fetch shim auto-injects on JSON mutations. Skipping this is
  // why the server returned 403 "Missing CSRF token." on banner uploads.
  const csrfToken = await resolveCsrfToken()
  const native = isNativePlatform()
  const nativeToken = native ? getNativeToken() : ''

  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append('file', file)

    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API}/api/study-groups/${groupId}/resources/upload`, true)
    xhr.withCredentials = true

    // Match the fetch-shim header surface so the backend treats this XHR
    // exactly the same as a fetch-based mutation request.
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest')
    if (csrfToken) xhr.setRequestHeader('X-CSRF-Token', csrfToken)
    if (native) {
      xhr.setRequestHeader('X-Client', 'mobile')
      if (nativeToken) xhr.setRequestHeader('Authorization', `Bearer ${nativeToken}`)
    }

    if (signal) {
      if (signal.aborted) {
        reject(new Error('Upload cancelled.'))
        return
      }
      signal.addEventListener('abort', () => xhr.abort(), { once: true })
    }

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
      } catch {
        /* ignore */
      }

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
