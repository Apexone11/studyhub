import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { server } from '../../test/server'
import ResetPasswordPage from './ResetPasswordPage'

vi.mock('../../components/navbar/Navbar', () => ({
  default: () => <div data-testid="mock-navbar" />,
}))

function renderResetPasswordPage() {
  window.history.pushState({}, '', '/reset-password?token=reset-token-123')

  return render(
    <MemoryRouter initialEntries={['/reset-password?token=reset-token-123']}>
      <Routes>
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/login" element={<div>Login ready</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ResetPasswordPage', () => {
  it('submits the reset request with credentials included', async () => {
    const user = userEvent.setup()
    let requestCredentials = ''
    let requestPayload = null

    server.use(
      http.post('http://localhost:4000/api/auth/reset-password', async ({ request }) => {
        requestCredentials = request.credentials
        requestPayload = await request.json()

        return HttpResponse.json({ ok: true })
      }),
    )

    renderResetPasswordPage()

    await user.type(screen.getByLabelText('New Password'), 'NewPassword1')
    await user.type(screen.getByLabelText('Confirm Password'), 'NewPassword1')
    await user.click(screen.getByRole('button', { name: 'Set New Password' }))

    await screen.findByText('Password updated! Redirecting to login…')

    expect(requestCredentials).toBe('include')
    expect(requestPayload).toMatchObject({
      token: 'reset-token-123',
      newPassword: 'NewPassword1',
    })
  })
})