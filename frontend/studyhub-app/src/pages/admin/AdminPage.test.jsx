import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { SessionProvider } from '../../lib/session-context'
import { server } from '../../test/server'
import AdminPage from './AdminPage'

vi.mock('../../components/Navbar', () => ({
  default: ({ actions }) => <div data-testid="navbar">{actions}</div>,
}))

vi.mock('../../components/AppSidebar', () => ({
  default: () => <aside data-testid="sidebar">Sidebar</aside>,
}))

function sessionUser(overrides = {}) {
  return {
    id: 7,
    username: 'beta_student1',
    role: 'student',
    email: 'beta_student1@studyhub.test',
    emailVerified: true,
    twoFaEnabled: false,
    avatarUrl: null,
    createdAt: '2026-03-16T12:00:00.000Z',
    enrollments: [],
    counts: { courses: 0, sheets: 0, stars: 0 },
    csrfToken: 'csrf-token',
    ...overrides,
  }
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

function renderAdminPage() {
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <SessionProvider>
        <Routes>
          <Route path="/admin" element={<><LocationProbe /><AdminPage /></>} />
          <Route path="/feed" element={<div>Feed ready</div>} />
          <Route path="/login" element={<div>Login ready</div>} />
        </Routes>
      </SessionProvider>
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
})

describe('AdminPage', () => {
  it('keeps signed-in students on /admin and shows the warning card', async () => {
    server.use(
      http.get('http://localhost:4000/api/auth/me', () => (
        HttpResponse.json(sessionUser())
      )),
    )

    renderAdminPage()

    await screen.findByRole('heading', { name: 'Admin access required' })

    expect(screen.getByTestId('location')).toHaveTextContent('/admin')
    expect(screen.getByRole('link', { name: 'Back to feed' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Overview' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Admin Overview' })).not.toBeInTheDocument()
    expect(screen.queryByText('Feed ready')).not.toBeInTheDocument()
  })

  it('renders the admin overview for admin users', async () => {
    server.use(
      http.get('http://localhost:4000/api/auth/me', () => (
        HttpResponse.json(sessionUser({
          username: 'studyhub_owner',
          role: 'admin',
          email: 'studyhub_owner@studyhub.test',
          twoFaEnabled: true,
        }))
      )),
      http.get('http://localhost:4000/api/admin/stats', () => (
        HttpResponse.json({
          totalUsers: 36,
          totalSheets: 19,
          totalComments: 14,
          flaggedRequests: 4,
          totalStars: 78,
          totalNotes: 0,
          totalFollows: 28,
          totalReactions: 4,
        })
      )),
    )

    renderAdminPage()

    await screen.findByRole('heading', { name: 'Admin Overview' })

    expect(screen.getByTestId('location')).toHaveTextContent('/admin')
    expect(screen.getByRole('button', { name: 'Overview' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Admin access required' })).not.toBeInTheDocument()
  })

  it('surfaces admin 403 errors without clearing the session or redirecting', async () => {
    server.use(
      http.get('http://localhost:4000/api/auth/me', () => (
        HttpResponse.json(sessionUser({
          username: 'studyhub_owner',
          role: 'admin',
          email: 'studyhub_owner@studyhub.test',
          twoFaEnabled: true,
        }))
      )),
      http.get('http://localhost:4000/api/admin/stats', () => (
        HttpResponse.json(
          { error: 'Admin access required.', code: 'FORBIDDEN' },
          { status: 403 },
        )
      )),
    )

    renderAdminPage()

    await screen.findByText('Admin access required.')

    expect(screen.getByTestId('location')).toHaveTextContent('/admin')
    expect(screen.getByRole('button', { name: 'Overview' })).toBeInTheDocument()
    await waitFor(() => {
      expect(localStorage.getItem('user')).toContain('studyhub_owner')
    })
    expect(screen.queryByText('Login ready')).not.toBeInTheDocument()
  })
})
