import { Suspense, lazy, useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { GoogleOAuthProvider } from '@react-oauth/google'
import {
  trackPageView,
  identifyAuthenticatedUser,
  clearAuthenticatedUser
} from './lib/telemetry'
import { useBootstrapPreferences } from './lib/useBootstrapPreferences'
import { useIdleTimeout } from './lib/useIdleTimeout'
import RouteErrorBoundary from './components/RouteErrorBoundary'
import { getAuthenticatedHomePath } from './lib/authNavigation'
import { SessionProvider, useSession } from './lib/session-context'
import { GOOGLE_CLIENT_ID } from './config'

const HomePage = lazy(() => import('./pages/home/HomePage'))
const LoginPage = lazy(() => import('./pages/auth/LoginPage'))
const RegisterScreen = lazy(() => import('./pages/auth/RegisterScreen'))
const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage'))
const TermsPage = lazy(() => import('./pages/legal/TermsPage'))
const PrivacyPage = lazy(() => import('./pages/legal/PrivacyPage'))
const GuidelinesPage = lazy(() => import('./pages/legal/GuidelinesPage'))
const FeedPage = lazy(() => import('./pages/feed/FeedPage'))
const SheetsPage = lazy(() => import('./pages/sheets/SheetsPage'))
const SheetViewerPage = lazy(() => import('./pages/sheets/SheetViewerPage'))
const AttachmentPreviewPage = lazy(() => import('./pages/preview/AttachmentPreviewPage'))
const SheetHtmlPreviewPage = lazy(() => import('./pages/preview/SheetHtmlPreviewPage'))
const UploadSheetPage = lazy(() => import('./pages/sheets/UploadSheetPage'))
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage'))
const AdminPage = lazy(() => import('./pages/admin/AdminPage'))
const AboutPage = lazy(() => import('./pages/legal/AboutPage'))
const ForgotPasswordPage = lazy(() => import('./pages/auth/ForgotPasswordPage'))
const ResetPasswordPage = lazy(() => import('./pages/auth/ResetPasswordPage'))
const UserProfilePage = lazy(() => import('./pages/profile/UserProfilePage'))
const TestsPage = lazy(() => import('./pages/tests/TestsPage'))
const TestTakerPage = lazy(() => import('./pages/tests/TestTakerPage'))
const NotesPage = lazy(() => import('./pages/notes/NotesPage'))
const AnnouncementsPage = lazy(() => import('./pages/announcements/AnnouncementsPage'))
const SubmitPage = lazy(() => import('./pages/submit/SubmitPage'))
const SheetLabPage = lazy(() => import('./pages/sheets/SheetLabPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))

import ScrollToTop from './components/ScrollToTop'
import ToastContainer from './components/Toast'

function PublicRoute({ children }) {
  const { user, isBootstrapping, isAuthenticated } = useSession()

  if (isBootstrapping) return <RouteFallback />
  if (!isAuthenticated || !user) return children
  return <Navigate to={getAuthenticatedHomePath(user)} replace />
}

function PrivateRoute({ children }) {
  const { isBootstrapping, isAuthenticated } = useSession()

  if (isBootstrapping) return <RouteFallback />
  if (!isAuthenticated) return <Navigate to="/login" replace />

  return <RouteErrorBoundary>{children}</RouteErrorBoundary>
}

/* Route-change announcer for screen readers */
const ROUTE_TITLES = {
  '/': 'Home',
  '/login': 'Sign In',
  '/register': 'Create Account',
  '/feed': 'Feed',
  '/sheets': 'Study Sheets',
  '/sheets/upload': 'Upload Sheet',
  '/tests': 'Practice Tests',
  '/notes': 'My Notes',
  '/announcements': 'Announcements',
  '/submit': 'Submit Request',
  '/admin': 'Admin',
  '/dashboard': 'Profile',
  '/settings': 'Settings',
  '/terms': 'Terms of Service',
  '/privacy': 'Privacy Policy',
  '/guidelines': 'Community Guidelines',
  '/about': 'About',
  '/forgot-password': 'Forgot Password',
  '/reset-password': 'Reset Password',
}

function RouteAnnouncer() {
  const location = useLocation()
  const announcerRef = useRef(null)

  useEffect(() => {
    const title = ROUTE_TITLES[location.pathname] || 'Page'
    if (announcerRef.current) {
      announcerRef.current.textContent = `Navigated to ${title}`
    }
  }, [location.pathname])

  return (
    <div
      ref={announcerRef}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    />
  )
}

function RouteTelemetry() {
  const location = useLocation()
  const { user } = useSession()

  useEffect(() => {
    const nextPath = `${location.pathname}${location.search}`
    trackPageView(nextPath)
  }, [location.pathname, location.search])

  useEffect(() => {
    if (!user) {
      clearAuthenticatedUser()
      return
    }
    identifyAuthenticatedUser(user)
  }, [user])

  return null
}

/**
 * Loads and applies saved theme + font size preferences on first auth.
 * Runs once after login, then applies from cache on subsequent page loads.
 */
function PreferencesBootstrap() {
  useBootstrapPreferences()

  const { isAuthenticated, signOut } = useSession()
  useIdleTimeout(() => { void signOut() }, { enabled: isAuthenticated, timeoutMs: 30 * 60 * 1000 })

  return null
}

function RouteFallback() {
  return (
    <div className="page-shell" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <div className="auth-card" style={{ width: 'min(92vw, 420px)', textAlign: 'center' }}>
        <p style={{ margin: 0 }}>Loading page...</p>
      </div>
    </div>
  )
}

function AppRoutes() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <a href="#main-content" className="skip-to-content">Skip to main content</a>
        <RouteAnnouncer />
        <RouteTelemetry />
        <PreferencesBootstrap />
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            {/* ── public (unauthenticated) ─────────────────────────── */}
            <Route path="/"         element={<PublicRoute><HomePage /></PublicRoute>} />
            <Route path="/login"    element={<PublicRoute><LoginPage /></PublicRoute>} />
            <Route path="/register" element={<PublicRoute><RegisterScreen /></PublicRoute>} />
            <Route path="/terms"            element={<TermsPage />} />
            <Route path="/privacy"          element={<PrivacyPage />} />
            <Route path="/guidelines"       element={<GuidelinesPage />} />
            <Route path="/about"            element={<AboutPage />} />
            <Route path="/forgot-password"  element={<ForgotPasswordPage />} />
            <Route path="/reset-password"   element={<ResetPasswordPage />} />

            {/* ── authenticated ────────────────────────────────────── */}
            <Route path="/feed"          element={<PrivateRoute><FeedPage /></PrivateRoute>} />
            <Route path="/sheets"        element={<PrivateRoute><SheetsPage /></PrivateRoute>} />
            <Route path="/sheets/upload" element={<PrivateRoute><UploadSheetPage /></PrivateRoute>} />
            <Route path="/sheets/:id/edit" element={<PrivateRoute><UploadSheetPage /></PrivateRoute>} />
            <Route path="/sheets/:id/lab" element={<PrivateRoute><SheetLabPage /></PrivateRoute>} />
            <Route path="/sheets/:id"    element={<PrivateRoute><SheetViewerPage /></PrivateRoute>} />
            <Route path="/sheets/preview/html/:id" element={<PrivateRoute><SheetHtmlPreviewPage /></PrivateRoute>} />
            <Route path="/preview/:scope/:id" element={<PrivateRoute><AttachmentPreviewPage /></PrivateRoute>} />
            <Route path="/tests"         element={<PrivateRoute><TestsPage /></PrivateRoute>} />
            <Route path="/tests/:id"     element={<PrivateRoute><TestTakerPage /></PrivateRoute>} />
            <Route path="/notes"         element={<PrivateRoute><NotesPage /></PrivateRoute>} />
            <Route path="/announcements" element={<PrivateRoute><AnnouncementsPage /></PrivateRoute>} />
            <Route path="/submit"        element={<PrivateRoute><SubmitPage /></PrivateRoute>} />
            <Route path="/admin"         element={<PrivateRoute><AdminPage /></PrivateRoute>} />
            <Route path="/dashboard"     element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
            <Route path="/settings"      element={<PrivateRoute><SettingsPage /></PrivateRoute>} />

            {/* ── public user profiles ─────────────────────────────── */}
            <Route path="/users/:username" element={<UserProfilePage />} />

            {/* ── catch-all ────────────────────────────────────────── */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
        <ScrollToTop />
        <ToastContainer />
      </SessionProvider>
    </BrowserRouter>
  )
}

export default function App() {
  if (!GOOGLE_CLIENT_ID) return <AppRoutes />

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AppRoutes />
    </GoogleOAuthProvider>
  )
}
