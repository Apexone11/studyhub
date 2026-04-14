/* ===================================================================
 * InvitePage.jsx -- Referral management: share link, send email
 * invites, track stats, view milestones, and recent invite history.
 * =================================================================== */
import { useCallback, useEffect, useState } from 'react'
import Navbar from '../../components/navbar/Navbar'
import AppSidebar from '../../components/sidebar/AppSidebar'
import { API } from '../../config'
import { usePageTitle } from '../../lib/usePageTitle'
import { PageShell } from '../shared/pageScaffold'
import { Skeleton } from '../../components/Skeleton'

const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"

const MILESTONES = [
  { threshold: 5, proMonths: 1, label: '1 month free Pro' },
  { threshold: 15, proMonths: 3, label: '3 months free Pro' },
  { threshold: 30, proMonths: 6, label: '6 months free Pro' },
  { threshold: 50, proMonths: 12, label: '12 months free Pro' },
]

function fmtDate(iso) {
  if (!iso) return '--'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/* ─── Sub-components ─────────────────────────────────────────────── */

function Card({ title, children }) {
  return (
    <section
      style={{
        background: 'var(--sh-surface)',
        borderRadius: 16,
        border: '1px solid var(--sh-border)',
        padding: 24,
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {title && (
        <h3
          style={{
            margin: '0 0 16px',
            fontSize: 17,
            fontWeight: 800,
            color: 'var(--sh-heading)',
          }}
        >
          {title}
        </h3>
      )}
      {children}
    </section>
  )
}

function StatBox({ label, value }) {
  return (
    <div
      style={{
        background: 'var(--sh-soft)',
        borderRadius: 12,
        padding: '16px 20px',
        textAlign: 'center',
        flex: '1 1 120px',
      }}
    >
      <div
        style={{
          fontSize: 28,
          fontWeight: 800,
          color: 'var(--sh-heading)',
          lineHeight: 1.2,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--sh-muted)',
          marginTop: 4,
        }}
      >
        {label}
      </div>
    </div>
  )
}

function MilestoneTrack({ accepted }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {MILESTONES.map((m) => {
        const unlocked = accepted >= m.threshold
        const progress = Math.min((accepted / m.threshold) * 100, 100)
        return (
          <div
            key={m.threshold}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '14px 16px',
              borderRadius: 12,
              border: `1px solid ${unlocked ? 'var(--sh-success-border)' : 'var(--sh-border)'}`,
              background: unlocked ? 'var(--sh-success-bg)' : 'var(--sh-surface)',
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                fontWeight: 800,
                flexShrink: 0,
                background: unlocked ? 'var(--sh-success-border)' : 'var(--sh-soft)',
                color: unlocked ? 'var(--sh-success-text)' : 'var(--sh-muted)',
              }}
            >
              {unlocked ? (
                <svg
                  width="16"
                  height="16"
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
                  fontSize: 14,
                  fontWeight: 700,
                  color: unlocked ? 'var(--sh-success-text)' : 'var(--sh-heading)',
                  marginBottom: 4,
                }}
              >
                {m.threshold} referrals — {m.label}
              </div>
              {!unlocked && (
                <div
                  style={{
                    height: 6,
                    borderRadius: 3,
                    background: 'var(--sh-soft)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      borderRadius: 3,
                      background: 'var(--sh-brand)',
                      width: `${progress}%`,
                      transition: 'width .3s ease',
                    }}
                  />
                </div>
              )}
              {unlocked && (
                <div style={{ fontSize: 12, color: 'var(--sh-success-text)', fontWeight: 600 }}>
                  Unlocked
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ─── Main Page ──────────────────────────────────────────────────── */

export default function InvitePage() {
  usePageTitle('Invite Classmates')

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Share link state
  const [copied, setCopied] = useState(false)

  // Email composer state
  const [emails, setEmails] = useState(['', '', ''])
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/referrals/me`, { credentials: 'include' })
      if (!res.ok) throw new Error('Could not load referral data.')
      const json = await res.json()
      setData(json)
      setError('')
    } catch {
      setError('Could not load referral data. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const referralUrl = data?.code ? `${window.location.origin}/register?ref=${data.code}` : ''

  async function handleCopy() {
    if (!referralUrl) return
    try {
      await navigator.clipboard.writeText(referralUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      // Track share
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

  function setEmail(index, value) {
    setEmails((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }

  async function handleSendInvites(e) {
    e.preventDefault()
    const validEmails = emails.map((e) => e.trim()).filter(Boolean)
    if (validEmails.length === 0) {
      setSendResult({ type: 'error', text: 'Enter at least one email address.' })
      return
    }

    setSending(true)
    setSendResult(null)

    try {
      const res = await fetch(`${API}/api/referrals/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ emails: validEmails }),
      })
      const json = await res.json()
      if (!res.ok) {
        setSendResult({ type: 'error', text: json.error || 'Could not send invites.' })
        return
      }
      const parts = []
      if (json.sent > 0) parts.push(`${json.sent} invite${json.sent > 1 ? 's' : ''} sent`)
      if (json.skipped > 0) parts.push(`${json.skipped} skipped (already invited or registered)`)
      setSendResult({
        type: json.sent > 0 ? 'success' : 'info',
        text: parts.join('. ') || 'Done.',
      })
      if (json.sent > 0) {
        setEmails(['', '', ''])
        fetchData()
      }
    } catch {
      setSendResult({ type: 'error', text: 'Network error. Please try again.' })
    } finally {
      setSending(false)
    }
  }

  const stats = data?.stats || { sent: 0, accepted: 0, pending: 0 }
  const acceptanceRate = stats.sent > 0 ? Math.round((stats.accepted / stats.sent) * 100) : 0
  const invites = data?.invites || []

  /* ── Loading ──────────────────────────────────────────────────── */

  if (loading) {
    return (
      <PageShell
        nav={<Navbar crumbs={[{ label: 'Invite Classmates', to: '/invite' }]} />}
        sidebar={<AppSidebar />}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, fontFamily: FONT }}>
          <Skeleton width="100%" height={140} borderRadius={16} />
          <Skeleton width="100%" height={200} borderRadius={16} />
          <Skeleton width="100%" height={160} borderRadius={16} />
        </div>
      </PageShell>
    )
  }

  if (error && !data) {
    return (
      <PageShell
        nav={<Navbar crumbs={[{ label: 'Invite Classmates', to: '/invite' }]} />}
        sidebar={<AppSidebar />}
      >
        <div style={{ textAlign: 'center', padding: '60px 24px', fontFamily: FONT }}>
          <h2
            style={{
              margin: '0 0 8px',
              color: 'var(--sh-heading)',
              fontSize: 20,
              fontWeight: 800,
            }}
          >
            Something went wrong
          </h2>
          <p style={{ margin: '0 0 20px', color: 'var(--sh-subtext)', fontSize: 14 }}>{error}</p>
          <button
            type="button"
            onClick={() => {
              setLoading(true)
              fetchData()
            }}
            style={{
              padding: '10px 20px',
              borderRadius: 10,
              border: 'none',
              background: 'var(--sh-brand)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Try again
          </button>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell
      nav={<Navbar crumbs={[{ label: 'Invite Classmates', to: '/invite' }]} />}
      sidebar={<AppSidebar />}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, fontFamily: FONT }}>
        {/* ── Share Link Card ──────────────────────────────────────── */}
        <Card title="Your referral link">
          <p
            style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--sh-muted)', lineHeight: 1.6 }}
          >
            Share this link with classmates. When they sign up, you both earn rewards.
          </p>
          <div
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
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
            <button
              type="button"
              onClick={handleCopy}
              style={{
                padding: '10px 20px',
                borderRadius: 10,
                border: 'none',
                background: copied ? 'var(--sh-success-bg)' : 'var(--sh-brand)',
                color: copied ? 'var(--sh-success-text)' : '#fff',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: FONT,
                transition: 'background .2s, color .2s',
                whiteSpace: 'nowrap',
              }}
            >
              {copied ? 'Link copied' : 'Copy link'}
            </button>
          </div>
        </Card>

        {/* ── Email Composer ───────────────────────────────────────── */}
        <Card title="Invite by email">
          <form onSubmit={handleSendInvites}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
              {emails.map((email, i) => (
                <input
                  key={i}
                  type="email"
                  placeholder={`Classmate email ${i + 1}`}
                  value={email}
                  onChange={(e) => setEmail(i, e.target.value)}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 10,
                    border: '1px solid var(--sh-input-border)',
                    background: 'var(--sh-input-bg)',
                    color: 'var(--sh-input-text)',
                    fontSize: 14,
                    fontFamily: FONT,
                    outline: 'none',
                  }}
                />
              ))}
            </div>
            {sendResult && (
              <div
                style={{
                  marginBottom: 12,
                  padding: '10px 14px',
                  borderRadius: 10,
                  fontSize: 13,
                  lineHeight: 1.5,
                  background:
                    sendResult.type === 'success'
                      ? 'var(--sh-success-bg)'
                      : sendResult.type === 'info'
                        ? 'var(--sh-info-bg)'
                        : 'var(--sh-danger-bg)',
                  color:
                    sendResult.type === 'success'
                      ? 'var(--sh-success-text)'
                      : sendResult.type === 'info'
                        ? 'var(--sh-info-text)'
                        : 'var(--sh-danger-text)',
                  border: `1px solid ${
                    sendResult.type === 'success'
                      ? 'var(--sh-success-border)'
                      : sendResult.type === 'info'
                        ? 'var(--sh-info-border)'
                        : 'var(--sh-danger-border)'
                  }`,
                }}
              >
                {sendResult.text}
              </div>
            )}
            <button
              type="submit"
              disabled={sending}
              style={{
                padding: '10px 22px',
                borderRadius: 10,
                border: 'none',
                background: 'var(--sh-brand)',
                color: '#fff',
                fontSize: 14,
                fontWeight: 700,
                cursor: sending ? 'not-allowed' : 'pointer',
                opacity: sending ? 0.7 : 1,
                fontFamily: FONT,
              }}
            >
              {sending ? 'Sending...' : 'Send invites'}
            </button>
          </form>
        </Card>

        {/* ── Stats Card ───────────────────────────────────────────── */}
        <Card title="Your referral stats">
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <StatBox label="Sent" value={stats.sent} />
            <StatBox label="Accepted" value={stats.accepted} />
            <StatBox label="Acceptance rate" value={`${acceptanceRate}%`} />
          </div>
          {data?.nextMilestone && (
            <div
              style={{
                marginTop: 16,
                padding: '14px 16px',
                borderRadius: 12,
                background: 'var(--sh-soft)',
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--sh-text)',
                  marginBottom: 8,
                }}
              >
                Next milestone: {stats.accepted} of {data.nextMilestone.threshold} referrals for{' '}
                {data.nextMilestone.proMonths} month{data.nextMilestone.proMonths > 1 ? 's' : ''}{' '}
                free Pro
              </div>
              <div
                style={{
                  height: 8,
                  borderRadius: 4,
                  background: 'var(--sh-border)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    borderRadius: 4,
                    background: 'var(--sh-brand)',
                    width: `${Math.min((stats.accepted / data.nextMilestone.threshold) * 100, 100)}%`,
                    transition: 'width .3s ease',
                  }}
                />
              </div>
            </div>
          )}
        </Card>

        {/* ── Reward Milestones ─────────────────────────────────────── */}
        <Card title="Reward milestones">
          <MilestoneTrack accepted={stats.accepted} />
        </Card>

        {/* ── Recent Invites Table ──────────────────────────────────── */}
        <Card title="Recent invites">
          {invites.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--sh-muted)', padding: '12px 0' }}>
              No invites sent yet. Share your link or send email invites above.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: 13,
                  fontFamily: FONT,
                }}
              >
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--sh-border)' }}>
                    {['Recipient', 'Channel', 'Status', 'Date'].map((h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: 'left',
                          padding: '8px 10px',
                          fontSize: 12,
                          fontWeight: 700,
                          color: 'var(--sh-muted)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {invites.slice(0, 20).map((inv, i) => (
                    <tr key={inv.id || i} style={{ borderBottom: '1px solid var(--sh-soft)' }}>
                      <td style={{ padding: 10, color: 'var(--sh-text)' }}>
                        {inv.email || 'Link share'}
                      </td>
                      <td style={{ padding: 10, color: 'var(--sh-muted)' }}>
                        {inv.channel || '--'}
                      </td>
                      <td style={{ padding: 10 }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 5,
                            fontSize: 11,
                            fontWeight: 600,
                            background:
                              inv.status === 'accepted'
                                ? 'var(--sh-success-bg)'
                                : 'var(--sh-warning-bg)',
                            color:
                              inv.status === 'accepted'
                                ? 'var(--sh-success-text)'
                                : 'var(--sh-warning-text)',
                          }}
                        >
                          {inv.status || 'pending'}
                        </span>
                      </td>
                      <td style={{ padding: 10, color: 'var(--sh-muted)', whiteSpace: 'nowrap' }}>
                        {fmtDate(inv.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </PageShell>
  )
}
