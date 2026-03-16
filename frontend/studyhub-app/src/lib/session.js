import { API } from '../config'

export function getStoredUser() {
  const rawUser = localStorage.getItem('user')
  if (!rawUser) return null

  try {
    return JSON.parse(rawUser)
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

  const previousUser = getStoredUser()
  const nextUser =
    previousUser?.csrfToken && typeof user.csrfToken === 'undefined'
      ? { ...user, csrfToken: previousUser.csrfToken }
      : user

  localStorage.setItem('user', JSON.stringify(nextUser))
}

export function clearStoredSession() {
  localStorage.removeItem('user')
}

export async function logoutSession() {
  try {
    await fetch(`${API}/api/auth/logout`, { method: 'POST' })
  } catch {
    // Best effort only — always clear local cached user state.
  } finally {
    clearStoredSession()
  }
}
