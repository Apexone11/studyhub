// RegisterScreen.test covers the current two-step registration flow: Account → Verify → auto-complete.
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionProvider } from '../../lib/session-context'
import { server } from '../../test/server'
import RegisterScreen from './RegisterScreen'

vi.mock('../../lib/telemetry', () => ({
  trackSignupConversion: vi.fn(),
  trackEvent: vi.fn(),
}))

vi.mock('@react-oauth/google', () => ({
  GoogleLogin: () => null,
}))

// The real LegalAcceptanceModal fetches three legal documents from the API
// and gates its Accept button on all three tabs being viewed. The test is
// exercising the registration flow, not the legal copy, so we stand in a
// lightweight modal that exposes a single Accept button for the user-event
// click. This keeps the test focused on register/verify/complete.
vi.mock('./LegalAcceptanceModal', () => ({
  default: ({ open, onAccept }) =>
    open ? (
      <div role="dialog" aria-label="legal-stub">
        <button type="button" onClick={onAccept}>
          Accept All
        </button>
      </div>
    ) : null,
}))

afterEach(() => {
  cleanup()
})

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
  it('creates a local account, verifies email, and auto-completes registration', async () => {
    const user = userEvent.setup()
    let registerStartPayload = null
    let verifyPayload = null
    let registerCompletePayload = null

    server.use(
      http.get('http://localhost:4000/api/auth/me', () =>
        HttpResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      ),
      http.post('http://localhost:4000/api/auth/register/start', async ({ request }) => {
        registerStartPayload = await request.json()
        return HttpResponse.json(
          {
            verificationToken: 'signup-token',
            deliveryHint: 'new_student@studyhub.test',
            resendAvailableAt: '2026-03-16T12:01:00.000Z',
          },
          { status: 201 },
        )
      }),
      http.post('http://localhost:4000/api/auth/register/verify', async ({ request }) => {
        verifyPayload = await request.json()
        return HttpResponse.json({
          verified: true,
          verificationToken: 'signup-token',
          expiresAt: '2026-03-16T12:15:00.000Z',
        })
      }),
      http.post('http://localhost:4000/api/auth/register/complete', async ({ request }) => {
        registerCompletePayload = await request.json()
        return HttpResponse.json(
          {
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
          },
          { status: 201 },
        )
      }),
      http.get('http://localhost:4000/api/notifications', () =>
        HttpResponse.json({ notifications: [], unreadCount: 0 }),
      ),
    )

    renderRegisterScreen()

    await user.type(screen.getByLabelText('Username'), 'new_student')
    await user.type(screen.getByLabelText('Email'), 'new_student@studyhub.test')
    await user.type(screen.getByLabelText('Password'), 'Password123')
    await user.type(screen.getByLabelText('Confirm Password'), 'Password123')
    await user.click(screen.getByRole('button', { name: /Click to review and accept terms/i }))
    await user.click(await screen.findByRole('button', { name: 'Accept All' }))
    await user.click(screen.getByRole('button', { name: 'Create Account' }))

    expect(registerStartPayload).toMatchObject({
      username: 'new_student',
      email: 'new_student@studyhub.test',
      password: 'Password123',
    })

    await screen.findByRole('heading', { name: 'Check your email' })
    await user.type(screen.getByLabelText('Verification code'), '123456')
    await user.click(screen.getByRole('button', { name: 'Verify Email' }))

    expect(verifyPayload).toMatchObject({
      verificationToken: 'signup-token',
      code: '123456',
    })

    // After verify, registration auto-completes and navigates to /feed
    expect(registerCompletePayload).toMatchObject({
      verificationToken: 'signup-token',
    })

    await screen.findByText('Feed ready')
  })

  it('completes the full flow with a different user and navigates to feed', async () => {
    const user = userEvent.setup()
    let registerStartPayload = null
    let verifyPayload = null
    let registerCompletePayload = null

    server.use(
      http.get('http://localhost:4000/api/auth/me', () =>
        HttpResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      ),
      http.post('http://localhost:4000/api/auth/register/start', async ({ request }) => {
        registerStartPayload = await request.json()
        return HttpResponse.json(
          {
            verificationToken: 'second-signup-token',
            deliveryHint: 'course_user@studyhub.test',
            resendAvailableAt: '2026-03-16T12:01:00.000Z',
          },
          { status: 201 },
        )
      }),
      http.post('http://localhost:4000/api/auth/register/verify', async ({ request }) => {
        verifyPayload = await request.json()
        return HttpResponse.json({
          verified: true,
          verificationToken: 'second-signup-token',
          expiresAt: '2026-03-16T12:15:00.000Z',
        })
      }),
      http.post('http://localhost:4000/api/auth/register/complete', async ({ request }) => {
        registerCompletePayload = await request.json()
        return HttpResponse.json(
          {
            user: {
              id: 8,
              username: 'course_user',
              role: 'student',
              email: 'course_user@studyhub.test',
              emailVerified: true,
              twoFaEnabled: false,
              avatarUrl: null,
              createdAt: '2026-03-16T12:00:00.000Z',
              enrollments: [],
              counts: { courses: 0, sheets: 0, stars: 0 },
              csrfToken: 'csrf-token',
            },
          },
          { status: 201 },
        )
      }),
      http.get('http://localhost:4000/api/notifications', () =>
        HttpResponse.json({ notifications: [], unreadCount: 0 }),
      ),
    )

    renderRegisterScreen()

    await user.type(screen.getByLabelText('Username'), 'course_user')
    await user.type(screen.getByLabelText('Email'), 'course_user@studyhub.test')
    await user.type(screen.getByLabelText('Password'), 'Password123')
    await user.type(screen.getByLabelText('Confirm Password'), 'Password123')
    await user.click(screen.getByRole('button', { name: /Click to review and accept terms/i }))
    await user.click(await screen.findByRole('button', { name: 'Accept All' }))
    await user.click(screen.getByRole('button', { name: 'Create Account' }))

    expect(registerStartPayload).toMatchObject({
      username: 'course_user',
      email: 'course_user@studyhub.test',
      password: 'Password123',
    })

    await screen.findByRole('heading', { name: 'Check your email' })
    await user.type(screen.getByLabelText('Verification code'), '654321')
    await user.click(screen.getByRole('button', { name: 'Verify Email' }))

    expect(verifyPayload).toMatchObject({
      verificationToken: 'second-signup-token',
      code: '654321',
    })

    expect(registerCompletePayload).toMatchObject({
      verificationToken: 'second-signup-token',
    })

    await screen.findByText('Feed ready')
  })
})
