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

export default function useRegisterFlow() {
  const navigate = useNavigate()
  const { completeAuthentication } = useSession()

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
      const remaining = Math.max(0, Math.ceil((new Date(resendAvailableAt).getTime() - Date.now()) / 1000))
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
    if (validationError) { setError(validationError); return }

    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const result = await apiStartRegistration(form)
      if (!result.ok) { setError(result.error); return }

      setVerificationToken(result.data.verificationToken)
      setDeliveryHint(result.data.deliveryHint || form.email.trim())
      setResendAvailableAt(result.data.resendAvailableAt)
      setStep('verify')
      trackEvent('signup_started', { method: 'local' })
      setSuccess(`We sent a 6-digit code to ${result.data.deliveryHint || form.email.trim()}.`)
    } catch {
      setError('Could not connect to the server.')
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
      if (!verifyResult.ok) { setError(verifyResult.error); return }

      // Immediately complete registration (no courses step)
      const result = await apiCompleteRegistration(verificationToken)
      if (!result.ok) { setError(result.error); return }

      completeAuthentication(result.data.user)
      trackSignupConversion()
      trackEvent('signup_completed', { method: 'local' })
      navigate(getAuthenticatedHomePath(result.data.user), { replace: true })
    } catch {
      setError('Could not connect to the server.')
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
      if (!result.ok) { setError(result.error); return }

      setResendAvailableAt(result.data.resendAvailableAt)
      setVerificationCode('')
      setSuccess(`New code sent to ${deliveryHint}.`)
    } catch {
      setError('Could not connect to the server.')
    } finally {
      setLoading(false)
    }
  }

  /* ── Google OAuth success handler ──────────────────────────────────── */
  async function handleGoogleSuccess(credentialResponse) {
    if (!credentialResponse?.credential) {
      setError('Google sign-up did not return a valid credential.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const result = await apiGoogleAuth(credentialResponse.credential)
      if (!result.ok) { setError(result.error); return }

      // Google creates the user immediately — no extra steps
      completeAuthentication(result.data.user)
      trackSignupConversion()
      trackEvent('signup_completed', { method: 'google' })
      navigate(getAuthenticatedHomePath(result.data.user), { replace: true })
    } catch {
      setError('Could not connect to the server.')
    } finally {
      setLoading(false)
    }
  }

  return {
    step, loading, error, success, form,
    verificationCode, deliveryHint, resendCountdown,
    setError, setField, setVerificationCode,
    handleCreateAccount, handleVerifyCode, handleResendCode,
    handleGoogleSuccess,
  }
}
