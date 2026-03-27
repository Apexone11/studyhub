// RegisterScreen.test covers the current account creation and course setup flow.
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
          <Route path="/dashboard" element={<div>Dashboard ready</div>} />
          <Route path="/admin" element={<div>Admin ready</div>} />
        </Routes>
      </SessionProvider>
    </MemoryRouter>,
  )
}

describe('RegisterScreen', () => {
  it('creates a local account, verifies email, and lets the user skip course setup', async () => {
    const user = userEvent.setup()
    let registerStartPayload = null
    let verifyPayload = null
    let registerCompletePayload = null

    server.use(
      http.get('http://localhost:4000/api/auth/me', () => (
        HttpResponse.json({ error: 'Unauthorized' }, { status: 401 })
      )),
      http.post('http://localhost:4000/api/auth/register/start', async ({ request }) => {
        registerStartPayload = await request.json()
        return HttpResponse.json({
          verificationToken: 'signup-token',
          deliveryHint: 'new_student@studyhub.test',
          resendAvailableAt: '2026-03-16T12:01:00.000Z',
        }, { status: 201 })
      }),
      http.post('http://localhost:4000/api/auth/register/verify', async ({ request }) => {
        verifyPayload = await request.json()
        return HttpResponse.json({
          verified: true,
          verificationToken: 'signup-token',
          nextStep: 'courses',
          expiresAt: '2026-03-16T12:15:00.000Z',
        })
      }),
      http.post('http://localhost:4000/api/auth/register/complete', async ({ request }) => {
        registerCompletePayload = await request.json()
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
      http.get('http://localhost:4000/api/notifications', () => (
        HttpResponse.json({ notifications: [], unreadCount: 0 })
      )),
    )

    renderRegisterScreen()

    await user.type(screen.getByLabelText('Username'), 'new_student')
    await user.type(screen.getByLabelText('Email'), 'new_student@studyhub.test')
    await user.type(screen.getByLabelText('Password'), 'Password123')
    await user.type(screen.getByLabelText('Confirm Password'), 'Password123')
    await user.click(screen.getByRole('checkbox', { name: /I agree to the Terms of Use/i }))
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

    await screen.findByRole('heading', { name: 'Choose your courses' })
    await user.click(screen.getByRole('button', { name: 'Skip For Now' }))

    expect(registerCompletePayload).toMatchObject({
      verificationToken: 'signup-token',
      schoolId: null,
      courseIds: [],
      customCourses: [],
    })

    await screen.findByText('Dashboard ready')
  })

  it('verifies email and saves selected courses before finishing setup', async () => {
    const user = userEvent.setup()
    let registerStartPayload = null
    let verifyPayload = null
    let registerCompletePayload = null

    server.use(
      http.get('http://localhost:4000/api/auth/me', () => (
        HttpResponse.json({ error: 'Unauthorized' }, { status: 401 })
      )),
      http.post('http://localhost:4000/api/auth/register/start', async ({ request }) => {
        registerStartPayload = await request.json()
        return HttpResponse.json({
          verificationToken: 'course-signup-token',
          deliveryHint: 'course_user@studyhub.test',
          resendAvailableAt: '2026-03-16T12:01:00.000Z',
        }, { status: 201 })
      }),
      http.post('http://localhost:4000/api/auth/register/verify', async ({ request }) => {
        verifyPayload = await request.json()
        return HttpResponse.json({
          verified: true,
          verificationToken: 'course-signup-token',
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
      http.get('http://localhost:4000/api/notifications', () => (
        HttpResponse.json({ notifications: [], unreadCount: 0 })
      )),
      http.post('http://localhost:4000/api/auth/register/complete', async ({ request }) => {
        registerCompletePayload = await request.json()
        return HttpResponse.json({
          user: {
            id: 8,
            username: 'course_user',
            role: 'student',
            email: 'course_user@studyhub.test',
            emailVerified: true,
            twoFaEnabled: false,
            avatarUrl: null,
            createdAt: '2026-03-16T12:00:00.000Z',
            enrollments: [
              {
                id: 1,
                courseId: 101,
                course: { id: 101, code: 'CMSC131', name: 'Object-Oriented Programming I' },
              },
            ],
            counts: { courses: 1, sheets: 0, stars: 0 },
            csrfToken: 'csrf-token',
          },
        }, { status: 201 })
      }),
    )

    renderRegisterScreen()

    await user.type(screen.getByLabelText('Username'), 'course_user')
    await user.type(screen.getByLabelText('Email'), 'course_user@studyhub.test')
    await user.type(screen.getByLabelText('Password'), 'Password123')
    await user.type(screen.getByLabelText('Confirm Password'), 'Password123')
    await user.click(screen.getByRole('checkbox', { name: /I agree to the Terms of Use/i }))
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
      verificationToken: 'course-signup-token',
      code: '654321',
    })

    await screen.findByRole('heading', { name: 'Choose your courses' })
    await user.selectOptions(screen.getByLabelText('School'), '1')
    await user.click(screen.getByRole('checkbox', { name: /CMSC131/i }))
    await user.click(screen.getByRole('button', { name: 'Finish Setup' }))

    expect(registerCompletePayload).toMatchObject({
      verificationToken: 'course-signup-token',
      schoolId: 1,
      courseIds: [101],
      customCourses: [],
    })

    await screen.findByText('Dashboard ready')
  })
})
