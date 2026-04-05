/* ═══════════════════════════════════════════════════════════════════════════
 * SettingsPage.jsx — Account settings with tabbed navigation
 *
 * Layout: Sticky header + 2-column (tabs sidebar | tab content).
 * Responsive: On phone, tabs become a horizontal scrollable row.
 * 8 tabs: Profile, Security, Notifications, Privacy, Appearance, Account, Moderation
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import Navbar from '../../components/navbar/Navbar'
import SafeJoyride from '../../components/SafeJoyride'
import { API } from '../../config'
import { useSession } from '../../lib/session-context'
import { useTutorial } from '../../lib/useTutorial'
import { SETTINGS_STEPS, TUTORIAL_VERSIONS } from '../../lib/tutorialSteps'
import { fadeInUp } from '../../lib/animations'
import { Skeleton } from '../../components/Skeleton'
import { FONT } from './settingsState'
import { showToast } from '../../lib/toast'
import { usePageTitle } from '../../lib/usePageTitle'
import ProfileTab from './ProfileTab'
import SecurityTab from './SecurityTab'
import AccountTab from './AccountTab'
import NotificationsTab from './NotificationsTab'
import PrivacyTab from './PrivacyTab'
import AppearanceTab from './AppearanceTab'
import SubscriptionTab from './SubscriptionTab'
import ModerationTab from './ModerationTab'
import LegalTab from './LegalTab'

const NAV_TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'security', label: 'Security' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'account', label: 'Account' },
  { id: 'subscription', label: 'Subscription' },
  { id: 'legal', label: 'Legal' },
  { id: 'moderation', label: 'Moderation' },
]

export default function SettingsPage() {
  usePageTitle('Settings')
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user: sessionUser, setSessionUser, signOut, clearSession } = useSession()

  // Auto-switch to subscription tab if payment=success is in URL
  const hasPaymentSuccess = searchParams.get('payment') === 'success'
  const initialTab = hasPaymentSuccess
    ? 'subscription'
    : NAV_TABS.find((t) => t.id === searchParams.get('tab'))?.id || 'profile'
  const [tab, setTab] = useState(initialTab)
  const tutorial = useTutorial('settings', SETTINGS_STEPS, { version: TUTORIAL_VERSIONS.settings })
  const tabContentRef = useRef(null)

  /* Animate tab content on switch */
  useEffect(() => {
    if (tabContentRef.current) fadeInUp(tabContentRef.current, { duration: 350, y: 10 })
  }, [tab])
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [busyKey, setBusyKey] = useState('')

  useEffect(() => {
    let active = true

    fetch(`${API}/api/settings/me`, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    })
      .then(async (r) => {
        if (!r.ok) throw new Error('Could not load your settings.')
        return r.json()
      })
      .then((data) => {
        if (active) {
          setUser(data)
          setLoadError('')
        }
      })
      .catch(() => {
        if (active) setLoadError('Could not load your settings. Please refresh the page.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  function syncUser(nextUser) {
    if (!nextUser) return
    setUser(nextUser)
    setSessionUser(nextUser)
  }

  async function handlePatch(endpoint, body, setter, successHandler) {
    setBusyKey(endpoint)
    setter(null)

    try {
      const response = await fetch(`${API}/api/settings/${endpoint}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      const data = await response.json()

      if (!response.ok) {
        setter({ type: 'error', text: data.error || 'Request failed.' })
        showToast(data.error || 'Request failed.', 'error')
        return
      }

      if (data.user) syncUser(data.user)
      setter({ type: 'success', text: data.message || 'Saved.' })
      showToast(data.message || 'Settings saved.', 'success')
      successHandler?.(data)
    } catch {
      setter({ type: 'error', text: 'Check your connection and try again.' })
      showToast('Check your connection and try again.', 'error')
    } finally {
      setBusyKey('')
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--sh-bg)', fontFamily: FONT }}>
        <Navbar crumbs={[{ label: 'Settings', to: '/settings' }]} hideTabs />
        <div
          style={{
            maxWidth: 1180,
            width: '100%',
            margin: '0 auto',
            padding: '28px clamp(12px, 2vw, 24px) 60px',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ display: 'grid', gap: 12 }}>
            <Skeleton width="100%" height={48} borderRadius={12} />
            <Skeleton width="100%" height={200} borderRadius={16} />
            <Skeleton width="100%" height={120} borderRadius={16} />
          </div>
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--sh-bg)', fontFamily: FONT }}>
        <Navbar crumbs={[{ label: 'Settings', to: '/settings' }]} hideTabs />
        <div style={{ maxWidth: 600, margin: '0 auto', padding: '60px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>&#9888;&#65039;</div>
          <h2
            style={{ margin: '0 0 8px', color: 'var(--sh-heading)', fontSize: 20, fontWeight: 800 }}
          >
            Settings unavailable
          </h2>
          <p
            style={{
              margin: '0 0 20px',
              color: 'var(--sh-subtext)',
              fontSize: 14,
              lineHeight: 1.6,
            }}
          >
            {loadError}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 20px',
              borderRadius: 10,
              border: 'none',
              background: 'var(--sh-brand)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Refresh page
          </button>
        </div>
      </div>
    )
  }

  function renderTab() {
    switch (tab) {
      case 'profile':
        return (
          <>
            {sessionUser?.trustLevel === 'new' && (
              <div
                style={{
                  background: 'var(--sh-info-bg, #dbeafe)',
                  border: '1px solid var(--sh-info-border, #93c5fd)',
                  borderRadius: 8,
                  padding: '12px 16px',
                  fontSize: 13,
                  color: 'var(--sh-info-text, #1e40af)',
                  marginBottom: 16,
                }}
              >
                <strong>Account Status: New</strong>
                <p style={{ margin: '6px 0 0', lineHeight: 1.5 }}>
                  {sessionUser?.emailVerified
                    ? 'Your email is verified. After a few days with no issues, your account will be automatically promoted to trusted status and your content will publish immediately.'
                    : 'Verify your email to unlock all features. Once verified and after a few days with no issues, your content will publish immediately.'}
                </p>
              </div>
            )}
            {sessionUser?.trustLevel === 'trusted' && (
              <div
                style={{
                  background: 'var(--sh-success-bg, #d1fae5)',
                  border: '1px solid var(--sh-success-border, #6ee7b7)',
                  borderRadius: 8,
                  padding: '12px 16px',
                  fontSize: 13,
                  color: 'var(--sh-success-text, #065f46)',
                  marginBottom: 16,
                }}
              >
                <strong>Account Status: Trusted</strong>
                <p style={{ margin: '6px 0 0' }}>Your content publishes immediately.</p>
              </div>
            )}
            <ProfileTab
              user={user}
              sessionUser={sessionUser}
              onAvatarChange={(url) => {
                setUser((u) => (u ? { ...u, avatarUrl: url } : u))
                setSessionUser((u) => (u ? { ...u, avatarUrl: url } : u))
              }}
              onCoverChange={(url) => {
                setUser((u) => (u ? { ...u, coverImageUrl: url } : u))
                setSessionUser((u) => (u ? { ...u, coverImageUrl: url } : u))
              }}
            />
          </>
        )
      case 'security':
        return (
          <SecurityTab
            user={user}
            sessionUser={sessionUser}
            busyKey={busyKey}
            setBusyKey={setBusyKey}
            handlePatch={handlePatch}
            syncUser={syncUser}
          />
        )
      case 'notifications':
        return (
          <div data-tutorial="settings-notifications">
            <NotificationsTab />
          </div>
        )
      case 'privacy':
        return <PrivacyTab />
      case 'appearance':
        return (
          <div data-tutorial="settings-appearance">
            <AppearanceTab />
          </div>
        )
      case 'account':
        return (
          <AccountTab
            user={user}
            busyKey={busyKey}
            setBusyKey={setBusyKey}
            handlePatch={handlePatch}
            syncUser={syncUser}
            clearSession={clearSession}
          />
        )
      case 'subscription':
        return <SubscriptionTab />
      case 'legal':
        return <LegalTab />
      case 'moderation':
        return <ModerationTab />
      default:
        return null
    }
  }

  /* Sign out action button for navbar */
  const navActions = (
    <button
      onClick={() => signOut().then(() => navigate('/login', { replace: true }))}
      style={{
        padding: '6px 14px',
        borderRadius: 8,
        border: '1px solid var(--sh-border)',
        background: 'transparent',
        color: 'var(--sh-muted)',
        fontSize: 12,
        fontWeight: 700,
        cursor: 'pointer',
        fontFamily: FONT,
      }}
    >
      Sign Out
    </button>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--sh-bg)', fontFamily: FONT }}>
      <Navbar crumbs={[{ label: 'Settings', to: '/settings' }]} hideTabs actions={navActions} />

      <div
        className="settings-layout"
        style={{
          maxWidth: 1180,
          width: '100%',
          margin: '0 auto',
          padding: '28px clamp(12px, 2vw, 24px) 60px',
          boxSizing: 'border-box',
        }}
      >
        <aside>
          {/* Admin Panel shortcut — only visible to admins */}
          {sessionUser?.role === 'admin' && (
            <Link
              to="/admin"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 12,
                padding: '10px 14px',
                borderRadius: 10,
                background: 'var(--sh-warning-bg)',
                color: 'var(--sh-warning-text)',
                border: '1px solid var(--sh-warning-border)',
                fontSize: 13,
                fontWeight: 700,
                textDecoration: 'none',
                transition: 'opacity 0.15s',
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              Admin Panel
            </Link>
          )}

          <nav className="settings-nav" data-tutorial="settings-tabs">
            {NAV_TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                className="settings-nav-btn"
                onClick={() => setTab(item.id)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 14px',
                  marginBottom: 4,
                  borderRadius: 10,
                  border: 'none',
                  background: tab === item.id ? 'var(--sh-surface)' : 'transparent',
                  color: tab === item.id ? 'var(--sh-heading)' : 'var(--sh-muted)',
                  fontSize: 14,
                  fontWeight: tab === item.id ? 700 : 500,
                  cursor: 'pointer',
                  boxShadow: tab === item.id ? 'var(--shadow-sm)' : 'none',
                  fontFamily: 'inherit',
                }}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        <main id="main-content" ref={tabContentRef}>
          {renderTab()}
        </main>
      </div>

      <SafeJoyride {...tutorial.joyrideProps} />
    </div>
  )
}
