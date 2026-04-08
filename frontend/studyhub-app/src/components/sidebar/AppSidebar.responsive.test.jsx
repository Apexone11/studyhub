import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import AppSidebar from './AppSidebar'

vi.mock('../lib/session-context', () => ({
  useSession: () => ({
    user: {
      id: 1,
      username: 'beta_student',
      role: 'student',
      createdAt: '2026-03-16T12:00:00.000Z',
      avatarUrl: null,
      enrollments: [],
    },
  }),
}))

describe('AppSidebar responsive mode', () => {
  it('renders drawer trigger and opens/closes dialog in drawer mode', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={['/feed']}>
        <AppSidebar mode="drawer" />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: 'Open navigation' }))
    expect(screen.getByRole('dialog', { name: 'Sidebar navigation' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Feed' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog', { name: 'Sidebar navigation' })).not.toBeInTheDocument()
  })

  it('scrolls to the top when a sidebar link is clicked', async () => {
    const user = userEvent.setup()
    const scrollSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})

    render(
      <MemoryRouter initialEntries={['/feed']}>
        <AppSidebar mode="fixed" />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('link', { name: 'Study Sheets' }))

    expect(scrollSpy).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })

    scrollSpy.mockRestore()
  })
})
