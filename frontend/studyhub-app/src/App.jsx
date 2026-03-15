import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import {
  trackPageView,
  identifyAuthenticatedUser,
  clearAuthenticatedUser
} from './lib/telemetry'

// ── existing pages ────────────────────────────────────────────────
import HomePage        from './pages/HomePage'
import LoginPage       from './pages/LoginPage'
import RegisterScreen  from './pages/RegisterScreen'
import DashboardPage   from './pages/DashboardPage'
import TermsPage       from './pages/TermsPage'
import PrivacyPage     from './pages/PrivacyPage'
import GuidelinesPage  from './pages/GuidelinesPage'

// ── new pages ─────────────────────────────────────────────────────
import FeedPage          from './pages/FeedPage'
import SheetsPage        from './pages/SheetsPage'
import SheetViewerPage   from './pages/SheetViewerPage'
import SettingsPage      from './pages/SettingsPage'
import AboutPage          from './pages/AboutPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage  from './pages/ResetPasswordPage'
import UserProfilePage    from './pages/UserProfilePage'
import {
  TestsPage,
  TestTakerPage,
  NotesPage,
  AnnouncementsPage,
  SubmitPage,
  AdminPage,
  UploadSheetPage,
} from './pages/PlaceholderPages'

// ── simple auth guard ─────────────────────────────────────────────
// Redirects to /feed if the user is already logged in.
// Prevents authenticated users from seeing the marketing/auth pages.
function PublicRoute({ children }) {
  const token = localStorage.getItem('token')
  return token ? <Navigate to="/feed" replace /> : children
}

// Redirects to /login if the user is not logged in.
function PrivateRoute({ children }) {
  const token = localStorage.getItem('token')
  return token ? children : <Navigate to="/login" replace />
}

function RouteTelemetry() {
  const location = useLocation()

  useEffect(() => {
    const nextPath = `${location.pathname}${location.search}`
    trackPageView(nextPath)

    const rawUser = localStorage.getItem('user')

    if (!rawUser) {
      clearAuthenticatedUser()
      return
    }

    try {
      identifyAuthenticatedUser(JSON.parse(rawUser))
    } catch {
      clearAuthenticatedUser()
    }
  }, [location.pathname, location.search])

  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <RouteTelemetry />
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
    </BrowserRouter>
  )
}
