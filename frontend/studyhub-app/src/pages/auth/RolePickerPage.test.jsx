import { cleanup, render, screen, waitFor } from '@testing-library/react'

import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const navigateMock = vi.fn()
const completeAuthenticationMock = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => navigateMock }
})

vi.mock('../../lib/session-context', () => ({
  useSession: () => ({ completeAuthentication: completeAuthenticationMock }),
}))

vi.mock('../../config', () => ({ API: 'http://test.local' }))

import RolePickerPage from './RolePickerPage'

const STORAGE_KEY = 'studyhub.google.pending'
const PENDING = {
  tempToken: 'tok-123',
  email: 'new@example.com',
  name: 'New User',
  avatarUrl: null,
}

function renderPage() {
  return render(
    <MemoryRouter>
      <RolePickerPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  sessionStorage.clear()
  navigateMock.mockReset()
  completeAuthenticationMock.mockReset()
  globalThis.fetch = vi.fn()
})

afterEach(() => {
  cleanup()
  sessionStorage.clear()
})

describe('RolePickerPage', () => {
  it('redirects to /signup when no pending Google payload exists', async () => {
    renderPage()
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/signup', { replace: true })
    })
  })

  it('renders the three role chips with Self-learner (never "Other")', () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(PENDING))
    renderPage()

    expect(screen.getByRole('radio', { name: 'Student' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Teacher / TA' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Self-learner' })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /^Other$/ })).not.toBeInTheDocument()
  })

  it('disables Continue until a role is chosen', async () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(PENDING))
    const user = userEvent.setup()
    renderPage()

    const continueBtn = screen.getByRole('button', { name: /continue/i })
    expect(continueBtn).toBeDisabled()

    await user.click(screen.getByRole('radio', { name: 'Student' }))
    expect(continueBtn).not.toBeDisabled()
  })

  it('posts tempToken + accountType to /google/complete and navigates to nextRoute', async () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(PENDING))
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'signed_in',
        user: { id: 42, username: 'new_user' },
        nextRoute: '/onboarding?track=self-learner',
      }),
    })

    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('radio', { name: 'Self-learner' }))
    await user.click(screen.getByRole('button', { name: /continue/i }))

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://test.local/api/auth/google/complete',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
        }),
      )
    })
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body)
    expect(body).toMatchObject({
      tempToken: 'tok-123',
      accountType: 'other',
      legalAccepted: true,
    })
    expect(completeAuthenticationMock).toHaveBeenCalledWith({ id: 42, username: 'new_user' })
    expect(navigateMock).toHaveBeenCalledWith('/onboarding?track=self-learner', { replace: true })
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('surfaces backend errors and does not navigate', async () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(PENDING))
    globalThis.fetch.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Signup session expired.' }),
    })

    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('radio', { name: 'Student' }))
    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/expired/i)
    expect(completeAuthenticationMock).not.toHaveBeenCalled()
    expect(navigateMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/onboarding'),
      expect.anything(),
    )
  })

  it('cancel clears the pending payload and returns to /signup', async () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(PENDING))
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(navigateMock).toHaveBeenCalledWith('/signup', { replace: true })
  })
})
