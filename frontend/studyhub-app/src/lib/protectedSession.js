import { API } from '../config'
import { getApiErrorMessage, isAuthSessionFailure, readJsonSafely } from './http'
import { clearStoredSession, getStoredUser, setStoredUser } from './session'

export function authJsonHeaders() {
  return {
    'Content-Type': 'application/json',
  }
}

export function isAuthFailureStatus(status, data = {}) {
  return status === 401 || data?.code === 'AUTH_REQUIRED' || data?.code === 'AUTH_EXPIRED'
}

export async function syncProtectedUser() {
  const storedUser = getStoredUser()
  if (!storedUser) {
    return { status: 'unauthorized', user: null, error: '' }
  }

  try {
    const response = await fetch(`${API}/api/auth/me`, {
      headers: authJsonHeaders(),
      credentials: 'include',
    })
    const data = response.ok
      ? await readJsonSafely(response, null)
      : await readJsonSafely(response, {})

    if (isAuthSessionFailure(response, data) || isAuthFailureStatus(response.status, data)) {
      clearStoredSession()
      return { status: 'unauthorized', user: null, error: '' }
    }
    if (!response.ok) {
      return {
        status: 'recoverable-error',
        user: storedUser,
        error: getApiErrorMessage(data, 'Could not refresh your session. Showing cached data.'),
      }
    }

    const user = data
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
