import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const navigateMock = vi.fn()
const completeAuthenticationMock = vi.fn()
const apiGoogleAuthMock = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => navigateMock }
})

vi.mock('../../lib/session-context', () => ({
  useSession: () => ({ completeAuthentication: completeAuthenticationMock }),
}))

vi.mock('../../lib/authNavigation', () => ({
  getAuthenticatedHomePath: () => '/',
}))

vi.mock('../../lib/telemetry', () => ({
  trackSignupConversion: vi.fn(),
  trackEvent: vi.fn(),
}))

vi.mock('./registerConstants', () => ({
  apiStartRegistration: vi.fn(),
  apiVerifyCode: vi.fn(),
  apiResendCode: vi.fn(),
  apiGoogleAuth: (...args) => apiGoogleAuthMock(...args),
  apiCompleteRegistration: vi.fn(),
}))

import useRegisterFlow from './useRegisterFlow'

beforeEach(() => {
  navigateMock.mockReset()
  completeAuthenticationMock.mockReset()
  apiGoogleAuthMock.mockReset()
  sessionStorage.clear()
})

afterEach(() => {
  sessionStorage.clear()
})

describe('useRegisterFlow — Google needs_role branching', () => {
  it('stashes tempToken in sessionStorage and routes to /signup/role', async () => {
    apiGoogleAuthMock.mockResolvedValue({
      ok: true,
      data: {
        status: 'needs_role',
        tempToken: 'tok-abc',
        email: 'x@y.test',
        name: 'X Y',
        avatarUrl: 'https://example.com/a.png',
      },
    })

    const { result } = renderHook(() => useRegisterFlow({ referralCode: 'REF42' }))

    await act(async () => {
      await result.current.handleGoogleSuccess({ credential: 'cred-xyz' })
    })

    const stored = JSON.parse(sessionStorage.getItem('studyhub.google.pending'))
    expect(stored).toMatchObject({
      tempToken: 'tok-abc',
      email: 'x@y.test',
      name: 'X Y',
      avatarUrl: 'https://example.com/a.png',
      referralCode: 'REF42',
    })
    expect(navigateMock).toHaveBeenCalledWith('/signup/role', { replace: true })
    expect(completeAuthenticationMock).not.toHaveBeenCalled()
  })

  it('signs in immediately for existing-user Google response (no needs_role)', async () => {
    apiGoogleAuthMock.mockResolvedValue({
      ok: true,
      data: { user: { id: 7, username: 'alice' } },
    })

    const { result } = renderHook(() => useRegisterFlow({}))

    await act(async () => {
      await result.current.handleGoogleSuccess({ credential: 'cred' })
    })

    expect(completeAuthenticationMock).toHaveBeenCalledWith({ id: 7, username: 'alice' })
    expect(navigateMock).toHaveBeenCalledWith('/', { replace: true })
    expect(sessionStorage.getItem('studyhub.google.pending')).toBeNull()
  })

  it('surfaces apiGoogleAuth errors without navigating', async () => {
    apiGoogleAuthMock.mockResolvedValue({ ok: false, error: 'Google sign-up failed.' })

    const { result } = renderHook(() => useRegisterFlow({}))

    await act(async () => {
      await result.current.handleGoogleSuccess({ credential: 'cred' })
    })

    expect(result.current.error).toBe('Google sign-up failed.')
    expect(navigateMock).not.toHaveBeenCalled()
    expect(sessionStorage.getItem('studyhub.google.pending')).toBeNull()
  })

  it('does nothing when the credential is missing', async () => {
    const { result } = renderHook(() => useRegisterFlow({}))

    await act(async () => {
      await result.current.handleGoogleSuccess({})
    })

    expect(result.current.error).toMatch(/did not return a valid credential/i)
    expect(apiGoogleAuthMock).not.toHaveBeenCalled()
  })
})
