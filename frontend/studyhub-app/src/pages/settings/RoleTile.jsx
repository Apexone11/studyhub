import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { API } from '../../config'
import { roleLabel, ACCOUNT_TYPE_OPTIONS } from '../../lib/roleLabel'
import { showToast } from '../../lib/toast'
import { useRolesV2Flags } from '../../lib/rolesV2Flags'
import { Button, Message, SectionCard } from './settingsShared'
import { FONT } from './settingsState'

const PENDING_RELOAD_KEY = 'pending_role_reload'
const RELOAD_DELAY_MS = 1500

function formatRelative(msFromNow) {
  if (!Number.isFinite(msFromNow) || msFromNow <= 0) return 'expired'
  const hours = Math.floor(msFromNow / (60 * 60 * 1000))
  if (hours < 1) {
    const minutes = Math.max(1, Math.floor(msFromNow / (60 * 1000)))
    return `${minutes} minute${minutes === 1 ? '' : 's'}`
  }
  return `${hours} hour${hours === 1 ? '' : 's'}`
}

function Modal({ open, title, children, onClose }) {
  if (!open) return null
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.5)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--sh-surface)',
          borderRadius: 14,
          padding: 22,
          maxWidth: 440,
          width: '100%',
          fontFamily: FONT,
          display: 'grid',
          gap: 14,
          boxShadow: '0 10px 40px rgba(15, 23, 42, 0.25)',
        }}
      >
        <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--sh-heading)' }}>
          {title}
        </h3>
        {children}
      </div>
    </div>,
    document.body,
  )
}

