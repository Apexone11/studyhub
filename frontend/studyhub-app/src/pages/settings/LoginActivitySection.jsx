import { useCallback, useEffect, useState } from 'react'
import { API } from '../../config'
import { Button, Message, SectionCard } from './settingsShared'
import { FONT } from './settingsState'
import { Skeleton } from '../../components/Skeleton'
import {
  IconDeviceLaptop,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconDeviceTablet,
  IconDeviceWatch,
  IconDeviceUnknown,
} from '../../components/Icons'

function iconFor(kind) {
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

function formatLocation(e) {
  const parts = []
  if (e.city) parts.push(e.city)
  if (e.region) parts.push(e.region)
  if (e.country) parts.push(e.country)
  return parts.join(', ')
}

function formatTimestamp(dateStr) {
  if (!dateStr) return 'unknown'
  const d = new Date(dateStr)
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function riskBadge(band, riskScore) {
  // Phase 2 surfaces band as a small pill. Colors pull from existing semantic tokens.
  const palette = {
    normal: {
      bg: 'var(--sh-success-bg)',
      border: 'var(--sh-success-border)',
      text: 'var(--sh-success-text)',
      label: 'Normal',
    },
    notify: {
      bg: 'var(--sh-warning-bg)',
      border: 'var(--sh-warning-border)',
      text: 'var(--sh-warning-text)',
      label: 'Reviewed',
    },
    challenge: {
      bg: 'var(--sh-danger-bg)',
      border: 'var(--sh-danger-border)',
      text: 'var(--sh-danger-text)',
      label: 'Challenged',
    },
    blocked: {
      bg: 'var(--sh-danger-bg)',
      border: 'var(--sh-danger-border)',
      text: 'var(--sh-danger-text)',
      label: 'Blocked',
    },
  }
  const p = palette[band] || palette.normal
  return (
    <span
      title={riskScore != null ? `Risk score ${riskScore}` : undefined}
      style={{
        fontSize: 11,
        fontWeight: 700,
        padding: '2px 8px',
        borderRadius: 6,
        background: p.bg,
        border: `1px solid ${p.border}`,
        color: p.text,
      }}
    >
      {p.label}
    </span>
  )
}

export default function LoginActivitySection() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchActivity = useCallback(async () => {
    try {
      setError('')
      const res = await fetch(`${API}/api/auth/security/login-activity?limit=30`, {
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Could not load login activity.')
      const data = await res.json()
      setEvents(data.events || [])
    } catch (err) {
      setError(err.message || 'Failed to load login activity.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchActivity()
  }, [fetchActivity])

  if (loading) {
    return (
      <SectionCard
        title="Login activity"
        subtitle="Recent sign-ins on your account. New locations or unusual risk will show here."
      >
        <Skeleton width="100%" height={56} style={{ marginBottom: 10 }} />
        <Skeleton width="100%" height={56} style={{ marginBottom: 10 }} />
        <Skeleton width="100%" height={56} />
      </SectionCard>
    )
  }

  if (error) {
    return (
      <SectionCard title="Login activity" subtitle="Recent sign-ins on your account.">
        <Message tone="error">{error}</Message>
        <Button
          onClick={() => {
            setLoading(true)
            fetchActivity()
          }}
        >
          Retry
        </Button>
      </SectionCard>
    )
  }

  if (events.length === 0) {
    return (
      <SectionCard title="Login activity" subtitle="Recent sign-ins on your account.">
        <p style={{ fontSize: 13, color: 'var(--sh-muted)' }}>No login events recorded yet.</p>
      </SectionCard>
    )
  }

  return (
    <SectionCard
      title="Login activity"
      subtitle="Your last 30 sign-ins. If anything here wasn't you, revoke the device and change your password."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {events.map((e) => {
          const Icon = iconFor(e.deviceKind || 'unknown')
          const location = formatLocation(e)
          return (
            <div
              key={e.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid var(--sh-border)',
                background: 'var(--sh-soft)',
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'var(--sh-surface)',
                  color: 'var(--sh-muted)',
                  flexShrink: 0,
                }}
              >
                <Icon size={18} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'wrap',
                    marginBottom: 2,
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--sh-text)',
                      fontFamily: FONT,
                    }}
                  >
                    {e.deviceLabel || 'Unknown device'}
                  </span>
                  {riskBadge(e.band, e.riskScore)}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--sh-muted)',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 10,
                  }}
                >
                  {location && <span>{location}</span>}
                  {e.ipAddress && (
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{e.ipAddress}</span>
                  )}
                  <span>{formatTimestamp(e.createdAt)}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </SectionCard>
  )
}
