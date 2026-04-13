import { useCallback, useEffect, useState } from 'react'
import { API } from '../../config'
import { Button, Message, SectionCard } from './settingsShared'
import { FONT } from './settingsState'
import { Skeleton } from '../../components/Skeleton'

export default function SessionsTab() {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revoking, setRevoking] = useState(null) // session id being revoked
  const [actionMsg, setActionMsg] = useState(null)

  const fetchSessions = useCallback(async () => {
    try {
      setError('')
      const res = await fetch(`${API}/api/auth/sessions`, { credentials: 'include' })
      if (!res.ok) throw new Error('Could not load sessions.')
      const data = await res.json()
      setSessions(data.sessions || [])
    } catch (err) {
      setError(err.message || 'Failed to load sessions.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  async function handleRevoke(sessionId) {
    setRevoking(sessionId)
    setActionMsg(null)
    try {
      const res = await fetch(`${API}/api/auth/sessions/${sessionId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Could not revoke session.')
      }
      setSessions((prev) => prev.filter((s) => s.id !== sessionId))
      setActionMsg({ type: 'success', text: 'Session revoked.' })
    } catch (err) {
      setActionMsg({ type: 'error', text: err.message })
    } finally {
      setRevoking(null)
    }
  }

  async function handleRevokeAll() {
    setRevoking('all')
    setActionMsg(null)
    try {
      const res = await fetch(`${API}/api/auth/sessions`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Could not revoke sessions.')
      }
      setSessions((prev) => prev.filter((s) => s.isCurrent))
      setActionMsg({ type: 'success', text: 'All other sessions signed out.' })
    } catch (err) {
      setActionMsg({ type: 'error', text: err.message })
    } finally {
      setRevoking(null)
    }
  }

  if (loading) {
    return (
      <SectionCard title="Active Sessions" subtitle="Devices currently signed in to your account.">
        <Skeleton width="100%" height={60} style={{ marginBottom: 12 }} />
        <Skeleton width="100%" height={60} style={{ marginBottom: 12 }} />
        <Skeleton width="100%" height={60} />
      </SectionCard>
    )
  }

  if (error) {
    return (
      <SectionCard title="Active Sessions" subtitle="Devices currently signed in to your account.">
        <Message tone="error">{error}</Message>
        <Button
          onClick={() => {
            setLoading(true)
            fetchSessions()
          }}
        >
          Retry
        </Button>
      </SectionCard>
    )
  }

  const otherSessions = sessions.filter((s) => !s.isCurrent)

  return (
    <>
      <SectionCard title="Active Sessions" subtitle="Devices currently signed in to your account.">
        {actionMsg && (
          <Message tone={actionMsg.type === 'success' ? 'success' : 'error'}>
            {actionMsg.text}
          </Message>
        )}

        {sessions.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--sh-muted)' }}>No active sessions found.</p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sessions.map((session) => (
            <div
              key={session.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '14px 16px',
                borderRadius: 12,
                border: `1px solid ${session.isCurrent ? 'var(--sh-brand)' : 'var(--sh-border)'}`,
                background: session.isCurrent
                  ? 'var(--sh-brand-bg, rgba(99,102,241,0.06))'
                  : 'var(--sh-surface)',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <DeviceIcon label={session.deviceLabel} />
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: 'var(--sh-text)',
                      fontFamily: FONT,
                    }}
                  >
                    {session.deviceLabel || 'Unknown device'}
                  </span>
                  {session.isCurrent && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 6,
                        background: 'var(--sh-brand)',
                        color: '#fff',
                      }}
                    >
                      This device
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--sh-muted)',
                    display: 'flex',
                    gap: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  {session.ipAddress && <span>IP: {session.ipAddress}</span>}
                  <span>Last active: {formatRelative(session.lastActiveAt)}</span>
                  <span>Signed in: {formatRelative(session.createdAt)}</span>
                </div>
              </div>

              {!session.isCurrent && (
                <Button
                  danger
                  disabled={revoking === session.id}
                  onClick={() => handleRevoke(session.id)}
                  style={{ fontSize: 12, padding: '6px 12px', whiteSpace: 'nowrap' }}
                >
                  {revoking === session.id ? 'Revoking...' : 'Revoke'}
                </Button>
              )}
            </div>
          ))}
        </div>
      </SectionCard>

      {otherSessions.length > 0 && (
        <SectionCard
          title="Sign Out Other Devices"
          subtitle="Revoke all sessions except this one. Other devices will need to sign in again."
          danger
        >
          <Button danger disabled={revoking === 'all'} onClick={handleRevokeAll}>
            {revoking === 'all' ? 'Signing out...' : 'Sign out all other devices'}
          </Button>
        </SectionCard>
      )}
    </>
  )
}

function DeviceIcon({ label }) {
  const lc = (label || '').toLowerCase()
  let icon = 'desktop_windows'
  if (lc.includes('android') || lc.includes('ios')) icon = 'smartphone'
  else if (lc.includes('chromeos')) icon = 'laptop_chromebook'
  else if (lc.includes('macos') || lc.includes('linux') || lc.includes('windows')) icon = 'laptop'

  return (
    <span className="material-symbols-rounded" style={{ fontSize: 20, color: 'var(--sh-muted)' }}>
      {icon}
    </span>
  )
}

function formatRelative(dateStr) {
  if (!dateStr) return 'Unknown'
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now - date
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDays = Math.floor(diffHr / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}
