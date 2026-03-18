// RegisterScreen.test keeps the staged email-verification registration flow covered next to the route.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { SessionProvider } from '../../lib/session-context'
import { server } from '../../test/server'
import RegisterScreen from './RegisterScreen'

vi.mock('../../lib/telemetry', () => ({
  trackSignupConversion: vi.fn(),
}))

function renderRegisterScreen() {
  return render(
    <MemoryRouter initialEntries={['/register']}>
      <SessionProvider>
        <Routes>
          <Route path="/register" element={<RegisterScreen />} />
          <Route path="/feed" element={<div>Feed ready</div>} />
          <Route path="/admin" element={<div>Admin ready</div>} />
        </Routes>
      </SessionProvider>
    </MemoryRouter>,
  )
}

describe('RegisterScreen', () => {
  it('verifies email before completing account creation', async () => {
    const user = userEvent.setup()
    let startPayload = null
    let completePayload = null

    server.use(
      http.get('http://localhost:4000/api/auth/me', () => (
        HttpResponse.json({ error: 'Unauthorized' }, { status: 401 })
      )),
      http.post('http://localhost:4000/api/auth/register/start', async ({ request }) => {
        startPayload = await request.json()
        return HttpResponse.json({
          verificationToken: 'register-token',
          deliveryHint: 'ne***@studyhub.test',
          expiresAt: '2026-03-16T12:15:00.000Z',
          resendAvailableAt: '2026-03-16T12:01:00.000Z',
        }, { status: 201 })
      }),
      http.post('http://localhost:4000/api/auth/register/verify', async ({ request }) => {
        expect(await request.json()).toMatchObject({
          verificationToken: 'register-token',
          code: '123456',
        })

        return HttpResponse.json({
          verified: true,
          verificationToken: 'register-token',
          nextStep: 'courses',
          expiresAt: '2026-03-16T12:15:00.000Z',
        })
      }),
      http.get('http://localhost:4000/api/courses/schools', () => (
        HttpResponse.json([
          {
            id: 1,
            name: 'University of Maryland',
            short: 'UMD',
            courses: [
              { id: 101, code: 'CMSC131', name: 'Object-Oriented Programming I' },
            ],
          },
        ])
      )),
      http.post('http://localhost:4000/api/auth/register/complete', async ({ request }) => {
        completePayload = await request.json()
        return HttpResponse.json({
          user: {
            id: 7,
            username: 'new_student',
            role: 'student',
            email: 'new_student@studyhub.test',
            emailVerified: true,
            twoFaEnabled: false,
            avatarUrl: null,
            createdAt: '2026-03-16T12:00:00.000Z',
            enrollments: [],
            counts: { courses: 0, sheets: 0, stars: 0 },
            csrfToken: 'csrf-token',
          },
        }, { status: 201 })
      }),
      http.get('http://localhost:4000/api/feed', () => HttpResponse.json({ items: [], total: 0, partial: false, degradedSections: [] })),
      http.get('http://localhost:4000/api/sheets/leaderboard', () => HttpResponse.json([])),
      http.get('http://localhost:4000/api/notifications', () => HttpResponse.json({ notifications: [], unreadCount: 0 })),
    )

    renderRegisterScreen()

    await user.type(screen.getByLabelText('Username'), 'new_student')
    await user.type(screen.getByLabelText('Email'), 'new_student@studyhub.test')
    await user.type(screen.getByLabelText('Password'), 'Password123')
    await user.type(screen.getByLabelText('Confirm Password'), 'Password123')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Continue To Email Verification' }))

    expect(startPayload).toMatchObject({
      username: 'new_student',
      email: 'new_student@studyhub.test',
      password: 'Password123',
      confirmPassword: 'Password123',
      termsAccepted: true,
    })

    await screen.findByRole('heading', { name: 'Verify your email' })
    await user.type(screen.getByLabelText('Verification Code'), '123456')
    await user.click(screen.getByRole('button', { name: 'Verify Code' }))

    await screen.findByRole('heading', { name: 'Choose your courses' })
    await user.click(screen.getByRole('button', { name: 'Skip For Now' }))

    expect(completePayload).toMatchObject({
      verificationToken: 'register-token',
      schoolId: null,
      courseIds: [],
      customCourses: [],
    })

    await screen.findByText('Feed ready')
  })

  it('disables verification resend while cooldown is active', async () => {
    const user = userEvent.setup()

    server.use(
      http.get('http://localhost:4000/api/auth/me', () => (
        HttpResponse.json({ error: 'Unauthorized' }, { status: 401 })
      )),
      http.post('http://localhost:4000/api/auth/register/start', () => (
        HttpResponse.json({
          verificationToken: 'cooldown-register-token',
          deliveryHint: 'co***@studyhub.test',
          expiresAt: '2099-03-16T12:15:00.000Z',
          resendAvailableAt: '2099-03-16T12:01:00.000Z',
        }, { status: 201 })
      )),
    )

    renderRegisterScreen()

    await user.type(screen.getByLabelText('Username'), 'cooldown_user')
    await user.type(screen.getByLabelText('Email'), 'cooldown_user@studyhub.test')
    await user.type(screen.getByLabelText('Password'), 'Password123')
    await user.type(screen.getByLabelText('Confirm Password'), 'Password123')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Continue To Email Verification' }))

    await screen.findByRole('heading', { name: 'Verify your email' })

    const resendButton = screen.getByRole('button', { name: /Resend in/i })
    expect(resendButton).toBeDisabled()
    expect(screen.getByText(/You can request another verification code in/i)).toBeInTheDocument()
  })
})
