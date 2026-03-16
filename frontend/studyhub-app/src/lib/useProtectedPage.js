import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { syncProtectedUser } from './protectedSession'

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
  const [authState, setAuthState] = useState({ status: 'loading', user: null, error: '' })

  useEffect(() => {
    syncProtectedUser().then(result => {
      if (result.status === 'unauthorized') {
        navigate('/login', { replace: true })
      } else {
        setAuthState(result)
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return authState
}
