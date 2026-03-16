import { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import {
  trackPageView,
  identifyAuthenticatedUser,
  clearAuthenticatedUser
} from './lib/telemetry'
import { getStoredUser, hasStoredSession } from './lib/session'

const HomePage = lazy(() => import('./pages/HomePage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const RegisterScreen = lazy(() => import('./pages/RegisterScreen'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const TermsPage = lazy(() => import('./pages/TermsPage'))
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'))
const GuidelinesPage = lazy(() => import('./pages/GuidelinesPage'))
const FeedPage = lazy(() => import('./pages/FeedPage'))
const SheetsPage = lazy(() => import('./pages/SheetsPage'))
const SheetViewerPage = lazy(() => import('./pages/SheetViewerPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const AboutPage = lazy(() => import('./pages/AboutPage'))
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'))
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'))
const UserProfilePage = lazy(() => import('./pages/UserProfilePage'))

function lazyNamedPage(name) {
  return lazy(() =>
    import('./pages/PlaceholderPages').then((module) => ({
      default: module[name],
    })),
  )
}

const TestsPage = lazyNamedPage('TestsPage')
const TestTakerPage = lazyNamedPage('TestTakerPage')
const NotesPage = lazyNamedPage('NotesPage')
const AnnouncementsPage = lazyNamedPage('AnnouncementsPage')
const SubmitPage = lazyNamedPage('SubmitPage')
const AdminPage = lazyNamedPage('AdminPage')
const UploadSheetPage = lazyNamedPage('UploadSheetPage')

// ── simple auth guard ─────────────────────────────────────────────
// Redirects to /feed if the user is already logged in.
// Prevents authenticated users from seeing the marketing/auth pages.
function PublicRoute({ children }) {
  const user = getStoredUser()
  if (!hasStoredSession() || !user) return children
  return <Navigate to={user.role === 'admin' ? '/admin' : '/feed'} replace />
}

// Redirects to /login if the user is not logged in.
function PrivateRoute({ children }) {
  return hasStoredSession() ? children : <Navigate to="/login" replace />
}

function RouteTelemetry() {
  const location = useLocation()

  useEffect(() => {
    const nextPath = `${location.pathname}${location.search}`
    trackPageView(nextPath)

    const user = getStoredUser()

    if (!user) {
      clearAuthenticatedUser()
      return
    }
    identifyAuthenticatedUser(user)
  }, [location.pathname, location.search])

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

export default function App() {
  return (
    <BrowserRouter>
      <RouteTelemetry />
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
          <Route path="/sheets/:id"    element={<PrivateRoute><SheetViewerPage /></PrivateRoute>} />
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
