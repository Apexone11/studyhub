import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import userEvent from '@testing-library/user-event'
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

  it('loads email suppressions and shows audit timeline details', async () => {
    const userAction = userEvent.setup()

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
      http.get('http://localhost:4000/api/admin/email-suppressions', () => (
        HttpResponse.json({
          suppressions: [
            {
              id: 7,
              email: 'suppressed_user@studyhub.test',
              active: true,
              reason: 'email_bounced',
              provider: 'resend',
              sourceEventType: 'email.bounced',
              sourceMessageId: 'email_123',
              updatedAt: '2026-03-17T20:05:00.000Z',
            },
          ],
          total: 1,
          page: 1,
        })
      )),
      http.get('http://localhost:4000/api/admin/email-suppressions/:id/audit', () => (
        HttpResponse.json({
          suppression: {
            id: 7,
            email: 'suppressed_user@studyhub.test',
            active: true,
          },
          entries: [
            {
              id: 31,
              action: 'manual-unsuppress',
              reason: 'Mailbox recovered and confirmed by support.',
              createdAt: '2026-03-17T21:00:00.000Z',
              performedBy: {
                id: 42,
                username: 'studyhub_owner',
              },
            },
          ],
          total: 1,
          page: 1,
        })
      )),
    )

    renderAdminPage()

    await screen.findByRole('heading', { name: 'Admin Overview' })
    await userAction.click(screen.getByRole('button', { name: 'Email Suppressions' }))

    await screen.findByText('suppressed_user@studyhub.test')
    expect(screen.getByText('Email bounced')).toBeInTheDocument()

    await userAction.click(screen.getByRole('button', { name: 'View audit for suppressed_user@studyhub.test' }))

    await screen.findByText('Audit timeline')
    expect(screen.getByText('Mailbox recovered and confirmed by support.')).toBeInTheDocument()
    expect(screen.getByText('Actor: studyhub_owner')).toBeInTheDocument()
  })

  it('validates unsuppress reason and allows successful unsuppress actions', async () => {
    const userAction = userEvent.setup()
    let unsuppressCalls = 0
    let suppressionActive = true

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
      http.get('http://localhost:4000/api/admin/email-suppressions', ({ request }) => {
        const url = new URL(request.url)
        const status = url.searchParams.get('status') || 'active'
        const currentSuppression = {
          id: 7,
          email: 'suppressed_user@studyhub.test',
          active: suppressionActive,
          reason: 'email_bounced',
          provider: 'resend',
          sourceEventType: 'email.bounced',
          sourceMessageId: 'email_123',
          updatedAt: '2026-03-17T20:05:00.000Z',
        }

        let suppressions = []
        if (status === 'active') suppressions = suppressionActive ? [currentSuppression] : []
        if (status === 'inactive') suppressions = suppressionActive ? [] : [currentSuppression]
        if (status === 'all') suppressions = [currentSuppression]

        return HttpResponse.json({
          suppressions,
          total: suppressions.length,
          page: 1,
        })
      }),
      http.patch('http://localhost:4000/api/admin/email-suppressions/:id/unsuppress', async ({ request }) => {
        unsuppressCalls += 1
        const body = await request.json()
        if (!body?.reason || body.reason.trim().length < 8) {
          return HttpResponse.json(
            { error: 'Provide an unsuppress reason with at least 8 characters.' },
            { status: 400 },
          )
        }

        suppressionActive = false
        return HttpResponse.json({
          message: 'Recipient unsuppressed successfully.',
          suppression: {
            id: 7,
            active: false,
          },
        })
      }),
    )

    renderAdminPage()

    await screen.findByRole('heading', { name: 'Admin Overview' })
    await userAction.click(screen.getByRole('button', { name: 'Email Suppressions' }))
    await screen.findByText('suppressed_user@studyhub.test')

    fireEvent.change(
      screen.getByLabelText('Unsuppress reason for suppressed_user@studyhub.test'),
      { target: { value: 'short' } },
    )
    await userAction.click(screen.getByRole('button', { name: 'Unsuppress suppressed_user@studyhub.test' }))

    await screen.findByText('Provide an unsuppress reason with at least 8 characters.')
    expect(unsuppressCalls).toBe(0)

    fireEvent.change(
      screen.getByLabelText('Unsuppress reason for suppressed_user@studyhub.test'),
      { target: { value: 'Mailbox recovered and confirmed by support.' } },
    )
    await userAction.click(screen.getByRole('button', { name: 'Unsuppress suppressed_user@studyhub.test' }))

    await waitFor(() => {
      expect(unsuppressCalls).toBe(1)
    })

    await screen.findByText('Recipient unsuppressed successfully.')
    await screen.findByText('No suppression records for this filter.')
  })
})
