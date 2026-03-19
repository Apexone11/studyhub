// RegisterScreen.test covers the current account creation and course setup flow.
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

vi.mock('@react-oauth/google', () => ({
  GoogleLogin: () => null,
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
  it('creates a local account and lets the user skip course setup', async () => {
    const user = userEvent.setup()
    let registerPayload = null

    server.use(
      http.get('http://localhost:4000/api/auth/me', () => (
        HttpResponse.json({ error: 'Unauthorized' }, { status: 401 })
      )),
      http.post('http://localhost:4000/api/auth/register', async ({ request }) => {
        registerPayload = await request.json()
        return HttpResponse.json({
          user: {
            id: 7,
            username: 'new_student',
            role: 'student',
            email: null,
            emailVerified: false,
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
    await user.type(screen.getByLabelText('Password'), 'Password123')
    await user.type(screen.getByLabelText('Confirm Password'), 'Password123')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Create Account' }))

    expect(registerPayload).toMatchObject({
      username: 'new_student',
      password: 'Password123',
      confirmPassword: 'Password123',
      termsAccepted: true,
    })

    await screen.findByRole('heading', { name: 'Choose your courses' })
    await user.click(screen.getByRole('button', { name: 'Skip For Now' }))

    await screen.findByText('Feed ready')
  })

  it('saves selected courses before finishing setup', async () => {
    const user = userEvent.setup()
    let courseSettingsPayload = null

    server.use(
      http.get('http://localhost:4000/api/auth/me', () => (
        HttpResponse.json({ error: 'Unauthorized' }, { status: 401 })
      )),
      http.post('http://localhost:4000/api/auth/register', () => (
        HttpResponse.json({
          user: {
            id: 8,
            username: 'course_user',
            role: 'student',
            email: null,
            emailVerified: false,
            twoFaEnabled: false,
            avatarUrl: null,
            createdAt: '2026-03-16T12:00:00.000Z',
            enrollments: [],
            counts: { courses: 0, sheets: 0, stars: 0 },
            csrfToken: 'csrf-token',
          },
        }, { status: 201 })
      )),
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
      http.patch('http://localhost:4000/api/settings/courses', async ({ request }) => {
        courseSettingsPayload = await request.json()
        return HttpResponse.json({ ok: true })
      }),
    )

    renderRegisterScreen()

    await user.type(screen.getByLabelText('Username'), 'course_user')
    await user.type(screen.getByLabelText('Password'), 'Password123')
    await user.type(screen.getByLabelText('Confirm Password'), 'Password123')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Create Account' }))

    await screen.findByRole('heading', { name: 'Choose your courses' })
    await user.selectOptions(screen.getByLabelText('School'), '1')
    await user.click(screen.getByRole('checkbox', { name: /CMSC131/i }))
    await user.click(screen.getByRole('button', { name: 'Finish Setup' }))

    expect(courseSettingsPayload).toMatchObject({
      schoolId: 1,
      courseIds: [101],
      customCourses: [],
    })

    const feedReadyScreens = await screen.findAllByText('Feed ready')
    expect(feedReadyScreens.length).toBeGreaterThan(0)
  })
})
