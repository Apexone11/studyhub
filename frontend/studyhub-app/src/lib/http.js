import { API } from '../config'
import { clearStoredSession, getStoredUser, setStoredUser } from './session'

let fetchShimInstalled = false

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
        if (response.status === 401 || response.status === 403) {
          clearStoredSession()
          return ''
        }
        if (!response.ok) return ''

        const user = await response.json()
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
      return nativeFetch(new Request(input, nextInit))
    }

    return nativeFetch(input, nextInit)
  }

  fetchShimInstalled = true
}
