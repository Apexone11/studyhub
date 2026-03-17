import { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import {
  trackPageView,
  identifyAuthenticatedUser,
  clearAuthenticatedUser
} from './lib/telemetry'
import RouteErrorBoundary from './components/RouteErrorBoundary'
import { SessionProvider, useSession } from './lib/session-context'

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

function PublicRoute({ children }) {
  const { user, isBootstrapping, isAuthenticated } = useSession()

  if (isBootstrapping) return <RouteFallback />
  if (!isAuthenticated || !user) return children
  return <Navigate to={user.role === 'admin' ? '/admin' : '/feed'} replace />
}

function PrivateRoute({ children }) {
  const { isBootstrapping, isAuthenticated } = useSession()

  if (isBootstrapping) return <RouteFallback />
  if (!isAuthenticated) return <Navigate to="/login" replace />

  return <RouteErrorBoundary>{children}</RouteErrorBoundary>
}

function RouteTelemetry() {
  const location = useLocation()
  const { user } = useSession()

  useEffect(() => {
    const nextPath = `${location.pathname}${location.search}`
    trackPageView(nextPath)

    if (!user) {
      clearAuthenticatedUser()
      return
    }
    identifyAuthenticatedUser(user)
  }, [location.pathname, location.search, user])

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
      <SessionProvider>
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
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </SessionProvider>
    </BrowserRouter>
  )
}
