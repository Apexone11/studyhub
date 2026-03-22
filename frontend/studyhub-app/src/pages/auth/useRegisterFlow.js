/* ═══════════════════════════════════════════════════════════════════════════
 * useRegisterFlow.js — Custom hook for multi-step registration state & API
 * ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { getAuthenticatedHomePath } from '../../lib/authNavigation'
import { trackSignupConversion, trackEvent } from '../../lib/telemetry'
import { useSession } from '../../lib/session-context'
import {
  apiStartRegistration,
  apiVerifyCode,
  apiResendCode,
  apiGoogleAuth,
  apiGoogleComplete,
  apiCompleteRegistration,
  apiLoadSchools,
} from './registerConstants'

export default function useRegisterFlow() {
  const navigate = useNavigate()
  const location = useLocation()
  const { completeAuthentication } = useSession()

  /* ── Google course selection flow (redirected from login page) ──────── */
  const googleState = location.state
  const isGoogleCourseFlow = Boolean(googleState?.googleCourseSelection && googleState?.tempCredential)

  /* ── State ─────────────────────────────────────────────────────────── */
  const [step, setStep] = useState(isGoogleCourseFlow ? 'courses' : 'account')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(isGoogleCourseFlow ? `Signed in as ${googleState.googleName || 'Google user'}. Choose your courses to finish setup.` : '')
  const [catalogError, setCatalogError] = useState('')
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [schools, setSchools] = useState([])
  const [selectedCourseIds, setSelectedCourseIds] = useState([])
  const [customCourses, setCustomCourses] = useState([])
  const [customCourseDraft, setCustomCourseDraft] = useState({ code: '', name: '' })
  const [googleCredential, setGoogleCredential] = useState(isGoogleCourseFlow ? googleState.tempCredential : null)
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
    termsAccepted: false,
    schoolId: '',
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

  /* ── Load course catalog when entering courses step ────────────────── */
  useEffect(() => {
    if (step !== 'courses' || schools.length > 0 || catalogLoading) return

    let active = true
    setCatalogLoading(true)
    setCatalogError('')

    apiLoadSchools()
      .then((data) => {
        if (!active) return
        setSchools(Array.isArray(data) ? data : [])
      })
      .catch((loadError) => {
        if (!active) return
        setCatalogError(loadError.message || 'Could not load the course catalog.')
      })
      .finally(() => {
        if (active) setCatalogLoading(false)
      })

    return () => { active = false }
  }, [catalogLoading, schools.length, step])

  /* ── Derived state ─────────────────────────────────────────────────── */
  const selectedSchool = useMemo(
    () => schools.find((school) => String(school.id) === String(form.schoolId)) || null,
    [form.schoolId, schools],
  )
  const availableCourses = selectedSchool?.courses || []

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
      const result = await apiVerifyCode(verificationToken, trimmedCode)
      if (!result.ok) { setError(result.error); return }

      setStep('courses')
      setSuccess('Email verified! Now choose your courses, or skip for now.')
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

      if (result.data.requiresCourseSelection) {
        setGoogleCredential(result.data.tempCredential)
        setStep('courses')
        setSuccess(`Signed in as ${result.data.googleName || 'Google user'}. Choose your courses to finish setup.`)
        return
      }

      completeAuthentication(result.data.user)
      trackSignupConversion()
      navigate(getAuthenticatedHomePath(result.data.user), { replace: true })
    } catch {
      setError('Could not connect to the server.')
    } finally {
      setLoading(false)
    }
  }

  /* ── Course selection helpers ───────────────────────────────────────── */
  function toggleCourse(courseId) {
    setSelectedCourseIds((current) => (
      current.includes(courseId)
        ? current.filter((id) => id !== courseId)
        : current.length < 10
          ? [...current, courseId]
          : current
    ))
  }

  function addCustomCourse() {
    const code = customCourseDraft.code.trim().toUpperCase()
    const name = customCourseDraft.name.trim()

    if (!form.schoolId) { setError('Choose a school before adding a custom course.'); return }
    if (!code || !name) { setError('Enter both a course code and a course name.'); return }
    if (selectedCourseIds.length + customCourses.length >= 10) { setError('You can add up to 10 total courses.'); return }
    if (customCourses.some((course) => course.code === code)) { setError('That custom course has already been added.'); return }

    setCustomCourses((current) => [...current, { code, name }])
    setCustomCourseDraft({ code: '', name: '' })
    setError('')
  }

  /* ── Complete registration with courses ────────────────────────────── */
  async function handleCompleteRegistration(skipCourses = false) {
    setLoading(true)
    setError('')
    setSuccess('')

    const schoolId = skipCourses ? null : (form.schoolId ? Number(form.schoolId) : null)
    const courseIds = skipCourses ? [] : selectedCourseIds
    const courses = skipCourses ? [] : customCourses

    try {
      const result = googleCredential
        ? await apiGoogleComplete(googleCredential, schoolId, courseIds, courses)
        : await apiCompleteRegistration(verificationToken, schoolId, courseIds, courses)

      if (!result.ok) { setError(result.error); return }

      completeAuthentication(result.data.user)
      trackSignupConversion()
      trackEvent('signup_completed', {
        method: googleCredential ? 'google' : 'local',
        ...(googleCredential ? {} : { skipped_courses: skipCourses }),
      })
      navigate('/dashboard?welcome=1', { replace: true })
    } catch {
      setError('Could not connect to the server.')
    } finally {
      setLoading(false)
    }
  }

  return {
    step, loading, error, success, form,
    catalogError, catalogLoading, schools,
    selectedCourseIds, customCourses, customCourseDraft,
    googleCredential, verificationCode, deliveryHint, resendCountdown,
    selectedSchool, availableCourses,
    setError, setField, setVerificationCode, setCustomCourseDraft,
    setSelectedCourseIds, setCustomCourses, setCatalogError, setSchools,
    handleCreateAccount, handleVerifyCode, handleResendCode,
    handleGoogleSuccess, handleCompleteRegistration,
    toggleCourse, addCustomCourse,
  }
}
