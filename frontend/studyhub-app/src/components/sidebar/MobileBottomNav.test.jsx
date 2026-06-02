/**
 * MobileBottomNav smoke test
 *
 * Confirms the iOS/Android-style bottom nav:
 *   1. renders on phone viewports (≤767px) for authenticated users
 *   2. is absent on desktop viewports
 *   3. is absent on the /ai route (full-screen chat)
 *   4. is absent for unauthenticated visitors
 *
 * Viewport is forced via `window.innerWidth` + a `resize` event, matching
 * the pattern the founder spec called out.
 */
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/prefetch', () => ({
  prefetchForRoute: vi.fn(),
}))

// Default session — overridden per-test where needed.
const mockUseSession = vi.fn(() => ({
  user: {
    id: 1,
    username: 'beta_student',
    role: 'student',
    accountType: 'student',
  },
}))

vi.mock('../../lib/session-context', () => ({
  useSession: () => mockUseSession(),
}))

// The unread badge is now sourced from the shared UnreadContext rather than a
// local fetch. Mock the hook so the nav renders with a deterministic count and
// the component does no network at all.
vi.mock('../../lib/unreadContext.js', () => ({
  useUnread: () => ({ total: 0, refresh: vi.fn() }),
}))

afterEach(() => {
  mockUseSession.mockReset()
  mockUseSession.mockImplementation(() => ({
    user: {
      id: 1,
      username: 'beta_student',
      role: 'student',
      accountType: 'student',
    },
  }))
})

function setViewport(width) {
  globalThis.innerWidth = width
  act(() => {
    globalThis.dispatchEvent(new Event('resize'))
  })
}

import MobileBottomNav from './MobileBottomNav'

describe('MobileBottomNav', () => {
  it('renders the 5 primary destinations on a phone viewport', () => {
    setViewport(360)
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <MobileBottomNav />
      </MemoryRouter>,
    )

    const nav = screen.getByTestId('mobile-bottom-nav')
    expect(nav).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Feed' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sheets' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Notes' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Messages' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'AI' })).toBeInTheDocument()
  })

  it('does NOT render on a desktop viewport', () => {
    setViewport(1440)
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <MobileBottomNav />
      </MemoryRouter>,
    )
    expect(screen.queryByTestId('mobile-bottom-nav')).not.toBeInTheDocument()
  })

  it('does NOT render on /ai (full-screen chat owns the viewport)', () => {
    setViewport(360)
    render(
      <MemoryRouter initialEntries={['/ai']}>
        <MobileBottomNav />
      </MemoryRouter>,
    )
    expect(screen.queryByTestId('mobile-bottom-nav')).not.toBeInTheDocument()
  })

  it('does NOT render for unauthenticated visitors', () => {
    mockUseSession.mockImplementation(() => ({ user: null }))
    setViewport(360)
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <MobileBottomNav />
      </MemoryRouter>,
    )
    expect(screen.queryByTestId('mobile-bottom-nav')).not.toBeInTheDocument()
  })

  it('sets --sh-bottom-nav-height on the document root when mounted', () => {
    setViewport(360)
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <MobileBottomNav />
      </MemoryRouter>,
    )
    expect(document.documentElement.style.getPropertyValue('--sh-bottom-nav-height')).toBe('56px')
  })
})
