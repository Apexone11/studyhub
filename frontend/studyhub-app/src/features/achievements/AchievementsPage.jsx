/**
 * AchievementsPage.jsx — full-page own gallery at /achievements.
 *
 * Renders the AchievementGallery scoped to the logged-in user with ownerView
 * enabled (so they can pin / unpin). Shares chrome with the rest of the
 * authenticated app via AppSidebar.
 */

import { useSession } from '../../lib/session-context'
import { Navigate } from 'react-router-dom'
import AppSidebar from '../../components/sidebar/AppSidebar'
import { usePageTitle } from '../../lib/usePageTitle'
import { useUserAchievements } from './useAchievements'
import AchievementGallery from './AchievementGallery'

export default function AchievementsPage() {
  usePageTitle('Achievements')
  const { user, isBootstrapping } = useSession()
  if (isBootstrapping) return null
  if (!user) return <Navigate to="/login" replace />

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--sh-bg)' }}>
      <AppSidebar />
      <main
        style={{
          flex: 1,
          padding: '32px clamp(16px, 3vw, 48px)',
          maxWidth: 1100,
          margin: '0 auto',
        }}
      >
        <h1
          style={{
            fontSize: 28,
            fontWeight: 800,
            margin: '0 0 4px',
            color: 'var(--sh-heading)',
            fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
          }}
        >
          Achievements
        </h1>
        <p style={{ fontSize: 14, color: 'var(--sh-muted)', margin: '0 0 24px' }}>
          Earn badges across StudyHub. Pin up to 6 to feature on your profile.
        </p>
        <Inner username={user.username} />
      </main>
    </div>
  )
}

function Inner({ username }) {
  const { items, stats, loading, error, reload } = useUserAchievements(username)
  if (loading) {
    return <div style={{ padding: 40, color: 'var(--sh-muted)' }}>Loading achievements…</div>
  }
  if (error) {
    return (
      <div
        role="alert"
        style={{
          padding: 18,
          background: 'var(--sh-warning-bg)',
          color: 'var(--sh-warning-text)',
          border: '1px solid var(--sh-warning-border)',
          borderRadius: 10,
        }}
      >
        Couldn't load achievements. Try refreshing the page.
      </div>
    )
  }
  return <AchievementGallery items={items} stats={stats} ownerView onMutate={reload} />
}
