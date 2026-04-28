// src/mobile/components/BottomTabBar.jsx
// Floating pill bottom tab bar with center Compose FAB.
// See docs/internal/mobile-design-refresh-v3-spec.md §4.6.

import { useCallback, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useSession } from '../../lib/session-context'
import haptics from '../lib/haptics'
import { resolveImageUrl } from '../../lib/imageUrls'
import BottomSheet from './BottomSheet'
import { useScrollDirection } from '../hooks/useScrollDirection'
import { useReducedMotion } from '../hooks/useReducedMotion'

function TabIcon({ name, active }) {
  const weight = active ? '2.2' : '1.8'
  const fill = active ? 'currentColor' : 'none'

  if (name === 'home') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill={fill} aria-hidden="true">
        <path
          d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-4.5v-5.5a1 1 0 00-1-1h-3a1 1 0 00-1 1V21H5a1 1 0 01-1-1V10.5z"
          stroke="currentColor"
          strokeWidth={weight}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  if (name === 'messages') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill={fill} aria-hidden="true">
        <path
          d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"
          stroke="currentColor"
          strokeWidth={weight}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  if (name === 'ai') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill={fill} aria-hidden="true">
        <path
          d="M12 2L9.5 8.5 3 12l6.5 3.5L12 22l2.5-6.5L21 12l-6.5-3.5L12 2z"
          stroke="currentColor"
          strokeWidth={weight}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  return null
}

function ComposeIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

const TABS = [
  { key: 'home', label: 'Home', path: '/m/home' },
  { key: 'messages', label: 'Messages', path: '/m/messages' },
  { key: 'ai', label: 'Hub AI', path: '/m/ai' },
]

const COMPOSE_OPTIONS = [
  { key: 'post', title: 'New post', desc: 'Share something with your feed', path: '/submit' },
  { key: 'sheet', title: 'New sheet', desc: 'Create a new study sheet', path: '/m/sheets/new' },
  { key: 'note', title: 'New note', desc: 'Jot down a quick note', path: '/m/notes/new' },
  { key: 'message', title: 'New message', desc: 'Start a conversation', path: '/m/messages' },
]

export default function BottomTabBar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useSession()
  const [composeOpen, setComposeOpen] = useState(false)
  const scrollDirection = useScrollDirection()
  const reducedMotion = useReducedMotion()
  // Hide only when the user is actively scrolling down on a long page and no
  // modal/sheet is open. Reduced-motion users keep the bar pinned.
  const hidden = !reducedMotion && !composeOpen && scrollDirection === 'down'

  const activeTab =
    TABS.find((t) => location.pathname.startsWith(t.path))?.key ||
    (location.pathname.startsWith('/m/profile') ? 'profile' : 'home')

  const handleTap = useCallback(
    (tab) => {
      if (tab.key === activeTab) return
      haptics.select()
      navigate(tab.path)
    },
    [activeTab, navigate],
  )

  const handleProfileTap = useCallback(() => {
    if (activeTab === 'profile') return
    haptics.select()
    navigate('/m/profile')
  }, [activeTab, navigate])

  const handleComposeTap = useCallback(() => {
    haptics.tap()
    setComposeOpen(true)
  }, [])

  const handleComposePick = useCallback(
    (opt) => {
      haptics.tap()
      setComposeOpen(false)
      navigate(opt.path)
    },
    [navigate],
  )

  const profileActive = activeTab === 'profile'
  const avatarInitial = (user?.username || user?.displayName || 'U').charAt(0).toUpperCase()
  const avatarUrl = resolveImageUrl(user?.avatarUrl)

  return (
    <>
      <nav
        className={`sh-m-tabbar ${hidden ? 'sh-m-tabbar--hidden' : ''}`.trim()}
        aria-label="Main navigation"
        aria-hidden={hidden ? 'true' : undefined}
      >
        {/* Left cluster: Home + Messages */}
        {TABS.slice(0, 2).map((tab) => {
          const isActive = tab.key === activeTab
          return (
            <button
              key={tab.key}
              type="button"
              className={`sh-m-tabbar__item ${isActive ? 'sh-m-tabbar__item--active' : ''}`.trim()}
              onClick={() => handleTap(tab)}
              aria-current={isActive ? 'page' : undefined}
              aria-label={tab.label}
            >
              <TabIcon name={tab.key} active={isActive} />
              <span className="sh-m-tabbar__item-label">{tab.label}</span>
              <span className="sh-m-tabbar__item-underline" aria-hidden="true" />
            </button>
          )
        })}

        {/* Center compose FAB */}
        <button
          type="button"
          className="sh-m-tabbar__compose"
          onClick={handleComposeTap}
          aria-label="Create"
        >
          <ComposeIcon />
        </button>

        {/* Right cluster: AI + Profile (avatar) */}
        {TABS.slice(2).map((tab) => {
          const isActive = tab.key === activeTab
          return (
            <button
              key={tab.key}
              type="button"
              className={`sh-m-tabbar__item ${isActive ? 'sh-m-tabbar__item--active' : ''}`.trim()}
              onClick={() => handleTap(tab)}
              aria-current={isActive ? 'page' : undefined}
              aria-label={tab.label}
            >
              <TabIcon name={tab.key} active={isActive} />
              <span className="sh-m-tabbar__item-label">{tab.label}</span>
              <span className="sh-m-tabbar__item-underline" aria-hidden="true" />
            </button>
          )
        })}

        <button
          type="button"
          className={`sh-m-tabbar__item ${profileActive ? 'sh-m-tabbar__item--active' : ''}`.trim()}
          onClick={handleProfileTap}
          aria-current={profileActive ? 'page' : undefined}
          aria-label="Profile"
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="sh-m-tabbar__avatar"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span
              className="sh-m-tabbar__avatar"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.78rem',
                fontWeight: 700,
                color: 'var(--sh-subtext)',
              }}
            >
              {avatarInitial}
            </span>
          )}
          <span className="sh-m-tabbar__item-label">Profile</span>
          <span className="sh-m-tabbar__item-underline" aria-hidden="true" />
        </button>
      </nav>

      <BottomSheet open={composeOpen} onClose={() => setComposeOpen(false)} title="Create">
        <div className="sh-m-compose-list">
          {COMPOSE_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              className="sh-m-compose-item"
              onClick={() => handleComposePick(opt)}
            >
              <span className="sh-m-compose-item__icon" aria-hidden="true">
                <ComposeIcon />
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'left' }}>
                <span className="sh-m-compose-item__title">{opt.title}</span>
                <span className="sh-m-compose-item__desc">{opt.desc}</span>
              </span>
            </button>
          ))}
        </div>
      </BottomSheet>
    </>
  )
}
