import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { LogoMark } from '../../components/Icons'
import { API } from '../../config'
import { useSession } from '../../lib/session-context'
import { Button } from './settingsShared'
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
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#edf0f5', color: '#64748b' }}>
        Loading settings...
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
        return <NotificationsTab />
      case 'privacy':
        return <PrivacyTab />
      case 'courses':
        return <CoursesTab user={user} busyKey={busyKey} setBusyKey={setBusyKey} syncUser={syncUser} />
      case 'appearance':
        return <AppearanceTab />
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

  return (
    <div style={{ minHeight: '100vh', background: '#edf0f5', fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 20, background: '#0f172a', borderBottom: '1px solid #1e293b' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link to="/feed" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
            <LogoMark size={28} />
            <span style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>StudyHub</span>
          </Link>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#94a3b8' }}>Settings</span>
          <div style={{ marginLeft: 'auto' }}>
            <Button secondary onClick={() => signOut().then(() => navigate('/login', { replace: true }))}>
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <div className="settings-layout" style={{ maxWidth: 1180, margin: '0 auto', padding: '28px 24px 60px' }}>
        <aside>
          <nav className="settings-nav">
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

        <main>
          {renderTab()}
        </main>
      </div>
    </div>
  )
}
