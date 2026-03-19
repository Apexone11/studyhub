import { useState, useEffect, useCallback } from 'react'
import { GoogleLogin } from '@react-oauth/google'
import { API, GOOGLE_CLIENT_ID } from '../../config'
import { Button, FormField, Input, Message, MsgList, SectionCard } from './settingsShared'
import { isWebAuthnSupported, registerPasskey, listPasskeys, removePasskey } from '../../lib/webauthn'

export default function SecurityTab({ user, sessionUser, busyKey, setBusyKey, handlePatch, syncUser }) {
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [usernameForm, setUsernameForm] = useState({ newUsername: '', password: '' })
  const [googleUnlinkPassword, setGoogleUnlinkPassword] = useState('')

  const [passwordMsg, setPasswordMsg] = useState(null)
  const [usernameMsg, setUsernameMsg] = useState(null)
  const [googleMsg, setGoogleMsg] = useState(null)

  const isGoogleOnly = user?.authProvider === 'google'
  const [showGooglePopup, setShowGooglePopup] = useState(false)

  // ── Passkeys state (admin only) ─────────────────────────────────────
  const isAdmin = user?.role === 'admin' || sessionUser?.role === 'admin'
  const webauthnSupported = isWebAuthnSupported()
  const [passkeys, setPasskeys] = useState([])
  const [passkeyMsg, setPasskeyMsg] = useState(null)
  const [passkeyName, setPasskeyName] = useState('')
  const [loadingPasskeys, setLoadingPasskeys] = useState(false)

  const loadPasskeys = useCallback(async () => {
    if (!isAdmin || !webauthnSupported) return
    setLoadingPasskeys(true)
    try {
      const creds = await listPasskeys()
      setPasskeys(creds)
    } catch {
      // Silently fail on initial load
    } finally {
      setLoadingPasskeys(false)
    }
  }, [isAdmin, webauthnSupported])

  useEffect(() => {
    loadPasskeys()
  }, [loadPasskeys])

  async function handleRegisterPasskey() {
    setPasskeyMsg(null)
    setBusyKey('passkey-register')
    try {
      await registerPasskey(passkeyName || undefined)
      setPasskeyMsg({ type: 'success', text: 'Passkey registered successfully.' })
      setPasskeyName('')
      await loadPasskeys()
    } catch (err) {
      setPasskeyMsg({ type: 'error', text: err.message || 'Failed to register passkey.' })
    } finally {
      setBusyKey('')
    }
  }

  async function handleRemovePasskey(id) {
    setPasskeyMsg(null)
    setBusyKey(`passkey-remove-${id}`)
    try {
      await removePasskey(id)
      setPasskeyMsg({ type: 'success', text: 'Passkey removed.' })
      await loadPasskeys()
    } catch (err) {
      setPasskeyMsg({ type: 'error', text: err.message || 'Failed to remove passkey.' })
    } finally {
      setBusyKey('')
    }
  }

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
      setGoogleMsg({ type: 'error', text: 'Could not connect to the server.' })
    } finally {
      setBusyKey('')
    }
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
        {isGoogleOnly ? (
          <Message tone="info">Google-only accounts must set a password in the Account tab before changing their username.</Message>
        ) : (
          <>
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
          </>
        )}
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
          ) : showGooglePopup ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <GoogleLogin
                  onSuccess={handleGoogleLinkSuccess}
                  onError={() => setGoogleMsg({ type: 'error', text: 'Google sign-in was cancelled or failed.' })}
                  size="large"
                  text="signin_with"
                  shape="rectangular"
                  theme="outline"
                />
              </div>
              <Button secondary onClick={() => setShowGooglePopup(false)}>Cancel</Button>
            </div>
          ) : (
            <Button disabled={busyKey === 'google-link'} onClick={() => setShowGooglePopup(true)}>
              Link Google Account
            </Button>
          )}
        </SectionCard>
      )}

      {isAdmin && (
        <SectionCard title="Passkeys" subtitle="Register a passkey for passwordless admin sign-in.">
          <MsgList msg={passkeyMsg} />
          {!webauthnSupported ? (
            <Message tone="info">Your browser does not support WebAuthn passkeys. Try Chrome, Safari, or Edge on a supported device.</Message>
          ) : (
            <>
              {loadingPasskeys ? (
                <div style={{ fontSize: 13, color: '#64748b', padding: '12px 0' }}>Loading passkeys...</div>
              ) : passkeys.length === 0 ? (
                <div style={{ fontSize: 13, color: '#64748b', padding: '8px 0 16px' }}>No passkeys registered yet.</div>
              ) : (
                <div style={{ marginBottom: 16 }}>
                  {passkeys.map((pk) => (
                    <div
                      key={pk.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 14px',
                        borderRadius: 10,
                        border: '1px solid #e2e8f0',
                        marginBottom: 8,
                        background: '#f8fafc',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{pk.name || 'Passkey'}</div>
                        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                          Added {new Date(pk.createdAt).toLocaleDateString()}
                          {pk.deviceType && ` \u00b7 ${pk.deviceType}`}
                        </div>
                      </div>
                      <Button
                        danger
                        disabled={busyKey === `passkey-remove-${pk.id}`}
                        onClick={() => handleRemovePasskey(pk.id)}
                        style={{ padding: '6px 12px', fontSize: 12 }}
                      >
                        {busyKey === `passkey-remove-${pk.id}` ? 'Removing...' : 'Remove'}
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <FormField label="Passkey Name (optional)" hint="Give this passkey a name to identify it later.">
                <Input
                  value={passkeyName}
                  onChange={(e) => setPasskeyName(e.target.value)}
                  placeholder="e.g. MacBook Pro, iPhone"
                  maxLength={60}
                />
              </FormField>
              <Button
                disabled={busyKey === 'passkey-register'}
                onClick={handleRegisterPasskey}
              >
                {busyKey === 'passkey-register' ? 'Registering...' : 'Register New Passkey'}
              </Button>
            </>
          )}
        </SectionCard>
      )}
    </>
  )
}
