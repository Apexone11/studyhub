// src/mobile/components/MobileGoogleButton.jsx
// Google Sign-In button for the Capacitor native shell.
//
// On native (Android/iOS), uses `@codetrix-studio/capacitor-google-auth` so
// Google's account chooser opens inside the app — no redirect to Chrome, no
// return trip to localhost. The plugin returns an ID token which we post to
// the existing `POST /api/auth/google` endpoint; the bearer-token fetch shim
// (http.js) reads the returned `authToken` on our behalf.
//
// On web fallback (running the same codebase in dev mode), the button falls
// back to the redirect flow so developers can still test sign-in without the
// native plugin loaded.

import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GOOGLE_CLIENT_ID, API } from '../../config'
import { buildGoogleOAuthUrl } from '../../components/googleSignInHelpers'
import { isNativePlatform } from '../../lib/mobile/detectMobile'
import { useSession } from '../../lib/session-context'
import { CURRENT_LEGAL_VERSION } from '../../lib/legalVersions'

/** Google "G" logo as inline SVG */
function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  )
}

/**
 * Lazy-loads the native plugin only when actually running in Capacitor. This
 * prevents the web dev bundle from failing to resolve the plugin when it is
 * not installed or when running in a browser tab.
 */
async function signInWithGoogleNative() {
  const mod = await import('@codetrix-studio/capacitor-google-auth')
  const { GoogleAuth } = mod
  // `initialize` is idempotent but cheap; calling it before each signIn keeps
  // the client ID in sync if it ever changes at runtime.
  await GoogleAuth.initialize({
    clientId: GOOGLE_CLIENT_ID,
    scopes: ['profile', 'email'],
    grantOfflineAccess: false,
  })
  const result = await GoogleAuth.signIn()
  const idToken = result?.authentication?.idToken
  if (!idToken) throw new Error('Google did not return an identity token.')
  return idToken
}

/**
 * @param {object} props
 * @param {'signin' | 'signup'} [props.mode='signin']
 */
export default function MobileGoogleButton({ mode = 'signin' }) {
  const navigate = useNavigate()
  const { completeAuthentication } = useSession()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleNativeSignIn = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const idToken = await signInWithGoogleNative()

      const res = await fetch(`${API}/api/auth/google`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client': 'mobile',
        },
        credentials: 'include',
        body: JSON.stringify({ credential: idToken }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Google sign-in failed.')
        return
      }

      // Existing user → straight to home (or onboarding if unfinished).
      if (data.user) {
        completeAuthentication(data.user)
        navigate(data.user?.onboardingCompleted ? '/m/home' : '/m/onboarding/goals', {
          replace: true,
        })
        return
      }

      // New user → backend wants a role selection. For mobile we default to
      // `student`, consistent with the email signup flow; users can switch
      // role later from Settings. Complete the account creation in one step.
      if (data.status === 'needs_role' && data.tempToken) {
        const completeRes = await fetch(`${API}/api/auth/google/complete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Client': 'mobile',
          },
          credentials: 'include',
          body: JSON.stringify({
            tempToken: data.tempToken,
            accountType: 'student',
            legalAccepted: true,
            legalVersion: CURRENT_LEGAL_VERSION,
          }),
        })
        const completeData = await completeRes.json()
        if (!completeRes.ok) {
          setError(completeData.error || 'Could not finish signing you in.')
          return
        }
        completeAuthentication(completeData.user)
        navigate('/m/onboarding/goals', { replace: true })
        return
      }

      setError('Unexpected response from Google sign-in.')
    } catch (err) {
      // `GoogleAuth.signIn()` throws a plain error when the user cancels.
      const message = err?.message || ''
      if (
        message.includes('canceled') ||
        message.includes('cancelled') ||
        message.includes('CANCEL')
      ) {
        // User backed out of the account chooser — no UI error.
        return
      }
      setError('Could not sign in with Google. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [completeAuthentication, navigate])

  const handleWebFallback = useCallback(() => {
    if (!GOOGLE_CLIENT_ID || loading) return
    setLoading(true)
    const redirectUri = `${window.location.origin}/m/landing`
    window.location.href = buildGoogleOAuthUrl(redirectUri)
  }, [loading])

  const handleTap = useCallback(() => {
    if (!GOOGLE_CLIENT_ID || loading) return
    if (isNativePlatform()) {
      void handleNativeSignIn()
    } else {
      handleWebFallback()
    }
  }, [loading, handleNativeSignIn, handleWebFallback])

  if (!GOOGLE_CLIENT_ID) return null

  const label = mode === 'signup' ? 'Continue with Google' : 'Sign in with Google'

  return (
    <>
      <button
        type="button"
        className="mob-google-btn"
        onClick={handleTap}
        disabled={loading}
        aria-label={label}
      >
        {loading ? <div className="mob-google-btn-spinner" /> : <GoogleLogo />}
        <span>{label}</span>
      </button>
      {error && <div className="mob-auth-error">{error}</div>}
    </>
  )
}
