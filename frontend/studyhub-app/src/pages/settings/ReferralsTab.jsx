/**
 * ReferralsTab.jsx -- Referral summary for the Settings page.
 *
 * Shows referral code, copyable link, summary stats, milestone progress,
 * and a link to the full /invite management page.
 */
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { API } from '../../config'
import { SectionCard, Button, Message } from './settingsShared'
import { FONT } from './settingsState'
import { Skeleton } from '../../components/Skeleton'

const MILESTONES = [
  { threshold: 5, proMonths: 1, label: '1 month free Pro' },
  { threshold: 15, proMonths: 3, label: '3 months free Pro' },
  { threshold: 30, proMonths: 6, label: '6 months free Pro' },
  { threshold: 50, proMonths: 12, label: '12 months free Pro' },
]

export default function ReferralsTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/referrals/me`, { credentials: 'include' })
      if (!res.ok) throw new Error('Could not load referral data.')
      const json = await res.json()
      setData(json)
      setError('')
    } catch {
      setError('Could not load referral data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(fetchData)
  }, [fetchData])

  const referralUrl = data?.code ? `${window.location.origin}/register?ref=${data.code}` : ''

  async function handleCopy() {
    if (!referralUrl) return
    try {
      await navigator.clipboard.writeText(referralUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      fetch(`${API}/api/referrals/track-share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ channel: 'copy' }),
      }).catch(() => {})
    } catch {
      // Clipboard API not available
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <SectionCard title="Your Referral Link" subtitle="Loading your referral details…">
          <Skeleton width="100%" height={44} borderRadius={10} />
        </SectionCard>
        <SectionCard title="Referral Summary">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <Skeleton width="100%" height={68} borderRadius={12} />
            <Skeleton width="100%" height={68} borderRadius={12} />
            <Skeleton width="100%" height={68} borderRadius={12} />
          </div>
        </SectionCard>
      </div>
    )
  }

  if (error && !data) {
    return <Message tone="error">{error}</Message>
  }

  const stats = data?.stats || { sent: 0, accepted: 0, pending: 0 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Referral Link */}
      <SectionCard
        title="Your Referral Link"
        subtitle="Share this link with classmates to earn rewards."
      >
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            readOnly
            value={referralUrl}
            style={{
              flex: '1 1 260px',
              padding: '10px 14px',
              borderRadius: 10,
              border: '1px solid var(--sh-border)',
              background: 'var(--sh-soft)',
              fontSize: 13,
              fontFamily: FONT,
              color: 'var(--sh-text)',
              outline: 'none',
              minWidth: 0,
            }}
            onFocus={(e) => e.target.select()}
          />
          <Button onClick={handleCopy} style={{ whiteSpace: 'nowrap' }}>
            {copied ? 'Link copied' : 'Copy link'}
          </Button>
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--sh-muted)' }}>
          Code: <strong>{data?.code || '--'}</strong>
        </div>
      </SectionCard>

      {/* Summary Stats */}
      <SectionCard title="Referral Summary">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
            gap: 12,
          }}
        >
          {[
            { label: 'Sent', value: stats.sent },
            { label: 'Accepted', value: stats.accepted },
            { label: 'Pending', value: stats.pending },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                background: 'var(--sh-soft)',
                borderRadius: 12,
                padding: '14px 16px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--sh-heading)' }}>
                {s.value}
              </div>
              <div
                style={{ fontSize: 12, fontWeight: 600, color: 'var(--sh-muted)', marginTop: 2 }}
              >
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Milestone Progress */}
      <SectionCard title="Milestones">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {MILESTONES.map((m) => {
            const unlocked = stats.accepted >= m.threshold
            const pct = Math.min((stats.accepted / m.threshold) * 100, 100)
            return (
              <div
                key={m.threshold}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: `1px solid ${unlocked ? 'var(--sh-success-border)' : 'var(--sh-border)'}`,
                  background: unlocked ? 'var(--sh-success-bg)' : 'transparent',
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 800,
                    flexShrink: 0,
                    background: unlocked ? 'var(--sh-success-border)' : 'var(--sh-soft)',
                    color: unlocked ? 'var(--sh-success-text)' : 'var(--sh-muted)',
                  }}
                >
                  {unlocked ? (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    m.threshold
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: unlocked ? 'var(--sh-success-text)' : 'var(--sh-text)',
                    }}
                  >
                    {m.threshold} referrals — {m.label}
                  </div>
                  {!unlocked && (
                    <div
                      style={{
                        height: 4,
                        borderRadius: 2,
                        background: 'var(--sh-soft)',
                        overflow: 'hidden',
                        marginTop: 6,
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          borderRadius: 2,
                          background: 'var(--sh-brand)',
                          width: `${pct}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </SectionCard>

      {/* Link to full page */}
      <div style={{ textAlign: 'center', paddingTop: 4 }}>
        <Link
          to="/invite"
          style={{
            color: 'var(--sh-brand)',
            fontSize: 14,
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          Manage invites and view full history
        </Link>
      </div>
    </div>
  )
}
