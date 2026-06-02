// src/components/NavbarUserMenu.jsx
// Extracted from Navbar.jsx — user avatar + dropdown menu component.

import { Fragment, useState, useEffect, useRef } from 'react'
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
  const triggerRef = useRef(null)
  // Roving-tabindex item refs for the open menu (WAI-ARIA APG Menu pattern).
  // Indexed positionally so ArrowUp/Down/Home/End move focus across the
  // three menuitems. Mirrors the itemRefs roving pattern in SegmentedNav.
  const itemRefs = useRef([])

  // The menu items, declared as data so keyboard roving + rendering share
  // one source of truth. `danger` flags the destructive Log out action.
  const menuItems = [
    { label: 'My Profile', action: () => navigate(`/users/${user.username}`) },
    { label: 'Settings', action: () => navigate('/settings') },
    {
      label: 'Log out',
      danger: true,
      action: async () => {
        await signOut()
        navigate('/login')
      },
    },
  ]

  function closeMenu({ restoreFocus = false } = {}) {
    setShowUserMenu(false)
    if (restoreFocus) triggerRef.current?.focus()
  }

  function selectItem(item) {
    setShowUserMenu(false)
    item.action()
  }

  // close user menu dropdown on outside click
  useEffect(() => {
    if (!showUserMenu) return
    function onClickOutside(e) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setShowUserMenu(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [showUserMenu])

  // On open, land focus on the first menuitem per the APG Menu pattern so
  // arrow keys have an anchor. Runs only on the open transition.
  useEffect(() => {
    if (showUserMenu) itemRefs.current[0]?.focus()
  }, [showUserMenu])

  // WAI-ARIA APG Menu keyboard contract: ArrowDown/Up move between items
  // (wrapping), Home/End jump to first/last, Escape closes and restores
  // focus to the trigger. Enter/Space fire the focused button natively.
  function handleMenuKeyDown(e) {
    const count = menuItems.length
    if (count === 0) return
    const currentIdx = itemRefs.current.findIndex((node) => node === document.activeElement)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = currentIdx < 0 ? 0 : (currentIdx + 1) % count
      itemRefs.current[next]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prev = currentIdx < 0 ? count - 1 : (currentIdx - 1 + count) % count
      itemRefs.current[prev]?.focus()
    } else if (e.key === 'Home') {
      e.preventDefault()
      itemRefs.current[0]?.focus()
    } else if (e.key === 'End') {
      e.preventDefault()
      itemRefs.current[count - 1]?.focus()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      closeMenu({ restoreFocus: true })
    }
  }

  return (
    <div ref={userMenuRef} style={{ position: 'relative' }}>
      <div
        ref={triggerRef}
        style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
        onClick={() => setShowUserMenu((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setShowUserMenu((v) => !v)
          } else if (e.key === 'ArrowDown' && !showUserMenu) {
            // APG: ArrowDown on a collapsed menu button opens it and focuses
            // the first item (handled by the open-transition effect).
            e.preventDefault()
            setShowUserMenu(true)
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
        <div style={S.userMenu} role="menu" onKeyDown={handleMenuKeyDown}>
          {menuItems.map((item, i) => (
            <Fragment key={item.label}>
              {i === menuItems.length - 1 && (
                <div
                  style={{ borderTop: '1px solid var(--sh-border)', margin: '4px 0' }}
                  role="separator"
                />
              )}
              <button
                ref={(node) => {
                  if (node) itemRefs.current[i] = node
                  else delete itemRefs.current[i]
                }}
                type="button"
                style={
                  item.danger ? { ...S.userMenuItem, color: 'var(--sh-danger)' } : S.userMenuItem
                }
                role="menuitem"
                onClick={() => selectItem(item)}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--sh-soft)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
              >
                {item.label}
              </button>
            </Fragment>
          ))}
        </div>
      )}
    </div>
  )
}
