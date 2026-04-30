/**
 * AchievementDetailPage.jsx — public detail view at /achievements/:slug.
 *
 * Hexagon at large size, name + description, tier + xp, % of users who hold it,
 * top 10 most recent unlockers (block-aware), and a Pin / Unpin CTA when the
 * viewer holds the badge.
 */

import { useParams, Link, Navigate } from 'react-router-dom'
import { useState } from 'react'
import AppSidebar from '../../components/sidebar/AppSidebar'
import UserAvatar from '../../components/UserAvatar'
import { usePageTitle } from '../../lib/usePageTitle'
import { useAchievementDetail, pinAchievement, unpinAchievement } from './useAchievements'
import AchievementHexagon from './AchievementHexagon'
import { TIER_LABEL } from './tierStyles'

export default function AchievementDetailPage() {
  const { slug } = useParams()
  const { data, loading, error } = useAchievementDetail(slug)
  usePageTitle(data ? `${data.name} — Achievement` : 'Achievement')

  const [pinning, setPinning] = useState(false)
  const [pinErr, setPinErr] = useState('')
  // Local override that wins over the server snapshot. `null` = no
  // override yet, fall through to data.pinned. Boolean = user toggled
  // and we trust the local value until the next refetch. The earlier
  // `data.pinned || pinned` form couldn't represent "server said
  // pinned, user just unpinned" because data.pinned stayed true.
  const [pinnedOverride, setPinnedOverride] = useState(null)

  if (loading) {
    return <Loading />
  }
  if (error || !data) {
    return <Navigate to="/achievements" replace />
  }

  const isPinned = pinnedOverride === null ? Boolean(data.pinned) : pinnedOverride
  const holderPercent =
    data.totalUsers > 0 ? Math.round((data.holderCount / data.totalUsers) * 1000) / 10 : 0

  async function togglePin() {
    if (!data.isUnlocked) return
    setPinning(true)
    setPinErr('')
    try {
      if (isPinned) {
        await unpinAchievement(slug)
        setPinnedOverride(false)
      } else {
        await pinAchievement(slug)
        setPinnedOverride(true)
      }
    } catch (e) {
      setPinErr(e.message || 'Failed to update pin.')
    } finally {
      setPinning(false)
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--sh-bg)' }}>
      <AppSidebar />
      <main
        style={{
          flex: 1,
          padding: '32px clamp(16px, 3vw, 48px)',
          maxWidth: 900,
          margin: '0 auto',
        }}
      >
        <Link
          to="/achievements"
          style={{
            display: 'inline-block',
            marginBottom: 16,
            color: 'var(--sh-link)',
            fontSize: 13,
            textDecoration: 'none',
          }}
        >
          ← All achievements
        </Link>

        {/* Hero */}
        <div
          style={{
            display: 'flex',
            gap: 28,
            alignItems: 'center',
            flexWrap: 'wrap',
            padding: '24px',
            background: 'var(--sh-panel-bg)',
            border: '1px solid var(--sh-panel-border)',
            borderRadius: 18,
            marginBottom: 24,
          }}
        >
          <AchievementHexagon
            tier={data.tier}
            iconSlug={data.iconSlug}
            state={
              data.isUnlocked ? 'unlocked' : data.isSecret ? 'locked-secret' : 'locked-progress'
            }
            size={140}
            ariaLabel={`${data.name}, ${TIER_LABEL[data.tier] || 'Bronze'} tier`}
          />
          <div style={{ flex: 1, minWidth: 260 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                flexWrap: 'wrap',
                marginBottom: 6,
              }}
            >
              <span
                style={{
                  padding: '3px 10px',
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  borderRadius: 999,
                  background: `var(--sh-${data.tier}-bg)`,
                  color: `var(--sh-${data.tier}-text)`,
                }}
              >
                {TIER_LABEL[data.tier] || 'Bronze'}
              </span>
              <span style={{ fontSize: 12, color: 'var(--sh-muted)' }}>+{data.xp || 0} XP</span>
              {data.isUnlocked && (
                <span style={{ fontSize: 12, color: 'var(--sh-success-text)', fontWeight: 600 }}>
                  Unlocked
                </span>
              )}
            </div>
            <h1
              style={{
                fontSize: 32,
                fontWeight: 800,
                margin: 0,
                color: 'var(--sh-heading)',
                fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
              }}
            >
              {data.name}
            </h1>
            <p style={{ fontSize: 15, color: 'var(--sh-text)', margin: '8px 0 12px' }}>
              {data.description}
            </p>
            <div style={{ fontSize: 13, color: 'var(--sh-muted)' }}>
              Held by {data.holderCount.toLocaleString()}{' '}
              {data.holderCount === 1 ? 'user' : 'users'}
              {data.totalUsers > 0 && ` (${holderPercent}% of StudyHub)`}
              {data.unlockedAt &&
                ` · You unlocked ${new Date(data.unlockedAt).toLocaleDateString()}`}
            </div>
            {data.isUnlocked && (
              <div style={{ marginTop: 14 }}>
                <button
                  type="button"
                  onClick={togglePin}
                  disabled={pinning}
                  style={{
                    padding: '8px 16px',
                    fontSize: 13,
                    fontWeight: 700,
                    borderRadius: 8,
                    background: isPinned ? 'var(--sh-brand-soft)' : 'var(--sh-brand)',
                    color: isPinned ? 'var(--sh-brand)' : 'var(--sh-on-dark)',
                    border: '1px solid var(--sh-brand-border)',
                    cursor: pinning ? 'wait' : 'pointer',
                  }}
                >
                  {isPinned ? 'Unpin from profile' : 'Pin to profile'}
                </button>
                {pinErr && (
                  <span
                    role="alert"
                    style={{ marginLeft: 12, fontSize: 12, color: 'var(--sh-warning-text)' }}
                  >
                    {pinErr}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Recent unlockers */}
        <h2
          style={{
            fontSize: 18,
            fontWeight: 700,
            margin: '0 0 12px',
            color: 'var(--sh-heading)',
          }}
        >
          Recent unlockers
        </h2>
        {data.recentUnlockers.length === 0 ? (
          <div
            style={{
              padding: 18,
              fontSize: 13,
              color: 'var(--sh-muted)',
              background: 'var(--sh-panel-bg)',
              border: '1px solid var(--sh-panel-border)',
              borderRadius: 10,
            }}
          >
            Be the first to unlock this achievement.
          </div>
        ) : (
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {data.recentUnlockers.map((u) => (
              <li
                key={u.userId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 14px',
                  background: 'var(--sh-panel-bg)',
                  border: '1px solid var(--sh-panel-border)',
                  borderRadius: 10,
                }}
              >
                <UserAvatar user={u} size={32} />
                <Link
                  to={`/users/${encodeURIComponent(u.username)}`}
                  style={{ fontWeight: 600, color: 'var(--sh-heading)', textDecoration: 'none' }}
                >
                  {u.username}
                </Link>
                <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--sh-muted)' }}>
                  {new Date(u.unlockedAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}

function Loading() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--sh-bg)' }}>
      <AppSidebar />
      <main style={{ flex: 1, padding: 40, color: 'var(--sh-muted)' }}>Loading…</main>
    </div>
  )
}
