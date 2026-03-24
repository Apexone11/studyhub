// src/components/NavbarUserMenu.jsx
// Extracted from Navbar.jsx — user avatar + dropdown menu component.

import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconChevronDown } from './Icons'
import { useSession } from '../lib/session-context'
import { S } from './navbarConstants'
import { API } from '../config'

export default function NavbarUserMenu({ user }) {
  const navigate = useNavigate()
  const { signOut } = useSession()
  const initials = user?.username?.slice(0, 2).toUpperCase() || '??'

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
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowUserMenu((v) => !v) } }}
        role="button"
        tabIndex={0}
        aria-label={`User menu: ${user.username}`}
        aria-expanded={showUserMenu}
        aria-haspopup="true"
      >
        {user.avatarUrl
          ? <img src={user.avatarUrl.startsWith('http') ? user.avatarUrl : `${API}${user.avatarUrl}`} alt="" style={{ ...S.avatar, objectFit: 'cover' }} />
          : <div style={S.avatar} aria-hidden="true">{initials}</div>
        }
        <span style={S.username}>{user.username}</span>
        <IconChevronDown size={13} style={{ color: 'var(--sh-nav-search-text)', transform: showUserMenu ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} aria-hidden="true" />
      </div>

      {showUserMenu && (
        <div style={S.userMenu}>
          <button type="button" style={S.userMenuItem} onClick={() => { setShowUserMenu(false); navigate(`/users/${user.username}`) }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--sh-soft)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            My Profile
          </button>
          <button type="button" style={S.userMenuItem} onClick={() => { setShowUserMenu(false); navigate('/settings') }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--sh-soft)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            Settings
          </button>
          <div style={{ borderTop: '1px solid var(--sh-border)', margin: '4px 0' }} />
          <button type="button" style={{ ...S.userMenuItem, color: 'var(--sh-danger)' }}
            onClick={async () => { setShowUserMenu(false); await signOut(); navigate('/login') }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--sh-soft)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            Log out
          </button>
        </div>
      )}
    </div>
  )
}
