// src/lib/mobile/nativeToken.js
// Bearer-token storage for the Capacitor native shell.
//
// On web, this module is a no-op: the JWT lives in an HttpOnly cookie
// (`studyhub_session`) and the browser attaches it automatically.
//
// On native (Android/iOS via Capacitor), the WebView origin differs from the
// Railway backend origin, so cookies are unreliable. We store the raw JWT here
// and `http.js` attaches it as `Authorization: Bearer <token>` on every API
// request. The token is persisted in the WebView's sandboxed localStorage
// (per-app on Android, per-app on iOS; cleared on app uninstall).

import { isNativePlatform } from './detectMobile'

const TOKEN_STORAGE_KEY = 'sh_native_token'

/** Returns the stored bearer token, or '' if missing or not on native. */
export function getNativeToken() {
  if (!isNativePlatform()) return ''
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

/** Persists the bearer token. No-op on web. */
export function setNativeToken(token) {
  if (!isNativePlatform()) return
  try {
    if (typeof token === 'string' && token.length > 0) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token)
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY)
    }
  } catch {
    /* private mode / quota */
  }
}

/** Removes the bearer token. Safe to call on web (no-op). */
export function clearNativeToken() {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY)
  } catch {
    /* private mode / quota */
  }
}

/**
 * Shape of the auth-response `user` object sent by the backend to mobile
 * clients. Pulls out `authToken` (if present) and stores it. Returns the
 * user payload with `authToken` stripped so callers can persist the user
 * record without leaking the token into the user-cache.
 */
export function extractAndStoreNativeToken(userPayload) {
  if (!userPayload || typeof userPayload !== 'object') return userPayload
  if (!isNativePlatform()) return userPayload

  const { authToken, ...userWithoutToken } = userPayload
  if (typeof authToken === 'string' && authToken.length > 0) {
    setNativeToken(authToken)
  }
  return userWithoutToken
}
