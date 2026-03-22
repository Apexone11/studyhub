import { useState, useEffect, useCallback } from 'react'
import { isWebAuthnSupported, registerPasskey, listPasskeys, removePasskey } from '../../lib/webauthn'
import { Button, FormField, Input, Message, MsgList, SectionCard } from './settingsShared'
import {
  passkeyLoadingStyle,
  passkeyEmptyStyle,
  passkeyListWrapperStyle,
  passkeyRowStyle,
  passkeyNameStyle,
  passkeyMetaStyle,
  passkeyRemoveButtonStyle,
} from './securityConstants'

export default function PasskeysSection({ user, sessionUser, busyKey, setBusyKey }) {
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

  if (!isAdmin) return null

  return (
    <SectionCard title="Passkeys" subtitle="Register a passkey for passwordless admin sign-in.">
      <MsgList msg={passkeyMsg} />
      {!webauthnSupported ? (
        <Message tone="info">Your browser does not support WebAuthn passkeys. Try Chrome, Safari, or Edge on a supported device.</Message>
      ) : (
        <>
          {loadingPasskeys ? (
            <div style={passkeyLoadingStyle}>Loading passkeys...</div>
          ) : passkeys.length === 0 ? (
            <div style={passkeyEmptyStyle}>No passkeys registered yet.</div>
          ) : (
            <div style={passkeyListWrapperStyle}>
              {passkeys.map((pk) => (
                <div key={pk.id} style={passkeyRowStyle}>
                  <div>
                    <div style={passkeyNameStyle}>{pk.name || 'Passkey'}</div>
                    <div style={passkeyMetaStyle}>
                      Added {new Date(pk.createdAt).toLocaleDateString()}
                      {pk.deviceType && ` \u00b7 ${pk.deviceType}`}
                    </div>
                  </div>
                  <Button
                    danger
                    disabled={busyKey === `passkey-remove-${pk.id}`}
                    onClick={() => handleRemovePasskey(pk.id)}
                    style={passkeyRemoveButtonStyle}
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
  )
}
