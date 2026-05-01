/* ═══════════════════════════════════════════════════════════════════════════
 * useRegisterFlow.js — Custom hook for multi-step registration state & API
 *
 * Two-step flow: Account → Verify Email → auto-complete.
 * Google OAuth: single-click creation (no extra steps).
 * School/course selection is deferred to /my-courses (post-signup).
 * ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAuthenticatedHomePath } from '../../lib/authNavigation'
import { trackSignupConversion, trackEvent } from '../../lib/telemetry'
import { useSession } from '../../lib/session-context'
import {
  apiStartRegistration,
  apiVerifyCode,
  apiResendCode,
  apiGoogleAuth,
  apiCompleteRegistration,
} from './registerConstants'
import { useRolesV2Flags, isRolesV2FlagEnabled } from '../../lib/rolesV2Flags'

export default function useRegisterFlow({ referralCode } = {}) {
  const navigate = useNavigate()
  const { completeAuthentication } = useSession()
  const { oauthPicker: oauthPickerEnabled } = useRolesV2Flags()

  /* ── State ─────────────────────────────────────────────────────────── */
  const [step, setStep] = useState('account')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [verificationToken, setVerificationToken] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [deliveryHint, setDeliveryHint] = useState('')
  const [resendAvailableAt, setResendAvailableAt] = useState(null)
  const [resendCountdown, setResendCountdown] = useState(0)

  /* Form state for account step */
  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    accountType: 'student',
    termsAccepted: false,
  })

  /* ── Resend countdown timer ──────────────────────────────────────── */
  useEffect(() => {
    if (!resendAvailableAt) return
    const tick = () => {
      const remaining = Math.max(
        0,
        Math.ceil((new Date(resendAvailableAt).getTime() - Date.now()) / 1000),
      )
      setResendCountdown(remaining)
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [resendAvailableAt])

  /* ── Form helpers ──────────────────────────────────────────────────── */
  function setField(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
    setError('')
    setSuccess('')
  }

  /* ── Account creation handler ──────────────────────────────────────── */
  async function handleCreateAccount(event, validationError) {
    event.preventDefault()
    if (validationError) {
      setError(validationError)
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const result = await apiStartRegistration(form, { referralCode })
      if (!result.ok) {
        setError(result.error)
        return
      }

      setVerificationToken(result.data.verificationToken)
      setDeliveryHint(result.data.deliveryHint || form.email.trim())
      setResendAvailableAt(result.data.resendAvailableAt)
      setStep('verify')
      trackEvent('signup_started', { method: 'local' })
      setSuccess(`We sent a 6-digit code to ${result.data.deliveryHint || form.email.trim()}.`)
    } catch {
      setError('Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  /* ── Verify email code handler ────────────────────────────────────── */
  async function handleVerifyCode(event) {
    event.preventDefault()
    const trimmedCode = verificationCode.trim()
    if (!trimmedCode || trimmedCode.length !== 6) {
      setError('Please enter the 6-digit code from your email.')
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const verifyResult = await apiVerifyCode(verificationToken, trimmedCode)
      if (!verifyResult.ok) {
        setError(verifyResult.error)
        return
      }

      // Immediately complete registration (no courses step)
      const result = await apiCompleteRegistration(verificationToken)
      if (!result.ok) {
        setError(result.error)
        return
      }

      completeAuthentication(result.data.user)
      trackSignupConversion()
      trackEvent('signup_completed', { method: 'local' })
      navigate(getAuthenticatedHomePath(result.data.user), { replace: true })
    } catch {
      setError('Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  /* ── Resend verification code handler ─────────────────────────────── */
  async function handleResendCode() {
    setLoading(true)
    setError('')

    try {
      const result = await apiResendCode(verificationToken)
      if (!result.ok) {
        setError(result.error)
        return
      }

      setResendAvailableAt(result.data.resendAvailableAt)
      setVerificationCode('')
      setSuccess(`New code sent to ${deliveryHint}.`)
    } catch {
      setError('Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  /* ── Google OAuth success handler ──────────────────────────────────── */
  async function handleGoogleSuccess(credentialResponse, options = {}) {
    if (!credentialResponse?.credential) {
      setError('Google sign-up did not return a valid credential.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const result = await apiGoogleAuth(credentialResponse.credential, {
        ...options,
        referralCode,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }

      if (result.data.status === 'needs_role' && result.data.tempToken) {
        // The roles-v2 hook is async; if the OAuth code round-trip
        // resolves before the flag fetch returns, the closure-captured
        // `oauthPickerEnabled` is still `false`. Read the flag via the
        // imperative helper which awaits the in-flight fetch — that's
        // the canonical answer regardless of render timing.
        const oauthPickerLive = oauthPickerEnabled || (await isRolesV2FlagEnabled('oauthPicker'))
        if (!oauthPickerLive) {
          setError('New Google signups are paused right now. Please sign up with email instead.')
          return
        }
        try {
          sessionStorage.setItem(
            'studyhub.google.pending',
            JSON.stringify({
              tempToken: result.data.tempToken,
              email: result.data.email,
              name: result.data.name,
              avatarUrl: result.data.avatarUrl,
              referralCode: referralCode || null,
            }),
          )
        } catch {
          /* ignore storage failures */
        }
        navigate('/signup/role', { replace: true })
        return
      }

      completeAuthentication(result.data.user)
      trackSignupConversion()
      trackEvent('signup_completed', { method: 'google' })
      navigate(getAuthenticatedHomePath(result.data.user), { replace: true })
    } catch {
      setError('Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  return {
    step,
    loading,
    error,
    success,
    form,
    verificationCode,
    deliveryHint,
    resendCountdown,
    setError,
    setField,
    setVerificationCode,
    handleCreateAccount,
    handleVerifyCode,
    handleResendCode,
    handleGoogleSuccess,
  }
}
