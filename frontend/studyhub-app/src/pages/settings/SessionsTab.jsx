import { useCallback, useEffect, useState } from 'react'
import { API } from '../../config'
import { Button, Message, SectionCard } from './settingsShared'
import { FONT } from './settingsState'
import { Skeleton } from '../../components/Skeleton'
import { ConfirmDialog } from './ConfirmDialog'
import {
  IconDeviceLaptop,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconDeviceTablet,
  IconDeviceWatch,
  IconDeviceUnknown,
} from '../../components/Icons'

function iconForSession(session) {
  // Phase 1a: degrade gracefully when server has not yet populated deviceKind
  // (that field lands in Phase 1b). We derive from deviceLabel as a fallback.
  const kind = session.deviceKind || inferKindFromLabel(session.deviceLabel)
  switch (kind) {
    case 'laptop':
      return IconDeviceLaptop
    case 'desktop':
      return IconDeviceDesktop
    case 'mobile':
      return IconDeviceMobile
    case 'tablet':
      return IconDeviceTablet
    case 'watch':
      return IconDeviceWatch
    default:
      return IconDeviceUnknown
  }
}

function inferKindFromLabel(label) {
  const lc = (label || '').toLowerCase()
  if (lc.includes('ipad')) return 'tablet'
  if (lc.includes('android') && !lc.includes('mobile')) return 'tablet'
  if (lc.includes('ios') || lc.includes('android') || lc.includes('iphone')) return 'mobile'
  if (
    lc.includes('windows') ||
    lc.includes('macos') ||
    lc.includes('linux') ||
    lc.includes('chromeos')
  )
    return 'laptop'
  return 'unknown'
}

function formatLocation(session) {
  const parts = []
  if (session.city) parts.push(session.city)
  if (session.region) parts.push(session.region)
  if (session.country) parts.push(session.country)
  return parts.join(', ')
}

function formatRelative(dateStr) {
  if (!dateStr) return 'unknown'
  const date = new Date(dateStr)
  const diffMs = Date.now() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDays = Math.floor(diffHr / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

export default function SessionsTab() {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revoking, setRevoking] = useState(null)
  const [actionMsg, setActionMsg] = useState(null)
  const [confirmTarget, setConfirmTarget] = useState(null) // session object or 'all'

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

  async function doRevoke(sessionId) {
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
      setActionMsg({ type: 'success', text: 'Device signed out.' })
    } catch (err) {
      setActionMsg({ type: 'error', text: err.message })
    } finally {
      setRevoking(null)
      setConfirmTarget(null)
    }
  }

  async function doRevokeAll() {
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
      setActionMsg({ type: 'success', text: 'All other devices signed out.' })
    } catch (err) {
      setActionMsg({ type: 'error', text: err.message })
    } finally {
      setRevoking(null)
      setConfirmTarget(null)
    }
  }

  if (loading) {
    return (
      <SectionCard title="Active Sessions" subtitle="Devices currently signed in to your account.">
        <Skeleton width="100%" height={72} style={{ marginBottom: 10 }} />
        <Skeleton width="100%" height={72} style={{ marginBottom: 10 }} />
        <Skeleton width="100%" height={72} />
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
    <SectionCard title="Active Sessions" subtitle="Devices currently signed in to your account.">
      {actionMsg && (
        <Message tone={actionMsg.type === 'success' ? 'success' : 'error'}>
          {actionMsg.text}
        </Message>
      )}

      {sessions.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--sh-muted)' }}>Only this device is signed in.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {sessions.map((session) => {
          const Icon = iconForSession(session)
          const isCurrent = !!session.isCurrent
          const location = formatLocation(session)
          return (
            <div
              key={session.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 16,
                padding: '16px 18px',
                borderRadius: 14,
                border: `1px solid ${isCurrent ? 'var(--sh-brand)' : 'var(--sh-border)'}`,
                background: isCurrent
                  ? 'var(--sh-brand-bg, rgba(99,102,241,0.06))'
                  : 'var(--sh-surface)',
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'var(--sh-soft)',
                  color: isCurrent ? 'var(--sh-brand)' : 'var(--sh-muted)',
                  flexShrink: 0,
                }}
              >
                <Icon size={26} />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'wrap',
                    marginBottom: 4,
                  }}
                >
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: 'var(--sh-text)',
                      fontFamily: FONT,
                    }}
                  >
                    {session.deviceLabel || 'Unknown device'}
                  </span>
                  {isCurrent && (
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
                {(location || session.ipAddress) && (
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--sh-muted)',
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 10,
                      marginBottom: 2,
                    }}
                  >
                    {location && <span>{location}</span>}
                    {session.ipAddress && (
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {session.ipAddress}
                      </span>
                    )}
                  </div>
                )}
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--sh-muted)',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 10,
                  }}
                >
                  <span>Signed in {formatRelative(session.createdAt)}</span>
                  <span>Last active {formatRelative(session.lastActiveAt)}</span>
                </div>
              </div>

              {!isCurrent && (
                <Button
                  danger
                  disabled={revoking === session.id}
                  onClick={() => setConfirmTarget(session)}
                  style={{
                    fontSize: 12,
                    padding: '8px 14px',
                    whiteSpace: 'nowrap',
                    alignSelf: 'center',
                  }}
                >
                  {revoking === session.id ? 'Revoking...' : 'Revoke'}
                </Button>
              )}
            </div>
          )
        })}
      </div>

      {otherSessions.length >= 2 && (
        <div
          style={{
            position: 'sticky',
            bottom: 0,
            marginTop: 14,
            padding: '12px 14px',
            borderRadius: 12,
            background: 'var(--sh-surface)',
            border: '1px solid var(--sh-border)',
            boxShadow: 'var(--shadow-sm)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <span style={{ fontSize: 13, color: 'var(--sh-muted)' }}>
            {otherSessions.length} other devices signed in.
          </span>
          <Button
            danger
            disabled={revoking === 'all'}
            onClick={() => setConfirmTarget('all')}
            style={{ fontSize: 13, padding: '8px 14px' }}
          >
            Sign out all other devices
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirmTarget === 'all'}
        title="Sign out all other devices?"
        body={`This will revoke ${otherSessions.length} session${otherSessions.length === 1 ? '' : 's'}. Each device will need to sign in again.`}
        confirmLabel="Sign out all"
        danger
        busy={revoking === 'all'}
        onConfirm={doRevokeAll}
        onCancel={() => setConfirmTarget(null)}
      />

      <ConfirmDialog
        open={!!confirmTarget && confirmTarget !== 'all'}
        title="Sign this device out?"
        body={
          confirmTarget && confirmTarget !== 'all'
            ? `This will revoke ${confirmTarget.deviceLabel || 'the device'}. It will need to sign in again to access your account.`
            : ''
        }
        confirmLabel="Sign out"
        danger
        busy={!!(confirmTarget && confirmTarget !== 'all' && revoking === confirmTarget.id)}
        onConfirm={() => confirmTarget && confirmTarget !== 'all' && doRevoke(confirmTarget.id)}
        onCancel={() => setConfirmTarget(null)}
      />
    </SectionCard>
  )
}