export default function RoleTile({ user }) {
  const { revertWindow: revertFlagEnabled, loading: flagsLoading } = useRolesV2Flags()
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [changeOpen, setChangeOpen] = useState(false)
  const [revertOpen, setRevertOpen] = useState(false)
  const [targetRole, setTargetRole] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/users/me/role-status`, { credentials: 'include' })
      if (!res.ok) {
        setError('Could not load role status.')
        return
      }
      const data = await res.json()
      setStatus(data)
      setError('')
    } catch {
      setError('Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60 * 1000)
    return () => window.clearInterval(timer)
  }, [])

  const deadlineMs = useMemo(
    () => (status?.roleRevertDeadline ? new Date(status.roleRevertDeadline).getTime() : null),
    [status?.roleRevertDeadline],
  )
  const inRevertWindow = Boolean(deadlineMs && deadlineMs > now)
  const remainingText = useMemo(
    () => (inRevertWindow ? formatRelative(deadlineMs - now) : ''),
    [inRevertWindow, deadlineMs, now],
  )

  const handleReloadToApply = useCallback((target) => {
    try {
      localStorage.setItem(
        PENDING_RELOAD_KEY,
        JSON.stringify({ targetRole: target, startedAt: Date.now() }),
      )
    } catch {
      /* ignore */
    }
    showToast('Role updated. Refreshing to apply changes.', 'success')
    window.setTimeout(() => {
      window.location.reload()
    }, RELOAD_DELAY_MS)
  }, [])

  const submitChange = useCallback(
    async (accountType, { isRevert = false } = {}) => {
      setSubmitting(true)
      try {
        const res = await fetch(`${API}/api/users/me/account-type`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountType }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          const message =
            data.code === 'COOLDOWN'
              ? data.error ||
                'You can only change your role 3 times every 30 days. Try again later.'
              : data.error || 'Could not update role.'
          showToast(message, 'error')
          return
        }
        if (
          isRevert &&
          typeof data.unavailableCourseCount === 'number' &&
          data.unavailableCourseCount > 0
        ) {
          const restored = data.restoredEnrollmentCount || 0
          const missing = data.unavailableCourseCount
          showToast(
            `Restored ${restored} course${restored === 1 ? '' : 's'}. ${missing} course${missing === 1 ? '' : 's'} no longer available.`,
            'info',
          )
        }
        setChangeOpen(false)
        setRevertOpen(false)
        handleReloadToApply(accountType)
      } finally {
        setSubmitting(false)
      }
    },
    [handleReloadToApply],
  )

  if (loading || flagsLoading) {
    return (
      <SectionCard title="Your role">
        <div style={{ color: 'var(--sh-muted)', fontSize: 13 }}>Loading…</div>
      </SectionCard>
    )
  }
  if (!revertFlagEnabled) {
    // Flag-gated: compact read-only tile so the label is still visible.
    const currentLabel = roleLabel(status?.accountType || user?.accountType)
    return (
      <SectionCard title="Your role">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ fontSize: 13, color: 'var(--sh-text)' }}>
            Currently: <strong>{currentLabel}</strong>
          </div>
          <div style={{ fontSize: 12, color: 'var(--sh-muted)' }}>
            Role changes are temporarily unavailable.
          </div>
        </div>
      </SectionCard>
    )
  }
  if (!status) {
    return (
      <SectionCard title="Your role">
        <Message tone="danger">{error || 'Role status unavailable.'}</Message>
      </SectionCard>
    )
  }

  const currentLabel = roleLabel(status.accountType)
  const previousLabel = status.previousAccountType ? roleLabel(status.previousAccountType) : ''
  const remainingBudget = Math.max(0, Number(status.changesRemainingLast30Days ?? 0))

  return (
    <SectionCard title="Your role" subtitle={inRevertWindow ? `You are a ${currentLabel}.` : null}>
      {inRevertWindow ? (
        <>
          <Message tone="warning">
            You have <strong>{remainingText}</strong> to revert to <strong>{previousLabel}</strong>{' '}
            at no cost.
          </Message>
          <div
            style={{
              display: 'flex',
              gap: 10,
              flexWrap: 'wrap',
              justifyContent: 'flex-end',
              marginTop: 12,
            }}
          >
            <Button onClick={() => setRevertOpen(true)}>Revert to {previousLabel}</Button>
            <Button secondary onClick={() => setChangeOpen(true)}>
              Change role
            </Button>
          </div>
        </>
      ) : (
        // Compact treatment: status + action collapse to a single row.
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--sh-text)' }}>
              Currently: <strong>{currentLabel}</strong>
            </div>
            <div style={{ fontSize: 12, color: 'var(--sh-muted)' }}>
              {remainingBudget} change{remainingBudget === 1 ? '' : 's'} remaining in the next 30
              days · 2-day free revert
            </div>
          </div>
          <Button onClick={() => setChangeOpen(true)}>Change role</Button>
        </div>
      )}

      <Modal
        open={changeOpen}
        title="Change role"
        onClose={() => !submitting && setChangeOpen(false)}
      >
        <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 8 }}>
          <legend style={{ fontSize: 12, fontWeight: 700, color: 'var(--sh-heading)' }}>
            New role
          </legend>
          {ACCOUNT_TYPE_OPTIONS.filter((opt) => opt.value !== status.accountType).map((opt) => (
            <label
              key={opt.value}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                border: `1px solid ${
                  targetRole === opt.value ? 'var(--sh-brand)' : 'var(--sh-border)'
                }`,
                borderRadius: 10,
                cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                name="role-target"
                value={opt.value}
                checked={targetRole === opt.value}
                onChange={() => setTargetRole(opt.value)}
              />
              <span style={{ fontSize: 13, fontWeight: 600 }}>{opt.label}</span>
            </label>
          ))}
        </fieldset>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--sh-subtext)' }}>
          You can revert this free for 2 days. After that, this becomes your role and you can only
          change again {Math.max(0, remainingBudget - 1)} time
          {remainingBudget - 1 === 1 ? '' : 's'} in the next 30 days.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button secondary onClick={() => setChangeOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={() => targetRole && submitChange(targetRole)}
            disabled={submitting || !targetRole}
          >
            {submitting ? 'Updating…' : 'Change role'}
          </Button>
        </div>
      </Modal>

      <Modal
        open={revertOpen}
        title={`Revert to ${previousLabel}?`}
        onClose={() => !submitting && setRevertOpen(false)}
      >
        <p style={{ margin: 0, fontSize: 13, color: 'var(--sh-subtext)' }}>
          You will go back to being a <strong>{previousLabel}</strong>. We will automatically
          restore your previous school and courses. Your posts, sheets, notes, and connections are
          untouched.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button secondary onClick={() => setRevertOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={() => submitChange(status.previousAccountType, { isRevert: true })}
            disabled={submitting}
          >
            {submitting ? 'Reverting…' : 'Revert'}
          </Button>
        </div>
      </Modal>

      {user?.role === 'admin' ? (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--sh-muted)' }}>
          Admin privileges are independent of your role.
        </div>
      ) : null}
    </SectionCard>
  )
}
