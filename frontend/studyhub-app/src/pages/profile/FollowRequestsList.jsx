/* ═══════════════════════════════════════════════════════════════════════════
 * FollowRequestsList.jsx — Expandable follow requests card for own profile
 *
 * Shows pending follow requests with Accept/Decline actions.
 * Only rendered on the user's own profile page.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { API } from '../../config'
import UserAvatar from '../../components/UserAvatar'
import { showToast } from '../../lib/toast'
import { cardStyle, FONT } from './profileConstants'

function authHeaders() {
  return { 'Content-Type': 'application/json' }
}

export default function FollowRequestsList() {
  const [requests, setRequests] = useState([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [busyId, setBusyId] = useState(null)

  const loadRequests = useCallback(() => {
    setLoading(true)
    fetch(`${API}/api/users/me/follow-requests`, {
      headers: authHeaders(),
      credentials: 'include',
    })
      .then(async (r) => {
        if (!r.ok) return { requests: [], count: 0 }
        return r.json()
      })
      .then((data) => {
        setRequests(data.requests || [])
        setCount(data.count || 0)
      })
      .catch(() => {
        setRequests([])
        setCount(0)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadRequests()
  }, [loadRequests])

  async function handleAccept(username) {
    setBusyId(`accept-${username}`)
    try {
      const res = await fetch(`${API}/api/users/${username}/follow-request/accept`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
      })
      if (res.ok) {
        setRequests((prev) => prev.filter((r) => r.username !== username))
        setCount((c) => Math.max(0, c - 1))
        showToast(`Accepted follow request from ${username}`, 'success')
      } else {
        const data = await res.json().catch(() => ({}))
        showToast(data.error || 'Could not accept request.', 'error')
      }
    } catch {
      showToast('Check your connection and try again.', 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function handleDecline(username) {
    setBusyId(`decline-${username}`)
    try {
      const res = await fetch(`${API}/api/users/${username}/follow-request/decline`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
      })
      if (res.ok) {
        setRequests((prev) => prev.filter((r) => r.username !== username))
        setCount((c) => Math.max(0, c - 1))
        showToast(`Declined follow request from ${username}`, 'success')
      } else {
        const data = await res.json().catch(() => ({}))
        showToast(data.error || 'Could not decline request.', 'error')
      }
    } catch {
      showToast('Check your connection and try again.', 'error')
    } finally {
      setBusyId(null)
    }
  }

  // Don't render anything if no requests and done loading
  if (!loading && count === 0) return null

  // Loading state — just a brief skeleton
  if (loading) return null

  return (
    <div
      style={{
        ...cardStyle,
        marginBottom: 20,
        padding: 0,
        overflow: 'hidden',
      }}
    >
      {/* Header bar — always visible, acts as toggle */}
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          padding: '16px 24px',
          background: 'var(--sh-info-bg)',
          border: 'none',
          borderBottom: expanded ? '1px solid var(--sh-info-border)' : 'none',
          cursor: 'pointer',
          fontFamily: FONT,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--sh-info-text)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <line x1="19" y1="8" x2="19" y2="14" />
            <line x1="22" y1="11" x2="16" y2="11" />
          </svg>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--sh-info-text)' }}>
            You have {count} follow request{count !== 1 ? 's' : ''}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 800,
              minWidth: 22,
              height: 22,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 99,
              background: 'var(--sh-brand)',
              color: '#fff',
              padding: '0 6px',
            }}
          >
            {count}
          </span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--sh-info-text)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              transition: 'transform 0.2s',
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {/* Expanded list */}
      {expanded && (
        <div style={{ padding: '8px 0' }}>
          {requests.length === 0 ? (
            <div
              style={{
                padding: '20px 24px',
                textAlign: 'center',
                color: 'var(--sh-muted)',
                fontSize: 13,
              }}
            >
              No pending requests.
            </div>
          ) : (
            requests.map((req) => (
              <div
                key={req.id || req.username}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 24px',
                  borderBottom: '1px solid var(--sh-soft)',
                }}
              >
                <Link
                  to={`/users/${req.username}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    textDecoration: 'none',
                    minWidth: 0,
                    flex: 1,
                  }}
                >
                  <UserAvatar username={req.username} avatarUrl={req.avatarUrl} size={36} />
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: 'var(--sh-heading)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {req.username}
                    </div>
                    {req.bio && (
                      <div
                        style={{
                          fontSize: 12,
                          color: 'var(--sh-muted)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {req.bio}
                      </div>
                    )}
                  </div>
                </Link>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginLeft: 12 }}>
                  <button
                    onClick={() => handleAccept(req.username)}
                    disabled={!!busyId}
                    style={{
                      padding: '6px 16px',
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 700,
                      fontFamily: FONT,
                      cursor: busyId ? 'wait' : 'pointer',
                      border: 'none',
                      background: 'var(--sh-brand)',
                      color: '#fff',
                    }}
                  >
                    {busyId === `accept-${req.username}` ? '...' : 'Accept'}
                  </button>
                  <button
                    onClick={() => handleDecline(req.username)}
                    disabled={!!busyId}
                    style={{
                      padding: '6px 16px',
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 700,
                      fontFamily: FONT,
                      cursor: busyId ? 'wait' : 'pointer',
                      border: '1px solid var(--sh-border)',
                      background: 'var(--sh-soft)',
                      color: 'var(--sh-text)',
                    }}
                  >
                    {busyId === `decline-${req.username}` ? '...' : 'Decline'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
