import { API } from '../config'
import { clearFetchCache } from './useFetch'
import { clearStudyStatusCache } from './useStudyStatus'
import { clearNativeToken } from './mobile/nativeToken'

let inMemoryCsrfToken = ''

export const LOGGED_OUT_FLAG = 'studyhub:logged-out'

export function getStoredUser() {
  const rawUser = localStorage.getItem('user')
  if (!rawUser) return null

  try {
    const parsedUser = JSON.parse(rawUser)
    if (parsedUser && typeof parsedUser === 'object' && 'csrfToken' in parsedUser) {
      delete parsedUser.csrfToken
    }
    return parsedUser
  } catch {
    localStorage.removeItem('user')
    return null
  }
}

export function hasStoredSession() {
  return Boolean(getStoredUser())
}

export function setStoredUser(user) {
  if (!user) {
    localStorage.removeItem('user')
    return
  }

  if (typeof user.csrfToken === 'string') {
    inMemoryCsrfToken = user.csrfToken
  }

  const nextUser = { ...user }
  delete nextUser.csrfToken

  localStorage.setItem('user', JSON.stringify(nextUser))
}

export function getCachedCsrfToken() {
  return inMemoryCsrfToken
}

export function setCachedCsrfToken(token) {
  inMemoryCsrfToken = typeof token === 'string' ? token : ''
}

export function clearStoredSession() {
  inMemoryCsrfToken = ''
  localStorage.removeItem('user')
  // On the Capacitor native shell this also removes the bearer token so the
  // next request is recognized as unauthenticated. No-op on web.
  clearNativeToken()
}

export async function logoutSession() {
  try {
    await fetch(`${API}/api/auth/logout`, { method: 'POST', credentials: 'include' })
  } catch {
    // Best effort only — always clear local cached user state.
  } finally {
    clearStoredSession()
    clearFetchCache()
    clearStudyStatusCache()

    // Clear notes-hardening local data so the next user on a shared browser
    // doesn't inherit the previous user's drafts or pending offline saves.
    try {
      const { draftStore } = await import('../pages/notes/noteDraftStore.js')
      await draftStore.clearAll()
    } catch {
      /* draft store optional */
    }

    try {
      if (typeof navigator !== 'undefined' && navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_NOTES_OUTBOX' })
      }
    } catch {
      /* SW optional */
    }

    try {
      sessionStorage.setItem(LOGGED_OUT_FLAG, '1')
    } catch {
      /* private mode */
    }
  }
}
