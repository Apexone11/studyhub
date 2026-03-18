import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { SessionProvider, useSession } from './session-context'
import { server } from '../test/server'

afterEach(() => {
  cleanup()
})

function seedUser(overrides = {}) {
  localStorage.setItem('user', JSON.stringify({
    id: 7,
    username: 'beta_student1',
    role: 'student',
    email: 'beta_student1@studyhub.test',
    csrfToken: 'csrf-token',
    ...overrides,
  }))
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
      http.get('http://localhost:4000/api/auth/me', () => (
        HttpResponse.json({ error: 'Login required.', code: 'AUTH_REQUIRED' }, { status: 401 })
      )),
    )

    render(
      <SessionProvider>
        <SessionProbe />
      </SessionProvider>,
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
      http.get('http://localhost:4000/api/auth/me', () => (
        HttpResponse.json(
          { error: 'You do not have permission to access this route.', code: 'FORBIDDEN' },
          { status: 403 },
        )
      )),
    )

    render(
      <SessionProvider>
        <SessionProbe />
      </SessionProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('authenticated')
    })

    expect(screen.getByTestId('username')).toHaveTextContent('beta_student1')
    expect(screen.getByTestId('error')).toHaveTextContent('You do not have permission to access this route.')
    expect(localStorage.getItem('user')).toContain('beta_student1')
  })
})
