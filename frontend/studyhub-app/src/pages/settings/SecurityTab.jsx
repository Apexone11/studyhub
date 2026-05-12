import { useState } from 'react'
import { GoogleLogin } from '@react-oauth/google'
import { API, GOOGLE_CLIENT_ID } from '../../config'
import { Button, FormField, Input, Message, MsgList, SectionCard } from './settingsShared'
import PasskeysSection from './PasskeysSection'
import LoginActivitySection from './LoginActivitySection'
import SecurityAlertsSection from './SecurityAlertsSection'
import PanicSection from './PanicSection'
import RecoveryCodesSection from './RecoveryCodesSection'
import SubmitSpinner from '../../components/SubmitSpinner'
import { useFormValidation } from '../../lib/useFormValidation'
import {
  googleLinkedBadgeStyle,
  googleOnlyHintStyle,
  googlePopupWrapperStyle,
  googlePopupCenterStyle,
} from './securityConstants'

export default function SecurityTab({
  user,
  sessionUser,
  busyKey,
  setBusyKey,
  handlePatch,
  syncUser,
}) {
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [usernameForm, setUsernameForm] = useState({ newUsername: '', password: '' })
  const [googleUnlinkPassword, setGoogleUnlinkPassword] = useState('')

  const [passwordMsg, setPasswordMsg] = useState(null)
  const [usernameMsg, setUsernameMsg] = useState(null)
  const [googleMsg, setGoogleMsg] = useState(null)

  const passwordValidation = useFormValidation()
  const usernameValidation = useFormValidation()
  const googleUnlinkValidation = useFormValidation()

  const isGoogleOnly = user?.authProvider === 'google'
  const [showGooglePopup, setShowGooglePopup] = useState(false)

  async function handleGoogleLinkSuccess(credentialResponse) {
    if (!credentialResponse?.credential) {
      setGoogleMsg({ type: 'error', text: 'Google sign-in did not return a valid credential.' })
      return
    }
    setGoogleMsg(null)
    setBusyKey('google-link')
    try {
      const response = await fetch(`${API}/api/settings/google/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ credential: credentialResponse.credential }),
      })
      const data = await response.json()
      if (!response.ok) {
        setGoogleMsg({ type: 'error', text: data.error || 'Could not link Google account.' })
        return
      }
      if (data.user) syncUser(data.user)
      setGoogleMsg({ type: 'success', text: data.message || 'Google account linked successfully.' })
      setShowGooglePopup(false)
    } catch {
      setGoogleMsg({ type: 'error', text: 'Check your connection and try again.' })
    } finally {
      setBusyKey('')
    }
  }

  async function handleGoogleUnlink() {
    if (!googleUnlinkPassword) {
      googleUnlinkValidation.setFieldError('password', 'Enter your password to unlink Google.')
      googleUnlinkValidation.focusFirstError({ password: 'required' })
      return
    }
    googleUnlinkValidation.resetErrors()
    setBusyKey('google-unlink')
    setGoogleMsg(null)

    try {
      const response = await fetch(`${API}/api/settings/google/unlink`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password: googleUnlinkPassword }),
      })
      const data = await response.json()

      if (!response.ok) {
        setGoogleMsg({ type: 'error', text: data.error || 'Could not unlink Google.' })
        return
      }

      if (data.user) syncUser(data.user)
      setGoogleUnlinkPassword('')
      setGoogleMsg({ type: 'success', text: data.message || 'Google account unlinked.' })
    } catch {
      setGoogleMsg({ type: 'error', text: 'Check your connection and try again.' })
    } finally {
      setBusyKey('')
    }
  }

  return (
    <>
      {!isGoogleOnly && (
        <SectionCard
          title="Change Password"
          subtitle="Use a password with at least 8 characters, one capital letter, and one number."
        >
          <FormField
            label="Current Password"
            error={passwordValidation.errors.currentPassword}
            errorId="pw-current-error"
          >
            <Input
              id="pw-current"
              type="password"
              {...passwordValidation.getFieldProps('currentPassword', { id: 'pw-current' })}
              value={passwordForm.currentPassword}
              onChange={(e) => {
                setPasswordForm((c) => ({ ...c, currentPassword: e.target.value }))
                passwordValidation.clearFieldError('currentPassword')
              }}
            />
          </FormField>
          <FormField
            label="New Password"
            error={passwordValidation.errors.newPassword}
            errorId="pw-new-error"
          >
            <Input
              id="pw-new"
              type="password"
              {...passwordValidation.getFieldProps('newPassword', { id: 'pw-new' })}
              value={passwordForm.newPassword}
              onChange={(e) => {
                setPasswordForm((c) => ({ ...c, newPassword: e.target.value }))
                passwordValidation.clearFieldError('newPassword')
              }}
            />
          </FormField>
          <FormField
            label="Confirm New Password"
            error={passwordValidation.errors.confirmPassword}
            errorId="pw-confirm-error"
          >
            <Input
              id="pw-confirm"
              type="password"
              {...passwordValidation.getFieldProps('confirmPassword', { id: 'pw-confirm' })}
              value={passwordForm.confirmPassword}
              onChange={(e) => {
                setPasswordForm((c) => ({ ...c, confirmPassword: e.target.value }))
                passwordValidation.clearFieldError('confirmPassword')
              }}
            />
          </FormField>
          <MsgList msg={passwordMsg} />
          <Button
            disabled={busyKey === 'password'}
            onClick={() => {
              const nextErrors = {}
              if (!passwordForm.currentPassword)
                nextErrors.currentPassword = 'Enter your current password.'
              if (!passwordForm.newPassword) nextErrors.newPassword = 'Choose a new password.'
              else if (passwordForm.newPassword.length < 8)
                nextErrors.newPassword = 'Password must be at least 8 characters.'
              if (!passwordForm.confirmPassword)
                nextErrors.confirmPassword = 'Re-enter the new password.'
              else if (
                passwordForm.newPassword &&
                passwordForm.newPassword !== passwordForm.confirmPassword
              )
                nextErrors.confirmPassword = 'New passwords do not match.'
              if (Object.keys(nextErrors).length > 0) {
                passwordValidation.setErrors(nextErrors)
                passwordValidation.focusFirstError(nextErrors)
                setPasswordMsg(null)
                return
              }
              passwordValidation.resetErrors()
              void handlePatch(
                'password',
                {
                  currentPassword: passwordForm.currentPassword,
                  newPassword: passwordForm.newPassword,
                },
                setPasswordMsg,
                () => {
                  setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
                },
              )
            }}
          >
            {busyKey === 'password' && <SubmitSpinner label="Saving" />}
            {busyKey === 'password' ? 'Saving…' : 'Update Password'}
          </Button>
        </SectionCard>
      )}

      <SectionCard
        title="Change Username"
        subtitle={`Current username: ${user?.username || sessionUser?.username || 'unknown'}`}
      >
        {isGoogleOnly ? (
          <Message tone="info">
            Google-only accounts must set a password in the Account tab before changing their
            username.
          </Message>
        ) : (
          <>
            <FormField
              label="New Username"
              error={usernameValidation.errors.newUsername}
              errorId="username-new-error"
            >
              <Input
                id="username-new"
                {...usernameValidation.getFieldProps('newUsername', { id: 'username-new' })}
                value={usernameForm.newUsername}
                onChange={(e) => {
                  setUsernameForm((c) => ({ ...c, newUsername: e.target.value }))
                  usernameValidation.clearFieldError('newUsername')
                }}
              />
            </FormField>
            <FormField
              label="Confirm with Password"
              error={usernameValidation.errors.password}
              errorId="username-pw-error"
            >
              <Input
                id="username-pw"
                type="password"
                {...usernameValidation.getFieldProps('password', { id: 'username-pw' })}
                value={usernameForm.password}
                onChange={(e) => {
                  setUsernameForm((c) => ({ ...c, password: e.target.value }))
                  usernameValidation.clearFieldError('password')
                }}
              />
            </FormField>
            <MsgList msg={usernameMsg} />
            <Button
              disabled={busyKey === 'username'}
              onClick={() => {
                const nextErrors = {}
                if (!usernameForm.newUsername.trim())
                  nextErrors.newUsername = 'Enter a new username.'
                if (!usernameForm.password)
                  nextErrors.password = 'Confirm with your current password.'
                if (Object.keys(nextErrors).length > 0) {
                  usernameValidation.setErrors(nextErrors)
                  usernameValidation.focusFirstError(nextErrors)
                  return
                }
                usernameValidation.resetErrors()
                void handlePatch('username', usernameForm, setUsernameMsg, () => {
                  setUsernameForm({ newUsername: '', password: '' })
                })
              }}
            >
              {busyKey === 'username' && <SubmitSpinner label="Saving" />}
              {busyKey === 'username' ? 'Saving…' : 'Update Username'}
            </Button>
          </>
        )}
      </SectionCard>

      {GOOGLE_CLIENT_ID && (
        <SectionCard
          title="Google Account"
          subtitle={
            user?.googleId
              ? 'Your Google account is linked.'
              : 'Link your Google account for one-click sign-in.'
          }
        >
          <MsgList msg={googleMsg} />
          {user?.googleId ? (
            <div>
              <div style={googleLinkedBadgeStyle}>
                Google account is linked (provider: {user.authProvider})
              </div>
              {user.authProvider !== 'google' && (
                <>
                  <FormField
                    label="Confirm with Password"
                    error={googleUnlinkValidation.errors.password}
                    errorId="google-unlink-error"
                  >
                    <Input
                      id="google-unlink-pw"
                      type="password"
                      {...googleUnlinkValidation.getFieldProps('password', {
                        id: 'google-unlink-pw',
                      })}
                      value={googleUnlinkPassword}
                      onChange={(e) => {
                        setGoogleUnlinkPassword(e.target.value)
                        googleUnlinkValidation.clearFieldError('password')
                      }}
                      placeholder="Enter your password to unlink"
                    />
                  </FormField>
                  <Button
                    secondary
                    disabled={busyKey === 'google-unlink' || !googleUnlinkPassword}
                    onClick={handleGoogleUnlink}
                  >
                    {busyKey === 'google-unlink' && <SubmitSpinner label="Unlinking" />}
                    {busyKey === 'google-unlink' ? 'Unlinking…' : 'Unlink Google'}
                  </Button>
                </>
              )}
              {user.authProvider === 'google' && (
                <div style={googleOnlyHintStyle}>
                  Set a password first before unlinking Google (your only sign-in method).
                </div>
              )}
            </div>
          ) : showGooglePopup ? (
            <div style={googlePopupWrapperStyle}>
              <div style={googlePopupCenterStyle}>
                <GoogleLogin
                  onSuccess={handleGoogleLinkSuccess}
                  onError={() =>
                    setGoogleMsg({ type: 'error', text: 'Google sign-in was cancelled or failed.' })
                  }
                  size="large"
                  text="signin_with"
                  shape="rectangular"
                  theme="outline"
                />
              </div>
              <Button secondary onClick={() => setShowGooglePopup(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button disabled={busyKey === 'google-link'} onClick={() => setShowGooglePopup(true)}>
              Link Google Account
            </Button>
          )}
        </SectionCard>
      )}

      <PasskeysSection
        user={user}
        sessionUser={sessionUser}
        busyKey={busyKey}
        setBusyKey={setBusyKey}
      />

      <RecoveryCodesSection user={user} />

      <SecurityAlertsSection />

      <LoginActivitySection />

      <PanicSection />
    </>
  )
}
