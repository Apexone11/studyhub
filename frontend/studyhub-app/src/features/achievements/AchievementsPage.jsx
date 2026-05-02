/**
 * AchievementsPage.jsx — full-page own gallery at /achievements.
 *
 * Renders the AchievementGallery scoped to the logged-in user with ownerView
 * enabled (so they can pin / unpin). Shares chrome with the rest of the
 * authenticated app (Navbar + AppSidebar + responsive two-col grid).
 */

import { useSession } from '../../lib/session-context'
import { Navigate } from 'react-router-dom'
import Navbar from '../../components/navbar/Navbar'
import AppSidebar from '../../components/sidebar/AppSidebar'
import { pageShell, useResponsiveAppLayout } from '../../lib/ui'
import { usePageTitle } from '../../lib/usePageTitle'
import { useUserAchievements } from './useAchievements'
import AchievementGallery from './AchievementGallery'

const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"

export default function AchievementsPage() {
  usePageTitle('Achievements')
  const { user, isBootstrapping } = useSession()
  const layout = useResponsiveAppLayout()
  if (isBootstrapping) return null
  if (!user) return <Navigate to="/login" replace />

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
        <AppSidebar mode={layout.sidebarMode} />
        <main
          className="sh-ambient-main"
          id="main-content"
          style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
        >
          <header>
            <h1
              style={{
                fontSize: 28,
                fontWeight: 800,
                margin: '0 0 4px',
                color: 'var(--sh-heading)',
                fontFamily: FONT,
              }}
            >
              Achievements
            </h1>
            <p style={{ fontSize: 14, color: 'var(--sh-muted)', margin: 0 }}>
              Earn badges across StudyHub. Pin up to 6 to feature on your profile.
            </p>
          </header>
          <Inner username={user.username} />
        </main>
      </div>
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
