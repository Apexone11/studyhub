/**
 * GoogleSignInButton — renders the GIS iframe button when available,
 * automatically falls back to a redirect-based OAuth flow when the
 * Google Identity Services script is blocked (ad blockers, privacy
 * extensions, or third-party cookie settings).
 *
 * The fallback navigates the user to Google's consent page; after
 * approval Google redirects back with ?code=... which the parent page
 * catches on mount and sends to POST /api/auth/google/code.
 */
import { useEffect, useRef, useState } from 'react'
import { GoogleLogin } from '@react-oauth/google'
import { GOOGLE_CLIENT_ID } from '../config'
import { buildGoogleOAuthUrl, getGoogleRedirectUri } from './googleSignInHelpers'

const GIS_LOAD_TIMEOUT_MS = 3000

const GOOGLE_SVG = (
  <svg width="18" height="18" viewBox="0 0 48 48">
    <path
      fill="#EA4335"
      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
    />
    <path
      fill="#4285F4"
      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
    />
    <path
      fill="#FBBC05"
      d="M10.53 28.59A14.5 14.5 0 019.5 24c0-1.59.28-3.14.76-4.59l-7.98-6.19A23.998 23.998 0 000 24c0 3.77.9 7.35 2.56 10.54l7.97-5.95z"
    />
    <path
      fill="#34A853"
      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 5.95C6.51 42.62 14.62 48 24 48z"
    />
  </svg>
)

export default function GoogleSignInButton({
  onSuccess,
  onError,
  text = 'signin_with',
  width = 300,
}) {
  const wrapRef = useRef(null)
  const [gisLoaded, setGisLoaded] = useState(null) // null = detecting, true = loaded, false = blocked

  useEffect(() => {
    const timer = setTimeout(() => {
      // Check if the GIS iframe rendered inside our wrapper.
      const iframe = wrapRef.current?.querySelector('iframe')
      const gButton = wrapRef.current?.querySelector('[role="button"]')
      setGisLoaded(Boolean(iframe || gButton))
    }, GIS_LOAD_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [])

  if (!GOOGLE_CLIENT_ID) return null

  const label = text === 'signup_with' ? 'Sign up with Google' : 'Sign in with Google'

  return (
    <div ref={wrapRef}>
      {/* Try the native GIS button first */}
      <div style={{ display: gisLoaded === false ? 'none' : 'block' }}>
        <GoogleLogin
          onSuccess={onSuccess}
          onError={() => onError?.('Google sign-in was cancelled or failed.')}
          size="large"
          width={String(width)}
          text={text}
          shape="rectangular"
          theme="outline"
        />
      </div>

      {/* Redirect-flow fallback when GIS is blocked */}
      {gisLoaded === false && (
        <button
          type="button"
          onClick={() => {
            const redirectUri = getGoogleRedirectUri()
            window.location.href = buildGoogleOAuthUrl(redirectUri)
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            width: Math.min(width, 400),
            padding: '10px 16px',
            borderRadius: 8,
            border: '1px solid var(--sh-border)',
            background: 'var(--sh-surface)',
            color: 'var(--sh-slate-800)',
            fontSize: 14,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          {GOOGLE_SVG}
          {label}
        </button>
      )}
    </div>
  )
}
