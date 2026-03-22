// src/components/sidebarConstants.js
// Constants, config, and helper functions for AppSidebar

import {
  IconFeed, IconSheets, IconTests, IconNotes,
  IconAnnouncements, IconProfile,
} from './Icons'

export const FOCUSABLE_DRAWER_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export const NAV_LINKS = [
  { icon: IconFeed,          label: 'Feed',           to: '/feed' },
  { icon: IconSheets,        label: 'Study Sheets',   to: '/sheets' },
  { icon: IconTests,         label: 'Practice Tests', to: '/tests' },
  { icon: IconNotes,         label: 'My Notes',       to: '/notes' },
  { icon: IconAnnouncements, label: 'Announcements',  to: '/announcements' },
  { icon: IconProfile,       label: 'Profile',        to: '/dashboard' },
]

const COURSE_COLORS = {
  CMSC: '#8b5cf6', MATH: '#10b981', ENGL: '#f59e0b',
  PHYS: '#0ea5e9', BIOL: '#ec4899', HIST: '#6366f1',
  ECON: '#14b8a6', CHEM: '#f97316',
}

export function courseColor(code = '') {
  const prefix = code.replace(/\d.*/, '').toUpperCase()
  return COURSE_COLORS[prefix] || 'var(--sh-brand)'
}

export function Avatar({ name, size = 48, role }) {
  const initials = (name || '?').slice(0, 2).toUpperCase()
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: role === 'admin' ? 'var(--sh-brand)' : 'var(--sh-avatar-bg)',
      color: role === 'admin' ? '#fff' : 'var(--sh-avatar-text)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.35, fontWeight: 700, flexShrink: 0,
      border: '2px solid var(--sh-border)',
    }}>
      {initials}
    </div>
  )
}
