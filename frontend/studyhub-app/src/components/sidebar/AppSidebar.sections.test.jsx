import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

const mockUser = { current: null }

vi.mock('../../lib/session-context', () => ({
  useSession: () => ({ user: mockUser.current }),
}))

// Phase 1 sectioned nav path — force the flag ON for this whole file.
vi.mock('../../lib/designV2Flags', () => ({
  useDesignV2Flags: () => ({
    phase1Dashboard: true,
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

describe('AppSidebar sectioned nav (phase1 on)', () => {
  it('renders the three section headings (MAIN, PERSONAL, ACCOUNT) for a student', () => {
    renderWith({ ...baseUser, accountType: 'student' })
    expect(screen.getAllByText(/^MAIN$/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/^PERSONAL$/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/^ACCOUNT$/).length).toBeGreaterThan(0)
  })

  it('students see My Courses under PERSONAL', () => {
    renderWith({ ...baseUser, accountType: 'student' })
    expect(screen.getAllByText(/^My Courses$/i).length).toBeGreaterThan(0)
  })

  it('teachers see My Courses AND the Teach stub under PERSONAL', () => {
    renderWith({ ...baseUser, accountType: 'teacher' })
    expect(screen.getAllByText(/^My Courses$/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/^Teach$/i).length).toBeGreaterThan(0)
  })

  it('Self-learners do NOT see My Courses or the Teach stub', () => {
    renderWith({ ...baseUser, accountType: 'other' })
    expect(screen.queryByText(/^My Courses$/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Teach$/i)).not.toBeInTheDocument()
  })

  it('renders the ACCOUNT section with Pricing, Supporters, Settings', () => {
    renderWith({ ...baseUser, accountType: 'student' })
    expect(screen.getAllByText(/^Pricing$/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/^Supporters$/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/^Settings$/i).length).toBeGreaterThan(0)
  })

  it('renders MAIN links Feed, Study Sheets, Hub AI', () => {
    renderWith({ ...baseUser, accountType: 'student' })
    expect(screen.getAllByText(/^Feed$/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/^Study Sheets$/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/^Hub AI$/i).length).toBeGreaterThan(0)
  })

  it('keeps role label copy intact on the sectioned path (Self-learner never becomes "Member")', () => {
    const { container } = renderWith({ ...baseUser, accountType: 'other' })
    expect(screen.getByText(/Self-learner · Joined/)).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/\bMember\b/)
  })

  it('teachers get the TEACHING-oriented role label', () => {
    renderWith({ ...baseUser, accountType: 'teacher' })
    expect(screen.getByText(/Teacher · Joined/)).toBeInTheDocument()
  })
})
