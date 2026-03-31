/* ═══════════════════════════════════════════════════════════════════════════
 * DashboardPage.jsx — Authenticated user's personal study hub
 *
 * Layout (responsive via CSS classes in responsive.css):
 *   `app-two-col-grid`:        sidebar (250px) | main (flex), stacked on phone
 *   `dashboard-stats-grid`:    3 stat cards → 2 on tablet → 1 on phone
 *   `dashboard-content-grid`:  Recent Sheets + Course Focus (2-col → stacked)
 *
 * Features: welcome hero with streak display, animated stat cards (countUp),
 * recent sheets from enrolled courses, course focus picker, quick actions.
 *
 * Animations: fadeInUp hero, staggerEntrance stats/content, countUp values.
 * Tutorial: First-visit Joyride highlights hero, stats, sheets, quick actions.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { Link } from 'react-router-dom'
import Navbar from '../../components/navbar/Navbar'
import AppSidebar from '../../components/sidebar/AppSidebar'
import { pageShell, useResponsiveAppLayout } from '../../lib/ui'
import { usePageTitle } from '../../lib/usePageTitle'
import SafeJoyride from '../../components/SafeJoyride'
import { useTutorial } from '../../lib/useTutorial'
import { DASHBOARD_STEPS, TUTORIAL_VERSIONS } from '../../lib/tutorialSteps'
import { FONT, formatJoinedDate } from './dashboardConstants'
import { useDashboardData } from './useDashboardData'
import {
  ActivationChecklist,
  CourseFocus,
  DashboardSkeleton,
  QuickActions,
  RecentSheets,
  ResumeStudying,
  StatCards,
  StudyActivity,
  StudyQueue,
} from './DashboardWidgets'

export default function DashboardPage() {
  usePageTitle('Dashboard')
  const layout = useResponsiveAppLayout()

  const {
    user,
    signOut,
    navigate,
    summary,
    loading,
    error,
    setLoading,
    setError,
    loadSummary,
    welcomeDismissed,
    setWelcomeDismissed,
    isWelcome,
    heroRef,
    statsRef,
    contentRef,
    cards,
    hero,
    courses,
    recentSheets,
    recentlyViewed,
    studyActivity,
    newSheetCount,
    studyQueueCounts,
    studyToReview,
    studyStudying,
  } = useDashboardData()

  /* Tutorial popup — first-visit or re-trigger via floating "?" button */
  const tutorial = useTutorial('dashboard', DASHBOARD_STEPS, { version: TUTORIAL_VERSIONS.dashboard })

  const navActions = (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <button
        onClick={() => void signOut().then(() => navigate('/'))}
        style={{
          padding: '6px 12px',
          borderRadius: 8,
          border: '1px solid var(--sh-text)',
          background: 'transparent',
          color: 'var(--sh-subtext)',
          fontSize: 12,
          fontWeight: 700,
          cursor: 'pointer',
          fontFamily: FONT,
        }}
      >
        Sign Out
      </button>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--sh-bg)', fontFamily: FONT }}>
      <Navbar crumbs={[{ label: 'Dashboard', to: '/dashboard' }]} hideTabs actions={navActions} />
      {/* 2-column responsive grid: sidebar | dashboard content
       * Desktop: sidebar visible, Compact: sidebar as drawer */}
      <div className="app-two-col-grid" style={pageShell('app')}>
        <AppSidebar mode={layout.sidebarMode} />

        <main id="main-content" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Welcome banner — shown once after registration */}
          {isWelcome && !welcomeDismissed ? (
            <div
              style={{
                background: 'linear-gradient(135deg, #eff6ff, #dbeafe)',
                border: '1px solid #93c5fd',
                borderRadius: 14,
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1e40af' }}>
                Welcome to StudyHub! Complete the steps below to set up your account.
              </div>
              <button
                type="button"
                onClick={() => setWelcomeDismissed(true)}
                style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: 4 }}
                aria-label="Dismiss welcome banner"
              >
                ×
              </button>
            </div>
          ) : null}

          <section
            ref={heroRef}
            data-tutorial="dashboard-hero"
            style={{
              background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
              borderRadius: 18,
              border: '1px solid #1e3a5f',
              padding: '28px 30px',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 18,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <div style={{ fontSize: 13, color: '#93c5fd', fontWeight: 700, marginBottom: 8 }}>
                SESSION READY
              </div>
              <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em' }}>
                Welcome back, {hero.username || user?.username || 'Student'}.
              </h1>
              <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.7, color: '#cbd5e1' }}>
                Joined {formatJoinedDate(hero.createdAt || user?.createdAt)}.
                {' '}
                Your study sheets, notes, and practice tests are ready.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link
                to="/settings?tab=courses"
                style={{
                  padding: '11px 16px',
                  borderRadius: 12,
                  background: '#3b82f6',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 700,
                  textDecoration: 'none',
                }}
              >
                Manage Courses
              </Link>
              <Link
                to="/sheets/upload"
                style={{
                  padding: '11px 16px',
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.18)',
                  background: 'rgba(255,255,255,0.06)',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 700,
                  textDecoration: 'none',
                }}
              >
                Upload a Sheet
              </Link>
            </div>
          </section>

          {error ? (
            <div
              style={{
                background: 'var(--sh-danger-bg)',
                border: '1px solid #fecaca',
                borderRadius: 14,
                padding: '12px 14px',
                color: 'var(--sh-danger)',
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <span>{error}</span>
              <button
                type="button"
                onClick={() => {
                  setLoading(true)
                  setError('')
                  void loadSummary()
                }}
                style={{
                  padding: '7px 12px',
                  borderRadius: 8,
                  border: '1px solid #fecaca',
                  background: 'var(--sh-surface)',
                  color: 'var(--sh-danger)',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Retry
              </button>
            </div>
          ) : null}

          {loading && !summary ? (
            <DashboardSkeleton />
          ) : (
            <>
              <StatCards statsRef={statsRef} cards={cards} />

              <StudyActivity activity={studyActivity} />

              <ActivationChecklist activation={summary?.activation} />

              <ResumeStudying entries={recentlyViewed} />

              {/* Content: Recent Sheets (wider) | Course Focus + Quick Actions */}
              <section ref={contentRef} className="dashboard-content-grid" data-tutorial="dashboard-sheets">
                <RecentSheets recentSheets={recentSheets} newCount={newSheetCount} />

                <div style={{ display: 'grid', gap: 16 }}>
                  <StudyQueue counts={studyQueueCounts} toReview={studyToReview} studying={studyStudying} />
                  <CourseFocus courses={courses} />
                  <QuickActions />
                </div>
              </section>
            </>
          )}
        </main>
      </div>

      {/* Tutorial popup */}
      <SafeJoyride {...tutorial.joyrideProps} />
      {tutorial.seen && (
        <button type="button" onClick={tutorial.restart} title="Show tutorial" style={{ position: 'fixed', bottom: 24, right: 24, width: 44, height: 44, borderRadius: '50%', border: 'none', background: '#3b82f6', color: '#fff', fontSize: 18, fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 14px rgba(59,130,246,0.4)', zIndex: 50, display: 'grid', placeItems: 'center' }}>?</button>
      )}
    </div>
  )
}
