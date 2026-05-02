/**
 * AchievementDetailPage.jsx — authenticated detail view at /achievements/:slug.
 *
 * Mounted under <PrivateRoute> in App.jsx, so an anonymous viewer never reaches
 * this component. Renders hexagon at large size, name + description, tier + xp,
 * % of users who hold it, top 10 most recent unlockers (block-aware), and a
 * Pin / Unpin CTA when the viewer holds the badge.
 *
 * NOTE: the recent-unlockers list and global stats are reachable to any
 * logged-in viewer, but the page is gated for authenticated users only. If a
 * future product decision opens these to anonymous traffic, drop the
 * PrivateRoute wrapper in App.jsx and update this header.
 */

import { useParams, Link, Navigate } from 'react-router-dom'
import { useState } from 'react'
import Navbar from '../../components/navbar/Navbar'
import AppSidebar from '../../components/sidebar/AppSidebar'
import UserAvatar from '../../components/UserAvatar'
import { pageShell, useResponsiveAppLayout } from '../../lib/ui'
import { usePageTitle } from '../../lib/usePageTitle'
import { useAchievementDetail, pinAchievement, unpinAchievement } from './useAchievements'
import AchievementHexagon from './AchievementHexagon'
import { TIER_LABEL } from './tierStyles'

const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"

export default function AchievementDetailPage() {
  const { slug } = useParams()
  const { data, loading, error } = useAchievementDetail(slug)
  const layout = useResponsiveAppLayout()
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
    <div
      className="sh-app-page"
      style={{ minHeight: '100vh', background: 'var(--sh-bg)', fontFamily: FONT }}
    >
      <Navbar
        crumbs={[
          { label: 'Achievements', to: '/achievements' },
          { label: data.name, to: `/achievements/${slug}` },
        ]}
        hideTabs
      />
      <div
        className="app-two-col-grid sh-ambient-grid sh-ambient-shell"
        style={{ ...pageShell('app'), gap: 20 }}
      >
        <AppSidebar mode={layout.sidebarMode} />
        <main
          className="sh-ambient-main"
          id="main-content"
          style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
        >
          <Link
            to="/achievements"
            style={{
              display: 'inline-block',
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
    </div>
  )
}

function Loading() {
  return (
    <div
      className="sh-app-page"
      style={{ minHeight: '100vh', background: 'var(--sh-bg)', fontFamily: FONT }}
    >
      <Navbar crumbs={[{ label: 'Achievements', to: '/achievements' }]} hideTabs />
      <div
        className="app-two-col-grid sh-ambient-grid sh-ambient-shell"
        style={{ ...pageShell('app'), gap: 20 }}
      >
        <AppSidebar />
        <main className="sh-ambient-main" style={{ padding: 40, color: 'var(--sh-muted)' }}>
          Loading…
        </main>
      </div>
    </div>
  )
}
