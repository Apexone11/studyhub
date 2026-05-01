/* ═══════════════════════════════════════════════════════════════════════════
 * SetPasswordModal — one-time password setter for Google-signup users.
 *
 * Triggered when a sensitive op (delete account, change email, change
 * password) returns 409 with `code: 'PASSWORD_NOT_SET'`. Without this,
 * Google-only users could never confirm those ops because the random
 * passwordHash created at signup is unknown to them. Posts to
 * `POST /api/auth/set-password` (one-time-use; flips
 * User.passwordSetByUser to true).
 *
 * Returns the chosen password to the caller via `onSuccess(password)`
 * so the caller can immediately retry the original sensitive op
 * without making the user re-type the same password they just set.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { API } from '../../config'
import { useFocusTrap } from '../../lib/useFocusTrap'
import { Button, FormField, Input, Message } from './settingsShared'
import { FONT } from './settingsState'

export default function SetPasswordModal({ open, onClose, onSuccess, reason }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const trapRef = useFocusTrap({ active: open, onClose })

  useEffect(() => {
    if (!open) {
      setPassword('')
      setConfirm('')
      setError('')
      setSubmitting(false)
    }
  }, [open])

  if (!open) return null

  async function handleSubmit(event) {
    event.preventDefault()
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (!/[A-Z]/.test(password) || !/\d/.test(password)) {
      setError('Password must include at least one capital letter and one number.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setError('')
    setSubmitting(true)
    try {
      const response = await fetch(`${API}/api/auth/set-password`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: password }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(data.error || 'Could not set password. Try again.')
        return
      }
      // Hand the chosen password back so the caller can immediately
      // retry the gated op (delete account / change email / etc.)
      // without the user re-typing it.
      if (typeof onSuccess === 'function') onSuccess(password)
    } catch {
      setError('Check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        fontFamily: FONT,
      }}
      onClick={onClose}
    >
      <form
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="set-password-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        style={{
          background: 'var(--sh-surface)',
          border: '1px solid var(--sh-border)',
          borderRadius: 14,
          padding: 22,
          maxWidth: 460,
          width: '90%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
          color: 'var(--sh-text)',
        }}
      >
        <h3
          id="set-password-title"
          style={{ margin: '0 0 8px', fontSize: 18, color: 'var(--sh-heading)' }}
        >
          Set a password for your account
        </h3>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--sh-muted)', lineHeight: 1.6 }}>
          {reason ||
            'You signed in with Google, so you don’t have a password yet. Choose one now so you can confirm sensitive actions and sign in with email if Google is unavailable.'}
        </p>

        <FormField label="New password" hint="At least 8 characters, 1 capital, 1 number.">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            autoFocus
          />
        </FormField>

        <FormField label="Confirm password">
          <Input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
        </FormField>

        {error ? <Message tone="error">{error}</Message> : null}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <Button
            secondary
            type="button"
            disabled={submitting}
            onClick={onClose}
            style={{ fontSize: 13, padding: '8px 14px' }}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={submitting} style={{ fontSize: 13, padding: '8px 14px' }}>
            {submitting ? 'Saving…' : 'Set password'}
          </Button>
        </div>
      </form>
    </div>,
    document.body,
  )
}
