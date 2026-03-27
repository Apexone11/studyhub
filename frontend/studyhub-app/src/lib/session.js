import { API } from '../config'

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
}

export async function logoutSession() {
  try {
    await fetch(`${API}/api/auth/logout`, { method: 'POST' })
  } catch {
    // Best effort only — always clear local cached user state.
  } finally {
    clearStoredSession()
    try { sessionStorage.setItem(LOGGED_OUT_FLAG, '1') } catch { /* private mode */ }
  }
}
