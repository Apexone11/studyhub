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
import { flushSync } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { API } from '../config'
import {
  AUTH_SESSION_EXPIRED_EVENT,
  getApiErrorMessage,
  isAuthSessionFailure,
  readJsonSafely,
} from './http'
import { clearStoredSession, getStoredUser, logoutSession, setStoredUser } from './session'
import { extractAndStoreNativeToken } from './mobile/nativeToken'

export const SESSION_EXPIRED_FLAG = 'studyhub:session-expired'

const SessionContext = createContext(null)
const runTransition =
  typeof startTransition === 'function' ? startTransition : (callback) => callback()

async function fetchSessionUser() {
  const response = await fetch(`${API}/api/auth/me`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
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
      error: getApiErrorMessage(
        data,
        'Access is temporarily restricted. Please refresh and try again.',
      ),
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
  const navigate = useNavigate()

  const syncUser = useCallback((nextUser) => {
    // On the Capacitor native shell the backend includes an `authToken` field
    // in auth responses (see auth.service.js issueAuthenticatedSession). Pull
    // it out and persist it for bearer-auth, then store the user record with
    // the token stripped so the cached user object never contains secrets.
    const cleanUser = extractAndStoreNativeToken(nextUser)
    setStoredUser(cleanUser)
    setUser(cleanUser)
    return cleanUser
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
            setError(
              result.error || 'Access is temporarily restricted. Some actions may be unavailable.',
            )
          } else {
            setStatus('unauthenticated')
            setError(result.error || 'Access is temporarily restricted.')
          }
          return
        }

        // syncUser strips any `authToken` field and stores it for bearer-auth
        // on native, then caches the user record locally.
        syncUser(result.user)
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
  }, [user, syncUser])

  useEffect(() => {
    if (bootstrappedRef.current) return
    bootstrappedRef.current = true
    void refreshSession()
  }, [refreshSession])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const handleAuthExpired = () => {
      try {
        sessionStorage.setItem(SESSION_EXPIRED_FLAG, '1')
      } catch {
        /* private mode */
      }
      clearSession()
      // Redirect to login with a flag instead of showing a modal overlay.
      // The login page reads this flag and displays the expired-session message.
      navigate('/login?expired=1', { replace: true })
    }

    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, handleAuthExpired)
    return () => {
      window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, handleAuthExpired)
    }
  }, [clearSession, navigate])

  const completeAuthentication = useCallback(
    (nextUser) => {
      /* Use flushSync so state is committed synchronously before the caller
       navigates — prevents a race where the target page renders before
       the session context is updated (crashes on mobile/tablet). */
      flushSync(() => {
        syncUser(nextUser)
        setStatus('authenticated')
        setError('')
      })
    },
    [syncUser],
  )

  const signOut = useCallback(async () => {
    await logoutSession()
    clearSession()
  }, [clearSession])

  const value = useMemo(
    () => ({
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
    }),
    [clearSession, completeAuthentication, error, refreshSession, signOut, status, syncUser, user],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const context = useContext(SessionContext)

  if (!context) {
    throw new Error('useSession must be used within a SessionProvider.')
  }

  return context
}
