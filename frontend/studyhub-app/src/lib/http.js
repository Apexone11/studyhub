import { API } from '../config'
import { clearStoredSession, getStoredUser, setStoredUser } from './session'

let fetchShimInstalled = false
export const AUTH_SESSION_EXPIRED_EVENT = 'studyhub:auth-expired'

const AUTH_ERROR_CODES = new Set(['AUTH_REQUIRED', 'AUTH_EXPIRED'])

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
    if (storedUser.csrfToken) return storedUser.csrfToken
    if (csrfBootstrapPromise) return csrfBootstrapPromise

    csrfBootstrapPromise = nativeFetch(`${API}/api/auth/me`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
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
        return user?.csrfToken || ''
      })
      .catch(() => '')
      .finally(() => {
        csrfBootstrapPromise = null
      })

    return csrfBootstrapPromise
  }

  window.fetch = async (input, init) => {
    const requestUrl = typeof input === 'string' ? input : input?.url
    const shouldIncludeCredentials =
      typeof requestUrl === 'string' && requestUrl.startsWith(API)

    if (!shouldIncludeCredentials) {
      return nativeFetch(input, init)
    }

    const nextInit = { ...init, credentials: 'include' }
    const method = getRequestMethod(input, init)

    if (isMutationRequest(method)) {
      const headers = new Headers(
        input instanceof Request
          ? input.headers
          : init?.headers
      )

      headers.set('X-Requested-With', 'XMLHttpRequest')

      let csrfToken = getStoredUser()?.csrfToken || ''
      if (!csrfToken && getStoredUser()) {
        csrfToken = await getOrBootstrapCsrfToken()
      }
      if (csrfToken && !headers.has('X-CSRF-Token')) {
        headers.set('X-CSRF-Token', csrfToken)
      }

      nextInit.headers = headers
    }

    if (input instanceof Request) {
      const response = await nativeFetch(new Request(input, nextInit))
      if (response.status === 401) {
        clearStoredSession()
        window.dispatchEvent(new CustomEvent(AUTH_SESSION_EXPIRED_EVENT))
      }
      return response
    }

    const response = await nativeFetch(input, nextInit)
    if (response.status === 401) {
      clearStoredSession()
      window.dispatchEvent(new CustomEvent(AUTH_SESSION_EXPIRED_EVENT))
    }
    return response
  }

  fetchShimInstalled = true
}
