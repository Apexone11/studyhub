import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { API } from '../../config'
import { Button, Message, SectionCard } from './settingsShared'
import { ConfirmDialog } from './ConfirmDialog'
import { useSession } from '../../lib/session-context'

export default function PanicSection() {
  const navigate = useNavigate()
  const { clearSession } = useSession()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  async function doPanic() {
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch(`${API}/api/auth/security/panic`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMsg({ type: 'error', text: data.error || 'Could not complete panic action.' })
        return
      }
      setMsg({ type: 'success', text: data.message || 'All sessions revoked.' })
      // Session is gone server-side — clear local state and bounce to login.
      try {
        clearSession()
      } catch {
        /* ignore */
      }
      setTimeout(() => {
        navigate('/login?expired=1', { replace: true })
      }, 900)
    } catch {
      setMsg({ type: 'error', text: 'Network error. Please try again.' })
    } finally {
      setBusy(false)
      setOpen(false)
    }
  }

  return (
    <SectionCard
      title="Panic mode"
      subtitle="Lost a device or suspect someone has access? This signs you out everywhere and forces a password reset."
      danger
    >
      {msg && <Message tone={msg.type === 'success' ? 'success' : 'error'}>{msg.text}</Message>}
      <Button danger onClick={() => setOpen(true)} disabled={busy}>
        {busy ? 'Working...' : 'Sign out everywhere & reset password'}
      </Button>

      <ConfirmDialog
        open={open}
        title="Panic: sign out everywhere?"
        body="This revokes every active session, marks every device untrusted, and sends a password reset email. You'll be signed out of this device too. Continue?"
        confirmLabel="Yes, sign me out everywhere"
        cancelLabel="Cancel"
        danger
        busy={busy}
        onConfirm={doPanic}
        onCancel={() => setOpen(false)}
      />
    </SectionCard>
  )
}
