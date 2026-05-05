// src/components/sidebarConstants.js
// Constants, config, and helper functions for AppSidebar.
// The Avatar component lives in sidebarComponents.jsx and is
// re-exported here for backward-compatible imports.

import {
  IconFeed,
  IconSheets,
  IconTests,
  IconNotes,
  IconMessages,
  IconAnnouncements,
  IconProfile,
  IconSchool,
  IconUsers,
  IconSpark,
  IconBook,
  IconCode,
  IconTag,
  IconHeart,
  IconLink,
  IconSettings,
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
  { icon: IconFeed, label: 'Feed', to: '/feed' },
  { icon: IconSheets, label: 'Study Sheets', to: '/sheets' },
  { icon: IconBook, label: 'Library', to: '/library' },
  { icon: IconTests, label: 'Practice Tests', to: '/tests', comingSoon: true },
  { icon: IconNotes, label: 'My Notes', to: '/notes' },
  { icon: IconMessages, label: 'Messages', to: '/messages' },
  { icon: IconUsers, label: 'Study Groups', to: '/study-groups' },
  { icon: IconSpark, label: 'Hub AI', to: '/ai' },
  { icon: IconCode, label: 'Playground', to: '/playground' },
  { icon: IconAnnouncements, label: 'Announcements', to: '/announcements' },
  { icon: IconSchool, label: 'My Courses', to: '/my-courses' },
  { icon: IconLink, label: 'Invite Classmates', to: '/invite' },
  { icon: IconTag, label: 'Pricing', to: '/pricing' },
  { icon: IconHeart, label: 'Supporters', to: '/supporters' },
  { icon: IconProfile, label: 'My Profile', to: '__MY_PROFILE__' },
]

/* -- Phase 1 of v2 design refresh ------------------------------------
 * Sectioned sidebar navigation grouped into MAIN / PERSONAL / ACCOUNT.
 * See docs/internal/design-refresh-v2-master-plan.md Phase 1.
 *
 * Used only when the `design_v2_phase1_dashboard` flag is enabled.
 * The flat `NAV_LINKS` export above is retained so legacy consumers
 * keep working during the rollout.
 *
 * `accountTypes` on a link narrows visibility - when omitted the link
 * is shown for every accountType. `roles` narrows by platform role
 * (e.g. admin-only links).
 * ------------------------------------------------------------------ */
export const SIDEBAR_SECTIONS = [
  {
    key: 'main',
    label: 'MAIN',
    links: [
      { icon: IconFeed, label: 'Feed', to: '/feed' },
      { icon: IconSheets, label: 'Study Sheets', to: '/sheets' },
      { icon: IconBook, label: 'Library', to: '/library' },
      { icon: IconTests, label: 'Practice Tests', to: '/tests', comingSoon: true },
      { icon: IconMessages, label: 'Messages', to: '/messages' },
      { icon: IconUsers, label: 'Study Groups', to: '/study-groups' },
      { icon: IconSpark, label: 'Hub AI', to: '/ai' },
      { icon: IconCode, label: 'Playground', to: '/playground' },
      { icon: IconAnnouncements, label: 'Announcements', to: '/announcements' },
    ],
  },
  {
    key: 'personal',
    label: 'PERSONAL',
    links: [
      { icon: IconNotes, label: 'My Notes', to: '/notes' },
      { icon: IconProfile, label: 'My Profile', to: '__MY_PROFILE__' },
      {
        icon: IconSchool,
        label: 'My Courses',
        to: '/my-courses',
        accountTypes: ['student', 'teacher'],
      },
      { icon: IconLink, label: 'Invite Classmates', to: '/invite' },
      // Teacher-only stub - Teach route ships end-to-end in Week 7. For now
      // the link navigates to the existing `My Teaching` profile section so
      // teachers have a discoverable entry point today.
      {
        icon: IconUsers,
        label: 'Teach',
        to: '/teach',
        accountTypes: ['teacher'],
        isStub: true,
      },
    ],
  },
  {
    key: 'account',
    label: 'ACCOUNT',
    links: [
      { icon: IconTag, label: 'Pricing', to: '/pricing' },
      { icon: IconHeart, label: 'Supporters', to: '/supporters' },
      { icon: IconSettings, label: 'Settings', to: '/settings' },
    ],
  },
]

export function visibleSidebarSections(user) {
  if (!user) return []
  return SIDEBAR_SECTIONS.map((section) => ({
    ...section,
    links: section.links.filter((link) => {
      if (link.accountTypes && !link.accountTypes.includes(user.accountType || 'student')) {
        return false
      }
      if (link.roles && !link.roles.includes(user.role || 'student')) {
        return false
      }
      return true
    }),
  })).filter((section) => section.links.length > 0)
}

const COURSE_COLORS = {
  CMSC: '#8b5cf6',
  MATH: '#10b981',
  ENGL: '#f59e0b',
  PHYS: '#0ea5e9',
  BIOL: '#ec4899',
  HIST: '#6366f1',
  ECON: '#14b8a6',
  CHEM: '#f97316',
}

export function courseColor(code = '') {
  const prefix = code.replace(/\d.*/, '').toUpperCase()
  return COURSE_COLORS[prefix] || 'var(--sh-brand)'
}

/* -- Re-export JSX component from sidebarComponents.jsx ------------- */
export { Avatar } from './sidebarComponents.jsx'
