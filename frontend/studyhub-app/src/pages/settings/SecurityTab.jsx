import { useState } from 'react'
import { API, GOOGLE_CLIENT_ID } from '../../config'
import { Button, FormField, Input, Message, MsgList, SectionCard } from './settingsShared'

export default function SecurityTab({ user, sessionUser, busyKey, setBusyKey, handlePatch, syncUser }) {
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [usernameForm, setUsernameForm] = useState({ newUsername: '', password: '' })
  const [googleUnlinkPassword, setGoogleUnlinkPassword] = useState('')

  const [passwordMsg, setPasswordMsg] = useState(null)
  const [usernameMsg, setUsernameMsg] = useState(null)
  const [googleMsg, setGoogleMsg] = useState(null)

  const isGoogleOnly = user?.authProvider === 'google'

  async function handleGoogleLink() {
    setGoogleMsg(null)
    // Google link uses a credential from the Google Sign-In popup
    // For now, show info — actual linking requires the GoogleLogin component flow
    setGoogleMsg({ type: 'info', text: 'Use the Google button on the login page to link your account, or contact support.' })
  }

  async function handleGoogleUnlink() {
    if (!googleUnlinkPassword) {
      setGoogleMsg({ type: 'error', text: 'Enter your password to unlink Google.' })
      return
    }
    setBusyKey('google-unlink')
    setGoogleMsg(null)

    try {
      const response = await fetch(`${API}/api/settings/google/unlink`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: googleUnlinkPassword }),
      })
      const data = await response.json()

      if (!response.ok) {
        setGoogleMsg({ type: 'error', text: data.error || 'Could not unlink Google.' })
        return
      }

      if (data.user) syncUser(data.user)
      setGoogleMsg({ type: 'success', text: data.message || 'Google account unlinked.' })
    } catch {
      setGoogleMsg({ type: 'error', text: 'Could not connect to the server.' })
    } finally {
      setBusyKey('')
    }
  }

  return (
    <>
      {!isGoogleOnly && (
        <SectionCard title="Change Password" subtitle="Use a password with at least 8 characters, one capital letter, and one number.">
          <FormField label="Current Password">
            <Input type="password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm((c) => ({ ...c, currentPassword: e.target.value }))} />
          </FormField>
          <FormField label="New Password">
            <Input type="password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm((c) => ({ ...c, newPassword: e.target.value }))} />
          </FormField>
          <FormField label="Confirm New Password">
            <Input type="password" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm((c) => ({ ...c, confirmPassword: e.target.value }))} />
          </FormField>
          <MsgList msg={passwordMsg} />
          <Button
            disabled={busyKey === 'password'}
            onClick={() => {
              if (passwordForm.newPassword !== passwordForm.confirmPassword) {
                setPasswordMsg({ type: 'error', text: 'New passwords do not match.' })
                return
              }
              void handlePatch('password', {
                currentPassword: passwordForm.currentPassword,
                newPassword: passwordForm.newPassword,
              }, setPasswordMsg, () => {
                setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
              })
            }}
          >
            {busyKey === 'password' ? 'Saving...' : 'Update Password'}
          </Button>
        </SectionCard>
      )}

      <SectionCard title="Change Username" subtitle={`Current username: ${user?.username || sessionUser?.username || 'unknown'}`}>
        <FormField label="New Username">
          <Input value={usernameForm.newUsername} onChange={(e) => setUsernameForm((c) => ({ ...c, newUsername: e.target.value }))} />
        </FormField>
        <FormField label="Confirm with Password">
          <Input type="password" value={usernameForm.password} onChange={(e) => setUsernameForm((c) => ({ ...c, password: e.target.value }))} />
        </FormField>
        <MsgList msg={usernameMsg} />
        <Button
          disabled={busyKey === 'username'}
          onClick={() => void handlePatch('username', usernameForm, setUsernameMsg, () => {
            setUsernameForm({ newUsername: '', password: '' })
          })}
        >
          {busyKey === 'username' ? 'Saving...' : 'Update Username'}
        </Button>
      </SectionCard>

      {GOOGLE_CLIENT_ID && (
        <SectionCard title="Google Account" subtitle={user?.googleId ? 'Your Google account is linked.' : 'Link your Google account for one-click sign-in.'}>
          <MsgList msg={googleMsg} />
          {user?.googleId ? (
            <div>
              <div style={{ padding: '12px 16px', borderRadius: 12, background: '#f0fdf4', border: '1px solid #bbf7d0', marginBottom: 14, fontSize: 13, color: '#166534' }}>
                Google account is linked (provider: {user.authProvider})
              </div>
              {user.authProvider !== 'google' && (
                <>
                  <FormField label="Confirm with Password">
                    <Input type="password" value={googleUnlinkPassword} onChange={(e) => setGoogleUnlinkPassword(e.target.value)} placeholder="Enter your password to unlink" />
                  </FormField>
                  <Button secondary disabled={busyKey === 'google-unlink' || !googleUnlinkPassword} onClick={handleGoogleUnlink}>
                    {busyKey === 'google-unlink' ? 'Unlinking...' : 'Unlink Google'}
                  </Button>
                </>
              )}
              {user.authProvider === 'google' && (
                <div style={{ fontSize: 12, color: '#94a3b8' }}>
                  Set a password first before unlinking Google (your only sign-in method).
                </div>
              )}
            </div>
          ) : (
            <Button onClick={handleGoogleLink}>Link Google Account</Button>
          )}
        </SectionCard>
      )}
    </>
  )
}
