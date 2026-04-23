// LoginPage.test covers the current direct sign-in flow for local accounts.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { SessionProvider } from '../../lib/session-context'
import { server } from '../../test/server'
import LoginPage from './LoginPage'

vi.mock('@react-oauth/google', () => ({
  GoogleLogin: () => null,
}))

function renderLoginPage() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <SessionProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/feed" element={<div>Feed ready</div>} />
          <Route path="/admin" element={<div>Admin ready</div>} />
        </Routes>
      </SessionProvider>
    </MemoryRouter>,
  )
}

describe('LoginPage', () => {
  it('signs students in immediately and routes them to the feed', async () => {
    const user = userEvent.setup()
    let loginPayload = null

    server.use(
      http.get('http://localhost:4000/api/auth/me', () =>
        HttpResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      ),
      http.post('http://localhost:4000/api/auth/login', async ({ request }) => {
        loginPayload = await request.json()
        return HttpResponse.json({
          user: {
            id: 9,
            username: 'legacy_user',
            role: 'student',
            email: 'legacy_user@studyhub.test',
            emailVerified: true,
            twoFaEnabled: false,
            avatarUrl: null,
            createdAt: '2026-03-16T12:00:00.000Z',
            enrollments: [],
            counts: { courses: 0, sheets: 0, stars: 0 },
            csrfToken: 'csrf-token',
          },
        })
      }),
      http.get('http://localhost:4000/api/notifications', () =>
        HttpResponse.json({ notifications: [], unreadCount: 0 }),
      ),
    )

    renderLoginPage()

    await user.type(screen.getByLabelText('Username'), 'legacy_user')
    await user.type(screen.getByLabelText('Password'), 'Password123')
    await user.click(screen.getByRole('button', { name: 'Sign In' }))

    expect(loginPayload).toMatchObject({
      username: 'legacy_user',
      password: 'Password123',
    })

    await screen.findByText('Feed ready')
  })

  it('shows recovery guidance when sign-in fails with forgot-password support', async () => {
    const user = userEvent.setup()

    server.use(
      http.get('http://localhost:4000/api/auth/me', () =>
        HttpResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      ),
      http.post('http://localhost:4000/api/auth/login', () =>
        HttpResponse.json(
          {
            error: 'Invalid username or password.',
            showForgot: true,
          },
          { status: 401 },
        ),
      ),
    )

    renderLoginPage()

    await user.type(screen.getByLabelText('Username'), 'cooldown_user')
    await user.type(screen.getByLabelText('Password'), 'Password123')
    await user.click(screen.getByRole('button', { name: 'Sign In' }))

    await screen.findByText('Invalid username or password.')
    expect(screen.getByText('Use the link above to reset your password.')).toBeInTheDocument()
  })
})
