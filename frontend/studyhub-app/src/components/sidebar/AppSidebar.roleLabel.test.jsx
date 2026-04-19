import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

const mockUser = { current: null }

vi.mock('../../lib/session-context', () => ({
  useSession: () => ({ user: mockUser.current }),
}))

// Keep these legacy role-label tests deterministic by forcing the Phase 1
// flag OFF. Sectioned-nav behavior is covered in AppSidebar.sections.test.jsx.
vi.mock('../../lib/designV2Flags', () => ({
  useDesignV2Flags: () => ({
    phase1Dashboard: false,
    phase2Triage: false,
    aiCard: false,
    sheetsGrid: false,
    authSplit: false,
    onboarding: false,
    feedPolish: false,
    homeHero: false,
    loading: false,
  }),
  clearDesignV2FlagCache: () => {},
  FLAG_NAMES: {},
}))

import AppSidebar from './AppSidebar'

function renderWith(user) {
  mockUser.current = user
  return render(
    <MemoryRouter initialEntries={['/feed']}>
      <AppSidebar mode="fixed" />
    </MemoryRouter>,
  )
}

const baseUser = {
  id: 1,
  username: 'beta_user',
  role: 'student',
  createdAt: '2026-03-16T12:00:00.000Z',
  avatarUrl: null,
  enrollments: [],
}

describe('AppSidebar role label', () => {
  it('renders "Student" for accountType=student', () => {
    renderWith({ ...baseUser, accountType: 'student' })
    expect(screen.getByText(/Student · Joined/)).toBeInTheDocument()
  })

  it('renders "Teacher" for accountType=teacher', () => {
    renderWith({ ...baseUser, accountType: 'teacher' })
    expect(screen.getByText(/Teacher · Joined/)).toBeInTheDocument()
  })

  it('renders "Self-learner" for accountType=other (never "Member")', () => {
    const { container } = renderWith({ ...baseUser, accountType: 'other' })
    expect(screen.getByText(/Self-learner · Joined/)).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/\bMember\b/)
  })

  it('hides My Courses section heading for Self-learners', () => {
    renderWith({ ...baseUser, accountType: 'other' })
    expect(screen.queryByRole('heading', { name: /MY COURSES/i })).not.toBeInTheDocument()
  })

  it('shows MY COURSES heading for students', () => {
    renderWith({ ...baseUser, accountType: 'student' })
    expect(screen.getAllByText(/MY COURSES/i).length).toBeGreaterThan(0)
  })

  it('renders "Admin" for admin role regardless of accountType', () => {
    renderWith({ ...baseUser, role: 'admin', accountType: 'other' })
    expect(screen.getByText(/Admin · Joined/)).toBeInTheDocument()
  })
})
