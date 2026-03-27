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
import {
  clearStoredSession,
  getStoredUser,
  logoutSession,
  setStoredUser,
} from './session'

export const SESSION_EXPIRED_FLAG = 'studyhub:session-expired'

const SessionContext = createContext(null)
const runTransition = typeof startTransition === 'function'
  ? startTransition
  : (callback) => callback()

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
      error: getApiErrorMessage(data, 'Access is temporarily restricted. Please refresh and try again.'),
    }
  }

  if (!response.ok) {
    throw new Error(getApiErrorMessage(data, 'Could not refresh your session.'))
  }

  return { status: 'authenticated', user: data, error: '' }
}

function SessionExpiredModal({ visible, onDismiss }) {
  useEffect(() => {
    if (!visible) return undefined
    const handleKey = (e) => { if (e.key === 'Escape') onDismiss('/') }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [visible, onDismiss])

  if (!visible) return null

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        background: 'rgba(15, 23, 42, 0.5)',
        display: 'grid', placeItems: 'center', padding: 24,
      }}
      onClick={() => onDismiss('/')}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Session expired"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--sh-surface, #fff)',
          border: '1px solid var(--sh-border, #e2e8f0)',
          borderRadius: 18, padding: 28,
          width: '100%', maxWidth: 400,
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.2)',
          fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        }}
      >
        <h2 style={{ margin: '0 0 8px', fontSize: 18, color: 'var(--sh-heading, #0f172a)' }}>
          Your session has expired
        </h2>
        <p style={{ margin: '0 0 20px', fontSize: 13, lineHeight: 1.6, color: 'var(--sh-muted, #64748b)' }}>
          For your security, your session ended. Please sign in again to continue.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={() => onDismiss('/')}
            style={{
              padding: '9px 16px', borderRadius: 10,
              border: '1px solid var(--sh-border, #e2e8f0)',
              background: 'var(--sh-surface, #fff)',
              color: 'var(--sh-muted, #64748b)',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Go to Home
          </button>
          <button
            type="button"
            onClick={() => onDismiss('/login')}
            style={{
              padding: '9px 16px', borderRadius: 10, border: 'none',
              background: 'linear-gradient(135deg, #6366f1, #818cf8)',
              color: '#fff',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Sign in again
          </button>
        </div>
      </div>
    </div>
  )
}

export function SessionProvider({ children }) {
  const [user, setUser] = useState(() => getStoredUser())
  const [status, setStatus] = useState('bootstrapping')
  const [error, setError] = useState('')
  const [sessionExpiredVisible, setSessionExpiredVisible] = useState(false)
  const bootstrappedRef = useRef(false)
  const navigate = useNavigate()

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
      try { sessionStorage.setItem(SESSION_EXPIRED_FLAG, '1') } catch { /* private mode */ }
      clearSession()
      setSessionExpiredVisible(true)
    }

    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, handleAuthExpired)
    return () => {
      window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, handleAuthExpired)
    }
  }, [clearSession])

  // Best-effort logout on tab close / page exit
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    if (status !== 'authenticated') return undefined

    const handlePageHide = () => {
      navigator.sendBeacon(`${API}/api/auth/logout`)
      clearStoredSession()
    }

    window.addEventListener('pagehide', handlePageHide)
    return () => {
      window.removeEventListener('pagehide', handlePageHide)
    }
  }, [status])

  const completeAuthentication = useCallback((nextUser) => {
    /* Use flushSync so state is committed synchronously before the caller
       navigates — prevents a race where the target page renders before
       the session context is updated (crashes on mobile/tablet). */
    flushSync(() => {
      syncUser(nextUser)
      setStatus('authenticated')
      setError('')
    })
  }, [syncUser])

  const signOut = useCallback(async () => {
    await logoutSession()
    clearSession()
  }, [clearSession])

  const dismissSessionExpired = useCallback((path) => {
    setSessionExpiredVisible(false)
    navigate(path, { replace: true })
  }, [navigate])

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
      <SessionExpiredModal visible={sessionExpiredVisible} onDismiss={dismissSessionExpired} />
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
