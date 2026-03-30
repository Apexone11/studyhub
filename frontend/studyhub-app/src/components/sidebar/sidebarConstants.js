// src/components/sidebarConstants.js
// Constants, config, and helper functions for AppSidebar.
// The Avatar component lives in sidebarComponents.jsx and is
// re-exported here for backward-compatible imports.

import {
  IconFeed, IconSheets, IconTests, IconNotes, IconMessages,
  IconAnnouncements, IconProfile, IconSchool,
} from '../Icons'

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
  { icon: IconMessages,      label: 'Messages',       to: '/messages' },
  { icon: IconAnnouncements, label: 'Announcements',  to: '/announcements' },
  { icon: IconSchool,        label: 'My Courses',     to: '/my-courses' },
  { icon: IconProfile,       label: 'My Profile',     to: '__MY_PROFILE__' },
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

/* ── Re-export JSX component from sidebarComponents.jsx ────────────── */
export { Avatar } from './sidebarComponents.jsx'
