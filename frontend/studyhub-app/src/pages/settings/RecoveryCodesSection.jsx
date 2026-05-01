/**
 * RecoveryCodesSection — 2FA recovery codes management UI.
 *
 * Behind `flag_2fa_recovery_codes`. The flag check is the first
 * `GET /api/settings/2fa/recovery-codes/status` call: if it 404s
 * (fail-CLOSED on backend), the section silently doesn't render.
 *
 * UX:
 *   - Status row: "X of 10 codes remaining" + last-generated date.
 *   - Generate / Regenerate button → confirmation prompt → returns
 *     the 10 codes ONCE in a modal that blocks until the user clicks
 *     "I've saved them". Modal offers Copy + Download .txt.
 *   - Closing the modal without saving is allowed (the user can
 *     regenerate again) but heavily warned.
 *
 * Industry pattern: GitHub, Cloudflare, AWS all surface recovery
 * codes exactly once and require regeneration to retrieve again.
 */
import { useEffect, useState } from 'react'
import { API } from '../../config'
import FocusTrappedDialog from '../../components/Modal/FocusTrappedDialog'
import { Button, Message, SectionCard } from './settingsShared'

export default function RecoveryCodesSection({ user }) {
  const [status, setStatus] = useState(null) // { enabled, generatedAt, remainingCount, usedCount, maxCount }
  const [loaded, setLoaded] = useState(false)
  const [available, setAvailable] = useState(true) // false when flag is off (404)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showCodes, setShowCodes] = useState(null) // string[] | null
  const [confirmRegenerate, setConfirmRegenerate] = useState(false)
  const [savedAck, setSavedAck] = useState(false)

  async function loadStatus() {
    try {
      const res = await fetch(`${API}/api/settings/2fa/recovery-codes/status`, {
        credentials: 'include',
      })
      if (res.status === 404) {
        // Flag disabled. Hide the section silently.
        setAvailable(false)
        setLoaded(true)
        return
      }
      if (!res.ok) {
        setError('Could not load recovery code status.')
        setLoaded(true)
        return
      }
      const data = await res.json()
      setStatus(data)
      setLoaded(true)
    } catch {
      setError('Network error. Please retry.')
      setLoaded(true)
    }
  }

  useEffect(() => {
    loadStatus()
  }, [])

  async function regenerate() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`${API}/api/settings/2fa/recovery-codes/regenerate`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Could not generate recovery codes.')
        return
      }
      setShowCodes(data.codes || [])
      setSavedAck(false)
      setConfirmRegenerate(false)
      // Re-load status so the count + generatedAt update behind the modal.
      loadStatus()
    } catch {
      setError('Network error. Please retry.')
    } finally {
      setBusy(false)
    }
  }

  function copyCodes() {
    if (!showCodes) return
    const text = showCodes.join('\n')
    navigator.clipboard?.writeText(text).catch(() => {})
  }

  function downloadCodes() {
    if (!showCodes) return
    const username = user?.username || 'studyhub-user'
    const date = new Date().toISOString().slice(0, 10)
    const header = `# StudyHub 2FA recovery codes\n# user: ${username}\n# generated: ${date}\n# Save these somewhere safe — each code can be used exactly once.\n\n`
    const blob = new Blob([header + showCodes.join('\n') + '\n'], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `studyhub-recovery-codes-${username}-${date}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (!loaded) return null
  if (!available) return null

  // 2FA must be enabled before recovery codes are useful — recovery
  // codes are an alternative to email OTP, not a replacement for the
  // primary 2FA setup. The backend enforces the same rule.
  const twoFaOn = Boolean(status?.enabled)
  const remaining = status?.remainingCount ?? 0
  const generatedAt = status?.generatedAt ? new Date(status.generatedAt) : null
  const lowOnCodes = twoFaOn && generatedAt && remaining <= 2

  return (
    <SectionCard
      title="Recovery codes"
      subtitle="Single-use codes you can fall back on if you lose access to your email 2FA."
    >
      {error ? <Message tone="error">{error}</Message> : null}

      {!twoFaOn ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--sh-muted)' }}>
          Enable email 2FA above before generating recovery codes.
        </p>
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'grid', gap: 2, fontSize: 13 }}>
              {generatedAt ? (
                <>
                  <div>
                    <strong>{remaining}</strong> of {status.maxCount} codes remaining
                  </div>
                  <div style={{ color: 'var(--sh-muted)' }}>
                    Generated {generatedAt.toLocaleDateString()} · {status.usedCount} used
                  </div>
                </>
              ) : (
                <div style={{ color: 'var(--sh-muted)' }}>No recovery codes yet.</div>
              )}
            </div>
            <Button onClick={() => setConfirmRegenerate(true)} disabled={busy}>
              {generatedAt ? 'Regenerate codes' : 'Generate codes'}
            </Button>
          </div>

          {lowOnCodes ? (
            <Message tone="warning">
              You have {remaining} code{remaining === 1 ? '' : 's'} left. Regenerate to get a fresh
              batch — the old codes will stop working.
            </Message>
          ) : null}
        </>
      )}

      {/* Confirm regenerate (destructive — invalidates existing codes) */}
      <FocusTrappedDialog
        open={confirmRegenerate}
        onClose={() => setConfirmRegenerate(false)}
        ariaLabelledBy="rc-confirm-title"
        panelStyle={{ maxWidth: 440 }}
      >
        <h3 id="rc-confirm-title" style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>
          {generatedAt ? 'Regenerate recovery codes?' : 'Generate recovery codes?'}
        </h3>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--sh-text)' }}>
          {generatedAt
            ? 'Your existing codes will stop working immediately. Make sure you save the new ones somewhere safe — they will not be shown again.'
            : 'You will get 10 single-use codes. Each one signs you in if you cannot receive your email OTP. Save them somewhere safe — they will not be shown again after this screen.'}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <Button secondary onClick={() => setConfirmRegenerate(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={regenerate} disabled={busy}>
            {busy ? 'Generating…' : 'Continue'}
          </Button>
        </div>
      </FocusTrappedDialog>

      {/* Show-once codes modal */}
      <FocusTrappedDialog
        open={showCodes !== null}
        onClose={() => {
          if (savedAck) setShowCodes(null)
        }}
        ariaLabelledBy="rc-codes-title"
        // Force explicit acknowledgement — backdrop / Escape don't
        // dismiss until the user has clicked "I've saved them" so we
        // don't lose the codes to a stray click.
        clickOutsideDeactivates={false}
        escapeDeactivates={false}
        panelStyle={{ maxWidth: 480 }}
      >
        <h3 id="rc-codes-title" style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>
          Save these codes
        </h3>
        <p
          style={{
            margin: 0,
            fontSize: 13,
            lineHeight: 1.6,
            color: 'var(--sh-danger-text)',
          }}
        >
          These won't be shown again. Each code is single-use. Store them in a password manager or a
          printed copy in a safe place.
        </p>
        <pre
          style={{
            margin: 0,
            padding: 14,
            background: 'var(--sh-soft)',
            borderRadius: 10,
            border: '1px solid var(--sh-border)',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            fontSize: 14,
            lineHeight: 1.8,
            letterSpacing: '0.05em',
            userSelect: 'all',
            whiteSpace: 'pre',
          }}
        >
          {(showCodes || []).join('\n')}
        </pre>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Button secondary onClick={copyCodes}>
            Copy
          </Button>
          <Button secondary onClick={downloadCodes}>
            Download .txt
          </Button>
        </div>
        <label
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={savedAck}
            onChange={(e) => setSavedAck(e.target.checked)}
          />
          <span>I have saved these codes somewhere I can find them later.</span>
        </label>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button onClick={() => setShowCodes(null)} disabled={!savedAck}>
            Close
          </Button>
        </div>
      </FocusTrappedDialog>
    </SectionCard>
  )
}
