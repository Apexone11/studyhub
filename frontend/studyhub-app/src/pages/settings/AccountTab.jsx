import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { API } from '../../config'
import { Button, FormField, Input, Message, MsgList, SectionCard } from './settingsShared'
import { FONT } from './settingsState'
import RoleTile from './RoleTile'
import SetPasswordModal from './SetPasswordModal'
import SubmitSpinner from '../../components/SubmitSpinner'
import { useFormValidation } from '../../lib/useFormValidation'

const DELETION_REASONS = [
  { value: 'better_platform', label: 'Found a better platform' },
  { value: 'no_longer_student', label: 'No longer a student' },
  { value: 'too_many_emails', label: 'Too many emails' },
  { value: 'privacy_concerns', label: 'Privacy concerns' },
  { value: 'other', label: 'Other' },
]

function parseTimestampToMs(value) {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function formatResendCountdown(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safeSeconds / 60)
  const seconds = safeSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export default function AccountTab({
  user,
  busyKey,
  setBusyKey,
  handlePatch,
  syncUser,
  clearSession,
  onSignOut,
}) {
  const navigate = useNavigate()

  const [emailForm, setEmailForm] = useState({ email: '', password: '' })
  const [verificationCode, setVerificationCode] = useState('')
  const [deleteForm, setDeleteForm] = useState({ password: '', reason: '', details: '' })

  const [emailMsg, setEmailMsg] = useState(null)
  const [deleteMsg, setDeleteMsg] = useState(null)

  const emailValidation = useFormValidation()
  const deleteValidation = useFormValidation()

  // Google-signup users who never chose a password get a 409 +
  // PASSWORD_NOT_SET from delete-account / patch-email / patch-
  // password. We pop SetPasswordModal so they can choose one inline,
  // then retry the original op without re-typing.
  const [setPasswordCtx, setSetPasswordCtx] = useState(null)

  const [clockNowMs, setClockNowMs] = useState(() => Date.now())

  useEffect(() => {
    const timerId = window.setInterval(() => setClockNowMs(Date.now()), 1000)
    return () => window.clearInterval(timerId)
  }, [])

  const pendingResendAvailableAtMs = useMemo(
    () => parseTimestampToMs(user?.pendingEmailVerification?.resendAvailableAt),
    [user?.pendingEmailVerification?.resendAvailableAt],
  )

  const pendingResendCooldownSeconds = useMemo(() => {
    if (!pendingResendAvailableAtMs) return 0
    return Math.max(0, Math.ceil((pendingResendAvailableAtMs - clockNowMs) / 1000))
  }, [clockNowMs, pendingResendAvailableAtMs])

  async function handleVerifyEmail() {
    if (!verificationCode.trim()) {
      setEmailMsg({ type: 'error', text: 'Enter the 6-digit verification code.' })
      return
    }

    setBusyKey('verify-email')
    setEmailMsg(null)

    try {
      const response = await fetch(`${API}/api/settings/email/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code: verificationCode.trim() }),
      })
      const data = await response.json()

      if (!response.ok) {
        setEmailMsg({ type: 'error', text: data.error || 'Could not verify your email.' })
        return
      }

      syncUser(data.user)
      setVerificationCode('')
      setEmailMsg({ type: 'success', text: data.message || 'Email verified successfully.' })
    } catch {
      setEmailMsg({ type: 'error', text: 'Check your connection and try again.' })
    } finally {
      setBusyKey('')
    }
  }

  async function handleResendEmailVerification() {
    if (pendingResendCooldownSeconds > 0) return

    setBusyKey('resend-email')
    setEmailMsg(null)

    try {
      const response = await fetch(`${API}/api/settings/email/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })
      const data = await response.json()

      if (!response.ok) {
        setEmailMsg({
          type: 'error',
          text: data.error || 'Could not resend the verification code.',
        })
        return
      }

      if (data.user) syncUser(data.user)
      setEmailMsg({ type: 'success', text: data.message || 'A new verification code was sent.' })
    } catch {
      setEmailMsg({ type: 'error', text: 'Check your connection and try again.' })
    } finally {
      setBusyKey('')
    }
  }

  // Pulled out so we can call it from both the form submit and the
  // SetPasswordModal success handler (Google users who set a password
  // mid-flow should land here automatically with the new password).
  async function submitDeleteAccount(form) {
    const nextErrors = {}
    if (!form.reason) nextErrors.reason = 'Choose a reason for leaving.'
    if (!form.password) nextErrors.password = 'Confirm with your password.'
    if (Object.keys(nextErrors).length > 0) {
      deleteValidation.setErrors(nextErrors)
      deleteValidation.focusFirstError(nextErrors)
      setDeleteMsg(null)
      return
    }
    deleteValidation.resetErrors()

    setBusyKey('delete-account')
    setDeleteMsg(null)

    try {
      const response = await fetch(`${API}/api/settings/account`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        if (data?.code === 'PASSWORD_NOT_SET') {
          // Pop the set-password modal; on success retry the delete
          // with the password the user just chose.
          setSetPasswordCtx({
            reason:
              'You signed up with Google, so you don’t have a password set yet. Choose one to confirm account deletion (you’ll also be able to use it to sign in with email).',
            onSuccess: (newPassword) => {
              setSetPasswordCtx(null)
              const nextForm = { ...form, password: newPassword }
              setDeleteForm(nextForm)
              void submitDeleteAccount(nextForm)
            },
          })
          return
        }
        setDeleteMsg({ type: 'error', text: data.error || 'Could not delete your account.' })
        return
      }

      clearSession()
      navigate('/', { replace: true })
    } catch {
      setDeleteMsg({ type: 'error', text: 'Check your connection and try again.' })
    } finally {
      setBusyKey('')
    }
  }

  async function handleDeleteAccount(event) {
    event.preventDefault()
    await submitDeleteAccount(deleteForm)
  }

  return (
    <>
      <RoleTile user={user} />
      {/* Discoverability shortcut into the public /docs catalog.
          Added in Design Refresh v2 Week 2 so teachers and self-learners
          landing on Settings always have a one-click path into the feature
          guide for their role. */}
      <SectionCard
        title="Help and docs"
        subtitle="New to StudyHub or onboarding your students? The product docs cover every feature, organized by what you are trying to do."
      >
        <Link
          to="/docs"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            color: 'var(--sh-accent, #2563eb)',
            textDecoration: 'none',
            fontWeight: 700,
            fontSize: 14,
            fontFamily: FONT,
          }}
        >
          Open product docs
          <span aria-hidden="true">&rarr;</span>
        </Link>
      </SectionCard>
      <SectionCard
        title="Email Address"
        subtitle={
          user?.email
            ? `Current email: ${user.email}`
            : 'Add an email address to unlock recovery and verification.'
        }
      >
        {user?.email && (
          <Message tone={user.emailVerified ? 'success' : 'info'}>
            {user.emailVerified
              ? 'Your email is verified.'
              : 'Email verification is still required.'}
          </Message>
        )}

        {user?.pendingEmailVerification && (
          <Message tone="info">
            Verification is pending for{' '}
            <strong>
              {user.pendingEmailVerification.deliveryHint || user.pendingEmailVerification.email}
            </strong>
            .
            {pendingResendCooldownSeconds > 0 && (
              <>
                {' '}
                You can request another code in{' '}
                {formatResendCountdown(pendingResendCooldownSeconds)}.
              </>
            )}
          </Message>
        )}

        <FormField label="New Email" error={emailValidation.errors.email} errorId="email-error">
          <Input
            id="email"
            type="email"
            {...emailValidation.getFieldProps('email', { id: 'email' })}
            value={emailForm.email}
            onChange={(e) => {
              setEmailForm((c) => ({ ...c, email: e.target.value }))
              emailValidation.clearFieldError('email')
            }}
            placeholder="you@example.com"
          />
        </FormField>
        <FormField
          label="Confirm with Password"
          error={emailValidation.errors.password}
          errorId="email-password-error"
        >
          <Input
            id="email-password"
            type="password"
            {...emailValidation.getFieldProps('password', { id: 'email-password' })}
            value={emailForm.password}
            onChange={(e) => {
              setEmailForm((c) => ({ ...c, password: e.target.value }))
              emailValidation.clearFieldError('password')
            }}
          />
        </FormField>
        <MsgList msg={emailMsg} />
        <Button
          disabled={busyKey === 'email'}
          onClick={() => {
            const nextErrors = {}
            if (!emailForm.email.trim()) nextErrors.email = 'Enter your new email address.'
            else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailForm.email.trim()))
              nextErrors.email = 'Please enter a valid email address.'
            if (!emailForm.password) nextErrors.password = 'Confirm with your current password.'
            if (Object.keys(nextErrors).length > 0) {
              emailValidation.setErrors(nextErrors)
              emailValidation.focusFirstError(nextErrors)
              return
            }
            emailValidation.resetErrors()
            void handlePatch('email', emailForm, setEmailMsg, () => {
              setEmailForm({ email: '', password: '' })
              setVerificationCode('')
            })
          }}
        >
          {busyKey === 'email' && <SubmitSpinner label="Updating" />}
          {busyKey === 'email' ? 'Updating…' : 'Start Email Update'}
        </Button>

        {user?.pendingEmailVerification && (
          <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid #e2e8f0' }}>
            <FormField label="Verification Code" hint="Enter the 6-digit code from your inbox.">
              <Input
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                inputMode="numeric"
                maxLength={6}
                style={{
                  letterSpacing: '0.35em',
                  textAlign: 'center',
                  fontSize: 22,
                  maxWidth: 220,
                }}
              />
            </FormField>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Button
                disabled={busyKey === 'verify-email' || verificationCode.trim().length !== 6}
                onClick={handleVerifyEmail}
              >
                {busyKey === 'verify-email' ? 'Verifying...' : 'Verify Email'}
              </Button>
              <Button
                secondary
                disabled={busyKey === 'resend-email' || pendingResendCooldownSeconds > 0}
                onClick={handleResendEmailVerification}
              >
                {busyKey === 'resend-email'
                  ? 'Sending...'
                  : pendingResendCooldownSeconds > 0
                    ? `Resend in ${formatResendCountdown(pendingResendCooldownSeconds)}`
                    : 'Resend Code'}
              </Button>
            </div>
          </div>
        )}
      </SectionCard>

      {/* Sign Out moved here from the navbar (S1) — destructive nav
          action belongs adjacent to the Danger Zone, not the search bar.
          Right-aligned via the flex wrapper to match the new
          single-action button convention. */}
      <SectionCard
        title="Sign out"
        subtitle="End this session on this device. You'll need to sign in again to come back."
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button secondary onClick={onSignOut}>
            Sign out
          </Button>
        </div>
      </SectionCard>

      <SectionCard
        danger
        title="Danger Zone"
        subtitle="Deleting your account is permanent. Your sheets, notes, comments, and profile will be removed."
      >
        <form onSubmit={handleDeleteAccount}>
          <FormField
            label="Reason for leaving"
            error={deleteValidation.errors.reason}
            errorId="delete-reason-error"
          >
            <select
              id="delete-reason"
              {...deleteValidation.getFieldProps('reason', { id: 'delete-reason' })}
              value={deleteForm.reason}
              onChange={(e) => {
                setDeleteForm((c) => ({ ...c, reason: e.target.value }))
                deleteValidation.clearFieldError('reason')
              }}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 10,
                border: '1px solid #cbd5e1',
                fontSize: 14,
                fontFamily: FONT,
                color: 'var(--sh-heading)',
              }}
            >
              <option value="">Select a reason</option>
              {DELETION_REASONS.map((reason) => (
                <option key={reason.value} value={reason.value}>
                  {reason.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Additional details (optional)">
            <textarea
              value={deleteForm.details}
              onChange={(e) =>
                setDeleteForm((c) => ({ ...c, details: e.target.value.slice(0, 300) }))
              }
              rows={4}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 10,
                border: '1px solid #cbd5e1',
                fontSize: 14,
                fontFamily: FONT,
                color: 'var(--sh-heading)',
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
          </FormField>
          <FormField
            label="Confirm with Password"
            error={deleteValidation.errors.password}
            errorId="delete-password-error"
          >
            <Input
              id="delete-password"
              type="password"
              {...deleteValidation.getFieldProps('password', { id: 'delete-password' })}
              value={deleteForm.password}
              onChange={(e) => {
                setDeleteForm((c) => ({ ...c, password: e.target.value }))
                deleteValidation.clearFieldError('password')
              }}
            />
          </FormField>
          <MsgList msg={deleteMsg} />
          <Button danger type="submit" disabled={busyKey === 'delete-account'}>
            {busyKey === 'delete-account' && <SubmitSpinner label="Deleting" />}
            {busyKey === 'delete-account' ? 'Deleting…' : 'Delete My Account'}
          </Button>
        </form>
      </SectionCard>

      <SetPasswordModal
        open={Boolean(setPasswordCtx)}
        reason={setPasswordCtx?.reason}
        onClose={() => setSetPasswordCtx(null)}
        onSuccess={(newPassword) => {
          // Defer to the caller-supplied success handler so the gated
          // op (delete account / change email / etc.) can retry with
          // the freshly-set password.
          if (setPasswordCtx?.onSuccess) setPasswordCtx.onSuccess(newPassword)
          else setSetPasswordCtx(null)
        }}
      />
    </>
  )
}
