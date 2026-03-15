import { API } from '../config'

let fetchShimInstalled = false

export function installApiFetchShim() {
  if (fetchShimInstalled || typeof window === 'undefined') return

  const nativeFetch = window.fetch.bind(window)

  window.fetch = (input, init) => {
    const requestUrl = typeof input === 'string' ? input : input?.url
    const shouldIncludeCredentials =
      typeof requestUrl === 'string' && requestUrl.startsWith(API)

    if (!shouldIncludeCredentials) {
      return nativeFetch(input, init)
    }

    const nextInit = { ...init, credentials: 'include' }

    if (input instanceof Request) {
      return nativeFetch(new Request(input, nextInit))
    }

    return nativeFetch(input, nextInit)
  }

  fetchShimInstalled = true
}
