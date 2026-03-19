/* ═══════════════════════════════════════════════════════════════════════════
 * SettingsPage.jsx — Account settings with tabbed navigation
 *
 * Layout: Sticky header + 2-column (tabs sidebar | tab content).
 * Responsive: On phone, tabs become a horizontal scrollable row.
 * 7 tabs: Profile, Security, Notifications, Privacy, Courses, Appearance, Account
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Navbar from '../../components/Navbar'
import SafeJoyride from '../../components/SafeJoyride'
import { API } from '../../config'
import { useSession } from '../../lib/session-context'
import { useTutorial } from '../../lib/useTutorial'
import { SETTINGS_STEPS } from '../../lib/tutorialSteps'
import { fadeInUp } from '../../lib/animations'
import { Skeleton } from '../../components/Skeleton'
import { FONT } from './settingsState'
import ProfileTab from './ProfileTab'
import SecurityTab from './SecurityTab'
import CoursesTab from './CoursesTab'
import AccountTab from './AccountTab'
import NotificationsTab from './NotificationsTab'
import PrivacyTab from './PrivacyTab'
import AppearanceTab from './AppearanceTab'

const NAV_TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'security', label: 'Security' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'courses', label: 'Courses' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'account', label: 'Account' },
]

export default function SettingsPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user: sessionUser, setSessionUser, signOut, clearSession } = useSession()

  const initialTab = NAV_TABS.find((t) => t.id === searchParams.get('tab'))?.id || 'profile'
  const [tab, setTab] = useState(initialTab)
  const tutorial = useTutorial('settings', SETTINGS_STEPS)
  const tabContentRef = useRef(null)

  /* Animate tab content on switch */
  useEffect(() => {
    if (tabContentRef.current) fadeInUp(tabContentRef.current, { duration: 350, y: 10 })
  }, [tab])
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busyKey, setBusyKey] = useState('')

  useEffect(() => {
    let active = true

    fetch(`${API}/api/settings/me`, {
      headers: { 'Content-Type': 'application/json' },
    })
      .then(async (r) => {
        if (!r.ok) throw new Error('Could not load your settings.')
        return r.json()
      })
      .then((data) => {
        if (active) setUser(data)
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => { active = false }
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
        body: JSON.stringify(body),
      })
      const data = await response.json()

      if (!response.ok) {
        setter({ type: 'error', text: data.error || 'Request failed.' })
        return
      }

      if (data.user) syncUser(data.user)
      setter({ type: 'success', text: data.message || 'Saved.' })
      successHandler?.(data)
    } catch {
      setter({ type: 'error', text: 'Could not connect to the server.' })
    } finally {
      setBusyKey('')
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#edf0f5', fontFamily: FONT }}>
        <Navbar crumbs={[{ label: 'Settings', to: '/settings' }]} hideTabs />
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '28px 24px 60px' }}>
          <div style={{ display: 'grid', gap: 12 }}>
            <Skeleton width="100%" height={48} borderRadius={12} />
            <Skeleton width="100%" height={200} borderRadius={16} />
            <Skeleton width="100%" height={120} borderRadius={16} />
          </div>
        </div>
      </div>
    )
  }

  function renderTab() {
    switch (tab) {
      case 'profile':
        return <ProfileTab user={user} sessionUser={sessionUser} />
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
        return <div data-tutorial="settings-notifications"><NotificationsTab /></div>
      case 'privacy':
        return <PrivacyTab />
      case 'courses':
        return <CoursesTab user={user} busyKey={busyKey} setBusyKey={setBusyKey} syncUser={syncUser} />
      case 'appearance':
        return <div data-tutorial="settings-appearance"><AppearanceTab /></div>
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
      default:
        return null
    }
  }

  /* Sign out action button for navbar */
  const navActions = (
    <button
      onClick={() => signOut().then(() => navigate('/login', { replace: true }))}
      style={{
        padding: '6px 14px', borderRadius: 8, border: '1px solid #334155',
        background: 'transparent', color: '#94a3b8', fontSize: 12, fontWeight: 700,
        cursor: 'pointer', fontFamily: FONT,
      }}
    >
      Sign Out
    </button>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#edf0f5', fontFamily: FONT }}>
      <Navbar crumbs={[{ label: 'Settings', to: '/settings' }]} hideTabs actions={navActions} />

      <div className="settings-layout" style={{ maxWidth: 1180, margin: '0 auto', padding: '28px 24px 60px' }}>
        <aside>
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
                  background: tab === item.id ? '#fff' : 'transparent',
                  color: tab === item.id ? '#0f172a' : '#64748b',
                  fontSize: 14,
                  fontWeight: tab === item.id ? 700 : 500,
                  cursor: 'pointer',
                  boxShadow: tab === item.id ? '0 2px 10px rgba(15, 23, 42, 0.05)' : 'none',
                  fontFamily: 'inherit',
                }}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        <main ref={tabContentRef}>
          {renderTab()}
        </main>
      </div>

      <SafeJoyride {...tutorial.joyrideProps} />
    </div>
  )
}
