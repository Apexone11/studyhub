import { API } from '../config'
import {
  clearStoredSession,
  getCachedCsrfToken,
  getStoredUser,
  setCachedCsrfToken,
  setStoredUser,
} from './session'
import { isNativePlatform } from './mobile/detectMobile'
import { getNativeToken } from './mobile/nativeToken'

let fetchShimInstalled = false
export const AUTH_SESSION_EXPIRED_EVENT = 'studyhub:auth-expired'

/* Debounce auth-expired events so multiple simultaneous 401s
   (e.g. feed + leaderboard + comments) don't flood the user. */
let lastExpiredDispatch = 0
const EXPIRED_DEBOUNCE_MS = 2000

function dispatchAuthExpired() {
  const now = Date.now()
  if (now - lastExpiredDispatch < EXPIRED_DEBOUNCE_MS) return
  lastExpiredDispatch = now
  clearStoredSession()
  window.dispatchEvent(new CustomEvent(AUTH_SESSION_EXPIRED_EVENT))
}

const AUTH_ERROR_CODES = new Set(['AUTH_REQUIRED', 'AUTH_EXPIRED'])

/**
 * Only trigger auth-expired logout if the user actually had an active session.
 * 401s from optional-auth endpoints (for-you, search, etc.) should not log out
 * users who are genuinely authenticated -- those endpoints return 401 when
 * req.user is not set, which can happen transiently.
 */
function handlePossibleAuthExpiry(response) {
  // Only log out if the user currently has a stored session.
  // If there's no stored user, 401 is expected (not logged in).
  if (!getStoredUser()) return

  // Check for explicit session-expired header from backend
  const expiredHeader = response.headers.get('X-Session-Expired')
  if (expiredHeader === 'true') {
    dispatchAuthExpired()
    return
  }

  // For /api/users/me endpoint, 401 definitively means session expired
  const url = typeof response.url === 'string' ? response.url : ''
  if (url.includes('/api/users/me') || url.includes('/api/auth/')) {
    dispatchAuthExpired()
    return
  }

  // For other endpoints, don't auto-logout -- the 401 might be from
  // an optional-auth endpoint where the cookie wasn't sent or expired
  // but the user's local session state is still valid.
}

export async function readJsonSafely(response, fallback = {}) {
  try {
    return await response.json()
  } catch {
    return fallback
  }
}

export function isAuthSessionFailure(response, data = {}) {
  return response.status === 401 || AUTH_ERROR_CODES.has(data?.code)
}

export function isEmailNotVerifiedError(data) {
  return data?.code === 'EMAIL_NOT_VERIFIED'
}

export function getApiErrorMessage(data, fallback) {
  if (typeof data?.error === 'string' && data.error.trim()) {
    return data.error.trim()
  }
  return fallback
}

export function installApiFetchShim() {
  if (fetchShimInstalled || typeof window === 'undefined') return

  const nativeFetch = window.fetch.bind(window)
  let csrfBootstrapPromise = null

  function getRequestMethod(input, init) {
    if (init?.method) return String(init.method).toUpperCase()
    if (input instanceof Request) return input.method.toUpperCase()
    return 'GET'
  }

  function isMutationRequest(method) {
    return !['GET', 'HEAD', 'OPTIONS'].includes(method)
  }

  async function getOrBootstrapCsrfToken() {
    const storedUser = getStoredUser()
    if (!storedUser) return ''
    if (getCachedCsrfToken()) return getCachedCsrfToken()
    if (csrfBootstrapPromise) return csrfBootstrapPromise

    // Inner fetch bypasses the window.fetch wrapper to avoid recursion. On
    // native we still need the bearer header, otherwise /api/auth/me returns
    // 401 and the CSRF token never loads.
    const bootstrapHeaders = { 'Content-Type': 'application/json' }
    if (isNativePlatform()) {
      bootstrapHeaders['X-Client'] = 'mobile'
      const nativeToken = getNativeToken()
      if (nativeToken) {
        bootstrapHeaders.Authorization = `Bearer ${nativeToken}`
      }
    }

    csrfBootstrapPromise = nativeFetch(`${API}/api/auth/me`, {
      credentials: 'include',
      headers: bootstrapHeaders,
    })
      .then(async (response) => {
        const data = await readJsonSafely(response, {})

        if (isAuthSessionFailure(response, data)) {
          clearStoredSession()
          return ''
        }
        if (response.status === 403) {
          return ''
        }
        if (!response.ok) return ''

        const user = data
        setStoredUser(user)
        const csrfToken = user?.csrfToken || ''
        setCachedCsrfToken(csrfToken)
        return csrfToken
      })
      .catch(() => '')
      .finally(() => {
        csrfBootstrapPromise = null
      })

    return csrfBootstrapPromise
  }

  const isNative = isNativePlatform()

  window.fetch = async (input, init) => {
    const requestUrl = typeof input === 'string' ? input : input?.url
    const shouldIncludeCredentials = typeof requestUrl === 'string' && requestUrl.startsWith(API)

    if (!shouldIncludeCredentials) {
      return nativeFetch(input, init)
    }

    const nextInit = { ...init, credentials: 'include' }
    const method = getRequestMethod(input, init)

    const needsHeaderMutation = isNative || isMutationRequest(method)
    if (needsHeaderMutation) {
      const headers = new Headers(input instanceof Request ? input.headers : init?.headers)

      // Native (Capacitor) path: the WebView origin differs from the Railway
      // backend origin, so the `studyhub_session` cookie cannot be relied on.
      // Every API call carries an `Authorization: Bearer <jwt>` header backed
      // by the token we persisted at login. The `X-Client: mobile` header
      // signals the backend to include a fresh `authToken` on auth responses
      // so we can keep refreshing the stored token transparently.
      if (isNative) {
        headers.set('X-Client', 'mobile')
        const nativeToken = getNativeToken()
        if (nativeToken && !headers.has('Authorization')) {
          headers.set('Authorization', `Bearer ${nativeToken}`)
        }
      }

      if (isMutationRequest(method)) {
        headers.set('X-Requested-With', 'XMLHttpRequest')

        let csrfToken = getCachedCsrfToken()
        if (!csrfToken && getStoredUser()) {
          csrfToken = await getOrBootstrapCsrfToken()
        }
        if (csrfToken && !headers.has('X-CSRF-Token')) {
          headers.set('X-CSRF-Token', csrfToken)
        }
      }

      nextInit.headers = headers
    }

    if (input instanceof Request) {
      const response = await nativeFetch(new Request(input, nextInit))
      if (response.status === 401) {
        handlePossibleAuthExpiry(response)
      }
      return response
    }

    const response = await nativeFetch(input, nextInit)
    if (response.status === 401) {
      handlePossibleAuthExpiry(response)
    }
    return response
  }

  fetchShimInstalled = true
}
