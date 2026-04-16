// src/mobile/App.mobile.jsx
// Root component for the Capacitor native shell.
// Renders mobile-specific routes with bottom tab navigation.
// Shares SessionProvider and auth state with the web app.

import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useSession } from '../lib/session-context'
import BottomTabBar from './components/BottomTabBar'
import './mobile.css'

// ── Lazy-loaded pages ──────────────────────────────────────────
const MobileLandingPage = lazy(() => import('./pages/MobileLandingPage'))
const MobileHomePage = lazy(() => import('./pages/MobileHomePage'))
const MobileMessagesPage = lazy(() => import('./pages/MobileMessagesPage'))
const MobileAiPage = lazy(() => import('./pages/MobileAiPage'))
const MobileProfilePage = lazy(() => import('./pages/MobileProfilePage'))

const OnboardingGoals = lazy(() => import('./pages/onboarding/OnboardingGoals'))
const OnboardingPeople = lazy(() => import('./pages/onboarding/OnboardingPeople'))
const OnboardingNotifs = lazy(() => import('./pages/onboarding/OnboardingNotifs'))
const WelcomeSplash = lazy(() => import('./pages/onboarding/WelcomeSplash'))

// ── Route guards ───────────────────────────────────────────────

function MobilePublicRoute({ children }) {
  const { isBootstrapping, isAuthenticated } = useSession()
  if (isBootstrapping) return <MobileFallback />
  if (isAuthenticated) return <Navigate to="/m/home" replace />
  return children
}

function MobilePrivateRoute({ children }) {
  const { isBootstrapping, isAuthenticated } = useSession()
  if (isBootstrapping) return <MobileFallback />
  if (!isAuthenticated) return <Navigate to="/m/landing" replace />
  return children
}

function MobileFallback() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--sh-bg)',
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          border: '3px solid var(--sh-border)',
          borderTopColor: 'var(--sh-brand)',
          animation: 'mob-spin 0.7s linear infinite',
        }}
      />
      <style>{`@keyframes mob-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ── Tabs with bottom bar ───────────────────────────────────────

const TAB_PATHS = new Set(['/m/home', '/m/messages', '/m/ai', '/m/profile'])

function MobileTabShell({ children }) {
  const location = useLocation()
  const showTabs = TAB_PATHS.has(location.pathname)

  return (
    <div className="mob-shell">
      <div className="mob-shell-content">{children}</div>
      {showTabs && <BottomTabBar />}
    </div>
  )
}

// ── Main mobile routes ─────────────────────────────────────────

export default function AppMobile() {
  return (
    <Suspense fallback={<MobileFallback />}>
      <MobileTabShell>
        <Routes>
          {/* Public: landing page */}
          <Route
            path="/m/landing"
            element={
              <MobilePublicRoute>
                <MobileLandingPage />
              </MobilePublicRoute>
            }
          />

          {/* Onboarding flow (requires auth) */}
          <Route
            path="/m/onboarding/goals"
            element={
              <MobilePrivateRoute>
                <OnboardingGoals />
              </MobilePrivateRoute>
            }
          />
          <Route
            path="/m/onboarding/people"
            element={
              <MobilePrivateRoute>
                <OnboardingPeople />
              </MobilePrivateRoute>
            }
          />
          <Route
            path="/m/onboarding/notifications"
            element={
              <MobilePrivateRoute>
                <OnboardingNotifs />
              </MobilePrivateRoute>
            }
          />
          <Route
            path="/m/onboarding/welcome"
            element={
              <MobilePrivateRoute>
                <WelcomeSplash />
              </MobilePrivateRoute>
            }
          />

          {/* Tab pages (require auth) */}
          <Route
            path="/m/home"
            element={
              <MobilePrivateRoute>
                <MobileHomePage />
              </MobilePrivateRoute>
            }
          />
          <Route
            path="/m/messages"
            element={
              <MobilePrivateRoute>
                <MobileMessagesPage />
              </MobilePrivateRoute>
            }
          />
          <Route
            path="/m/ai"
            element={
              <MobilePrivateRoute>
                <MobileAiPage />
              </MobilePrivateRoute>
            }
          />
          <Route
            path="/m/profile"
            element={
              <MobilePrivateRoute>
                <MobileProfilePage />
              </MobilePrivateRoute>
            }
          />

          {/* Default: redirect to landing or home */}
          <Route path="*" element={<MobileDefaultRedirect />} />
        </Routes>
      </MobileTabShell>
    </Suspense>
  )
}

function MobileDefaultRedirect() {
  const { isAuthenticated } = useSession()
  return <Navigate to={isAuthenticated ? '/m/home' : '/m/landing'} replace />
}
