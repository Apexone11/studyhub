import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { SessionProvider, useSession } from './session-context'
import { server } from '../test/server'
import { AUTH_SESSION_EXPIRED_EVENT } from './http'

afterEach(() => {
  cleanup()
})

function seedUser(overrides = {}) {
  localStorage.setItem(
    'user',
    JSON.stringify({
      id: 7,
      username: 'beta_student1',
      role: 'student',
      email: 'beta_student1@studyhub.test',
      csrfToken: 'csrf-token',
      ...overrides,
    }),
  )
}

function SessionProbe() {
  const { status, error, user } = useSession()

  return (
    <div>
      <div data-testid="status">{status}</div>
      <div data-testid="error">{error}</div>
      <div data-testid="username">{user?.username || ''}</div>
    </div>
  )
}

describe('SessionProvider auth refresh policy', () => {
  it('clears the cached session when auth refresh returns 401', async () => {
    seedUser()

    server.use(
      http.get('http://localhost:4000/api/auth/me', () =>
        HttpResponse.json({ error: 'Login required.', code: 'AUTH_REQUIRED' }, { status: 401 }),
      ),
    )

    render(
      <MemoryRouter>
        <SessionProvider>
          <SessionProbe />
        </SessionProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated')
    })

    expect(screen.getByTestId('error')).toHaveTextContent('')
    expect(localStorage.getItem('user')).toBeNull()
  })

  it('keeps the cached session when auth refresh returns 403', async () => {
    seedUser()

    server.use(
      http.get('http://localhost:4000/api/auth/me', () =>
        HttpResponse.json(
          { error: 'You do not have permission to access this route.', code: 'FORBIDDEN' },
          { status: 403 },
        ),
      ),
    )

    render(
      <MemoryRouter>
        <SessionProvider>
          <SessionProbe />
        </SessionProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('authenticated')
    })

    expect(screen.getByTestId('username')).toHaveTextContent('beta_student1')
    expect(screen.getByTestId('error')).toHaveTextContent(
      'You do not have permission to access this route.',
    )
    expect(localStorage.getItem('user')).toContain('beta_student1')
  })
})

describe('Session-expired modal', () => {
  // The in-app session-expired modal was replaced by a redirect to
  // /login?expired=1 (see session-context.jsx handleAuthExpired). Keeping the
  // test skipped documents the prior behavior and the deliberate change.
  it.skip('shows modal when AUTH_SESSION_EXPIRED_EVENT fires', async () => {
    seedUser()

    server.use(
      http.get('http://localhost:4000/api/auth/me', () =>
        HttpResponse.json({
          id: 7,
          username: 'beta_student1',
          role: 'student',
          email: 'beta_student1@studyhub.test',
        }),
      ),
    )

    render(
      <MemoryRouter>
        <SessionProvider>
          <SessionProbe />
        </SessionProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('authenticated')
    })

    // Fire the session-expired event
    window.dispatchEvent(new Event(AUTH_SESSION_EXPIRED_EVENT))

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    expect(screen.getByText('Your session has expired')).toBeInTheDocument()
    expect(screen.getByText('Sign in again')).toBeInTheDocument()
    expect(screen.getByText('Go to Home')).toBeInTheDocument()
  })
})
