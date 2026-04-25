// src/components/NavbarUserMenu.jsx
// Extracted from Navbar.jsx — user avatar + dropdown menu component.

import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconChevronDown } from '../Icons'
import { useSession } from '../../lib/session-context'
import { S } from './navbarConstants'
import UserAvatar from '../UserAvatar'

export default function NavbarUserMenu({ user }) {
  const navigate = useNavigate()
  const { signOut } = useSession()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const userMenuRef = useRef(null)

  // close user menu dropdown on outside click
  useEffect(() => {
    if (!showUserMenu) return
    function onClickOutside(e) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setShowUserMenu(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [showUserMenu])

  return (
    <div ref={userMenuRef} style={{ position: 'relative' }}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
        onClick={() => setShowUserMenu((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setShowUserMenu((v) => !v)
          }
        }}
        role="button"
        tabIndex={0}
        aria-label={`User menu: ${user.username}`}
        aria-expanded={showUserMenu}
        aria-haspopup="menu"
      >
        <UserAvatar
          username={user.username}
          avatarUrl={user.avatarUrl}
          role={user.role}
          size={32}
          border="1.5px solid var(--sh-nav-tab-active)"
        />
        <span style={S.username}>{user.username}</span>
        <IconChevronDown
          size={13}
          style={{
            color: 'var(--sh-nav-search-text)',
            transform: showUserMenu ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s',
          }}
          aria-hidden="true"
        />
      </div>

      {showUserMenu && (
        <div style={S.userMenu} role="menu">
          <button
            type="button"
            style={S.userMenuItem}
            role="menuitem"
            onClick={() => {
              setShowUserMenu(false)
              navigate(`/users/${user.username}`)
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--sh-soft)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
          >
            My Profile
          </button>
          <button
            type="button"
            style={S.userMenuItem}
            role="menuitem"
            onClick={() => {
              setShowUserMenu(false)
              navigate('/settings')
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--sh-soft)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
          >
            Settings
          </button>
          <div
            style={{ borderTop: '1px solid var(--sh-border)', margin: '4px 0' }}
            role="separator"
          />
          <button
            type="button"
            style={{ ...S.userMenuItem, color: 'var(--sh-danger)' }}
            role="menuitem"
            onClick={async () => {
              setShowUserMenu(false)
              await signOut()
              navigate('/login')
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--sh-soft)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
          >
            Log out
          </button>
        </div>
      )}
    </div>
  )
}
