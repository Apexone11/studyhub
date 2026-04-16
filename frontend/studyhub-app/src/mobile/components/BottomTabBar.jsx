// src/mobile/components/BottomTabBar.jsx
// Four-tab bottom navigation: Home, Messages, AI, Profile.
// Active tab uses brand color; inactive uses muted. Safe-area inset respected.

import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

function TabIcon({ name, active }) {
  const color = active ? 'var(--sh-brand)' : 'var(--sh-muted)'
  const weight = active ? '2.2' : '1.8'

  const icons = {
    home: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-4.5v-5.5a1 1 0 00-1-1h-3a1 1 0 00-1 1V21H5a1 1 0 01-1-1V10.5z"
          stroke={color}
          strokeWidth={weight}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    messages: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"
          stroke={color}
          strokeWidth={weight}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    ai: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 2L9.5 8.5 3 12l6.5 3.5L12 22l2.5-6.5L21 12l-6.5-3.5L12 2z"
          stroke={color}
          strokeWidth={weight}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    profile: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="8" r="4" stroke={color} strokeWidth={weight} />
        <path
          d="M5 20c0-3.314 3.134-6 7-6s7 2.686 7 6"
          stroke={color}
          strokeWidth={weight}
          strokeLinecap="round"
        />
      </svg>
    ),
  }

  return icons[name] || null
}

const TABS = [
  { key: 'home', label: 'Home', path: '/m/home' },
  { key: 'messages', label: 'Messages', path: '/m/messages' },
  { key: 'ai', label: 'Hub AI', path: '/m/ai' },
  { key: 'profile', label: 'Profile', path: '/m/profile' },
]

export default function BottomTabBar() {
  const location = useLocation()
  const navigate = useNavigate()

  const activeTab = TABS.find((t) => location.pathname.startsWith(t.path))?.key || 'home'

  const handleTap = useCallback(
    (path) => {
      navigate(path)
    },
    [navigate],
  )

  return (
    <nav className="mob-tab-bar" aria-label="Main navigation">
      {TABS.map((tab) => {
        const isActive = tab.key === activeTab
        return (
          <button
            key={tab.key}
            className={`mob-tab-bar-item ${isActive ? 'mob-tab-bar-item--active' : ''}`}
            onClick={() => handleTap(tab.path)}
            aria-current={isActive ? 'page' : undefined}
            aria-label={tab.label}
            type="button"
          >
            <TabIcon name={tab.key} active={isActive} />
            <span
              className="mob-tab-bar-label"
              style={{ color: isActive ? 'var(--sh-brand)' : 'var(--sh-muted)' }}
            >
              {tab.label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
