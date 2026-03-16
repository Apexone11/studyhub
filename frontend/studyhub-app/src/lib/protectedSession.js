import { API } from '../config'
import { clearStoredSession, getStoredUser, setStoredUser } from './session'

export function authJsonHeaders() {
  return {
    'Content-Type': 'application/json',
  }
}

export function isAuthFailureStatus(status) {
  return status === 401 || status === 403
}

export async function syncProtectedUser() {
  const storedUser = getStoredUser()
  if (!storedUser) {
    return { status: 'unauthorized', user: null, error: '' }
  }

  try {
    const response = await fetch(`${API}/api/auth/me`, { headers: authJsonHeaders() })
    if (isAuthFailureStatus(response.status)) {
      clearStoredSession()
      return { status: 'unauthorized', user: null, error: '' }
    }
    if (!response.ok) {
      return {
        status: 'recoverable-error',
        user: storedUser,
        error: 'Could not refresh your session. Showing cached data.',
      }
    }

    const user = await response.json()
    setStoredUser(user)
    return { status: 'ready', user, error: '' }
  } catch {
    return {
      status: 'recoverable-error',
      user: storedUser,
      error: 'Could not refresh your session. Showing cached data.',
    }
  }
}
