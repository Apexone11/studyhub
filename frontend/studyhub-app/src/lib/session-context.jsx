import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { API } from '../config'
import {
  AUTH_SESSION_EXPIRED_EVENT,
  getApiErrorMessage,
  isAuthSessionFailure,
  readJsonSafely,
} from './http'
import {
  clearStoredSession,
  getStoredUser,
  logoutSession,
  setStoredUser,
} from './session'

const SessionContext = createContext(null)
const runTransition = typeof startTransition === 'function'
  ? startTransition
  : (callback) => callback()

async function fetchSessionUser() {
  const response = await fetch(`${API}/api/auth/me`, {
    headers: { 'Content-Type': 'application/json' },
  })

  const data = response.ok
    ? await readJsonSafely(response, null)
    : await readJsonSafely(response, {})

  if (isAuthSessionFailure(response, data)) {
    return { status: 'unauthenticated', user: null, error: '' }
  }

  if (response.status === 403) {
    return {
      status: 'forbidden',
      user: null,
      error: getApiErrorMessage(data, 'Access is temporarily restricted. Please refresh and try again.'),
    }
  }

  if (!response.ok) {
    throw new Error(getApiErrorMessage(data, 'Could not refresh your session.'))
  }

  return { status: 'authenticated', user: data, error: '' }
}

export function SessionProvider({ children }) {
  const [user, setUser] = useState(() => getStoredUser())
  const [status, setStatus] = useState('bootstrapping')
  const [error, setError] = useState('')
  const bootstrappedRef = useRef(false)

  const syncUser = useCallback((nextUser) => {
    setStoredUser(nextUser)
    setUser(nextUser)
    return nextUser
  }, [])

  const clearSession = useCallback(() => {
    clearStoredSession()
    setUser(null)
    setStatus('unauthenticated')
    setError('')
  }, [])

  const refreshSession = useCallback(async () => {
    try {
      const result = await fetchSessionUser()

      runTransition(() => {
        if (result.status === 'unauthenticated') {
          clearStoredSession()
          setUser(null)
          setStatus('unauthenticated')
          setError('')
          return
        }

        if (result.status === 'forbidden') {
          if (user) {
            setStatus('authenticated')
            setError(result.error || 'Access is temporarily restricted. Some actions may be unavailable.')
          } else {
            setStatus('unauthenticated')
            setError(result.error || 'Access is temporarily restricted.')
          }
          return
        }

        setStoredUser(result.user)
        setUser(result.user)
        setStatus('authenticated')
        setError('')
      })

      return result
    } catch {
      runTransition(() => {
        if (user) {
          setStatus('authenticated')
          setError('Could not refresh your session. Showing cached data.')
        } else {
          clearStoredSession()
          setUser(null)
          setStatus('unauthenticated')
          setError('')
        }
      })

      return {
        status: user ? 'authenticated' : 'unauthenticated',
        user,
        error: user ? 'Could not refresh your session. Showing cached data.' : '',
      }
    }
  }, [user])

  useEffect(() => {
    if (bootstrappedRef.current) return
    bootstrappedRef.current = true
    void refreshSession()
  }, [refreshSession])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const handleAuthExpired = () => {
      clearSession()
    }

    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, handleAuthExpired)
    return () => {
      window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, handleAuthExpired)
    }
  }, [clearSession])

  const completeAuthentication = useCallback((nextUser) => {
    runTransition(() => {
      syncUser(nextUser)
      setStatus('authenticated')
      setError('')
    })
  }, [syncUser])

  const signOut = useCallback(async () => {
    await logoutSession()
    clearSession()
  }, [clearSession])

  const value = useMemo(() => ({
    user,
    status,
    error,
    isBootstrapping: status === 'bootstrapping',
    isAuthenticated: status === 'authenticated' && Boolean(user),
    isUnauthenticated: status === 'unauthenticated' || (status !== 'bootstrapping' && !user),
    refreshSession,
    completeAuthentication,
    clearSession,
    setSessionUser: syncUser,
    signOut,
  }), [clearSession, completeAuthentication, error, refreshSession, signOut, status, syncUser, user])

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession() {
  const context = useContext(SessionContext)

  if (!context) {
    throw new Error('useSession must be used within a SessionProvider.')
  }

  return context
}
