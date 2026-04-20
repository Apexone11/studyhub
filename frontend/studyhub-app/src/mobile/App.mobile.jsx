// src/mobile/App.mobile.jsx
// Root component for the Capacitor native shell.
// Renders mobile-specific routes with bottom tab navigation.
// Shares SessionProvider and auth state with the web app.

import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useSession } from '../lib/session-context'
import { useDeepLinkRouter } from '../lib/mobile/deepLinking'
import BottomTabBar from './components/BottomTabBar'
import BrandedSplash from './components/BrandedSplash'
import { ToastProvider } from './components/Toast'
import './mobile.css'
// Mobile Design Refresh v3 — "Campus Lab Aurora" foundation.
// See docs/internal/mobile-design-refresh-v3-spec.md
import './styles/tokens.css'
import './styles/motion.css'
import './styles/type.css'
import './styles/primitives.css'
import './styles/shell.css'

// ── Lazy-loaded pages ──────────────────────────────────────────
const MobileLandingPage = lazy(() => import('./pages/MobileLandingPage'))
const MobileHomePage = lazy(() => import('./pages/MobileHomePage'))
const MobileMessagesPage = lazy(() => import('./pages/MobileMessagesPage'))
const MobileAiPage = lazy(() => import('./pages/MobileAiPage'))
const MobileProfilePage = lazy(() => import('./pages/MobileProfilePage'))

const MobileMessageThread = lazy(() => import('./pages/MobileMessageThread'))
const MobileSheetDetail = lazy(() => import('./pages/MobileSheetDetail'))
const MobileNotesPage = lazy(() => import('./pages/MobileNotesPage'))
const MobileNoteDetail = lazy(() => import('./pages/MobileNoteDetail'))
const MobileSearchPage = lazy(() => import('./pages/MobileSearchPage'))
const MobileStudyGroupDetail = lazy(() => import('./pages/MobileStudyGroupDetail'))
const MobileUserProfilePage = lazy(() => import('./pages/MobileUserProfilePage'))

const OnboardingGoals = lazy(() => import('./pages/onboarding/OnboardingGoals'))
const OnboardingPeople = lazy(() => import('./pages/onboarding/OnboardingPeople'))
const OnboardingNotifs = lazy(() => import('./pages/onboarding/OnboardingNotifs'))
const WelcomeSplash = lazy(() => import('./pages/onboarding/WelcomeSplash'))

const MobileTermsPage = lazy(() => import('./pages/MobileTermsPage'))
const MobilePrivacyPage = lazy(() => import('./pages/MobilePrivacyPage'))

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

  // Listen for OS-level deep links (custom scheme + https App Links) and
  // route them to the matching in-app screen. No-op on web.
  useDeepLinkRouter()

  return (
    <div className="mob-shell">
      <div className="mob-shell-content">{children}</div>
      {showTabs && <BottomTabBar />}
    </div>
  )
}

// ── Main mobile routes ─────────────────────────────────────────

function useMobileBodyClass() {
  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    document.body.classList.add('sh-mobile')
    return () => {
      document.body.classList.remove('sh-mobile')
    }
  }, [])
}

function useSplash() {
  // Skip the splash on non-mobile preview surfaces so dev iteration
  // on the web-preview of the mobile shell isn't blocked.
  const [done, setDone] = useState(() => {
    if (typeof window === 'undefined') return true
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('sh-m-splash-done')) {
      return true
    }
    return false
  })
  const markDone = useCallback(() => {
    setDone(true)
    try {
      sessionStorage.setItem('sh-m-splash-done', '1')
    } catch {
      /* storage may be unavailable */
    }
  }, [])
  return [done, markDone]
}

export default function AppMobile() {
  useMobileBodyClass()
  const [splashDone, markSplashDone] = useSplash()
  return (
    <ToastProvider>
      {!splashDone && <BrandedSplash onDone={markSplashDone} />}
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

            {/* Detail pages (require auth) */}
            <Route
              path="/m/messages/:conversationId"
              element={
                <MobilePrivateRoute>
                  <MobileMessageThread />
                </MobilePrivateRoute>
              }
            />
            <Route
              path="/m/sheets/:sheetId"
              element={
                <MobilePrivateRoute>
                  <MobileSheetDetail />
                </MobilePrivateRoute>
              }
            />
            <Route
              path="/m/notes"
              element={
                <MobilePrivateRoute>
                  <MobileNotesPage />
                </MobilePrivateRoute>
              }
            />
            <Route
              path="/m/notes/:noteId"
              element={
                <MobilePrivateRoute>
                  <MobileNoteDetail />
                </MobilePrivateRoute>
              }
            />
            <Route
              path="/m/search"
              element={
                <MobilePrivateRoute>
                  <MobileSearchPage />
                </MobilePrivateRoute>
              }
            />
            <Route
              path="/m/groups/:groupId"
              element={
                <MobilePrivateRoute>
                  <MobileStudyGroupDetail />
                </MobilePrivateRoute>
              }
            />
            <Route
              path="/m/users/:username"
              element={
                <MobilePrivateRoute>
                  <MobileUserProfilePage />
                </MobilePrivateRoute>
              }
            />

            {/* Legal pages (accessible without auth) */}
            <Route path="/m/terms" element={<MobileTermsPage />} />
            <Route path="/m/privacy" element={<MobilePrivacyPage />} />

            {/* Default: redirect to landing or home */}
            <Route path="*" element={<MobileDefaultRedirect />} />
          </Routes>
        </MobileTabShell>
      </Suspense>
    </ToastProvider>
  )
}

function MobileDefaultRedirect() {
  const { isAuthenticated, isBootstrapping } = useSession()
  if (isBootstrapping) return null
  return <Navigate to={isAuthenticated ? '/m/home' : '/m/landing'} replace />
}
