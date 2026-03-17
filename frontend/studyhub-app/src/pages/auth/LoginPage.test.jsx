// LoginPage.test validates the legacy email-verification branch from the auth route folder.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { SessionProvider } from '../../lib/session-context'
import { server } from '../../test/server'
import LoginPage from './LoginPage'

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
  it('lets legacy users add and verify an email before sign-in completes', async () => {
    const user = userEvent.setup()
    let sendPayload = null
    let verifyPayload = null

    server.use(
      http.post('http://localhost:4000/api/auth/login', () => (
        HttpResponse.json({
          requiresEmailVerification: true,
          verificationToken: 'login-token',
          emailRequired: true,
          emailHint: '',
          email: null,
          expiresAt: '2026-03-16T12:15:00.000Z',
          resendAvailableAt: '2026-03-16T12:01:00.000Z',
        })
      )),
      http.post('http://localhost:4000/api/auth/login/verification/send', async ({ request }) => {
        sendPayload = await request.json()
        return HttpResponse.json({
          requiresEmailVerification: true,
          verificationToken: 'login-token',
          emailRequired: false,
          emailHint: 'le***@studyhub.test',
          email: 'legacy_user@studyhub.test',
          expiresAt: '2026-03-16T12:15:00.000Z',
          resendAvailableAt: '2026-03-16T12:01:00.000Z',
        })
      }),
      http.post('http://localhost:4000/api/auth/login/verification/verify', async ({ request }) => {
        verifyPayload = await request.json()
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
    )

    renderLoginPage()

    await user.type(screen.getByLabelText('Username'), 'legacy_user')
    await user.type(screen.getByLabelText('Password'), 'Password123')
    await user.click(screen.getByRole('button', { name: 'Sign In' }))

    await screen.findByRole('heading', { name: 'Verify your email' })
    await user.type(screen.getByLabelText('Email Address'), 'legacy_user@studyhub.test')
    await user.click(screen.getByRole('button', { name: 'Send / Resend Code' }))

    expect(sendPayload).toMatchObject({
      verificationToken: 'login-token',
      email: 'legacy_user@studyhub.test',
    })

    await user.type(screen.getByLabelText('Verification Code'), '654321')
    await user.click(screen.getByRole('button', { name: 'Verify Email' }))

    expect(verifyPayload).toMatchObject({
      verificationToken: 'login-token',
      code: '654321',
    })

    await screen.findByText('Feed ready')
  })
})
