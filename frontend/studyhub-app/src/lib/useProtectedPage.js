import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from './session-context'

/**
 * Shared hook for all authenticated pages.
 * - On 'unauthorized': clears session and redirects to /login
 * - On 'recoverable-error': returns cached user + error message (backend slow / 5xx)
 * - On 'ready': returns fresh user data
 *
 * Usage:
 *   const { status, user, error } = useProtectedPage()
 *   if (status === 'loading') return <LoadingShell />
 */
export function useProtectedPage() {
  const navigate = useNavigate()
  const { user, error, isBootstrapping, isAuthenticated } = useSession()

  useEffect(() => {
    if (!isBootstrapping && !isAuthenticated) {
      navigate('/login', { replace: true })
    }
  }, [isAuthenticated, isBootstrapping, navigate])

  return useMemo(() => {
    if (isBootstrapping) {
      return { status: 'loading', user: null, error: '' }
    }

    if (!isAuthenticated || !user) {
      return { status: 'unauthorized', user: null, error: '' }
    }

    return {
      status: error ? 'recoverable-error' : 'ready',
      user,
      error,
    }
  }, [error, isAuthenticated, isBootstrapping, user])
}
