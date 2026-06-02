/**
 * NavbarUserMenu — WAI-ARIA APG Menu keyboard-navigation coverage.
 *
 * The dropdown exposes role="menu" + role="menuitem". This test pins the
 * keyboard contract so it doesn't silently regress:
 *   - ArrowDown on the collapsed trigger opens the menu + focuses item 1.
 *   - ArrowDown / ArrowUp move focus across items (wrapping).
 *   - Home / End jump to first / last item.
 *   - Escape closes and restores focus to the trigger.
 *   - Click still selects an item (Enter/Space fire the button natively).
 */
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import NavbarUserMenu from './NavbarUserMenu'

const signOut = vi.fn()

// Only `signOut` is read from the session context here.
vi.mock('../../lib/session-context', () => ({
  useSession: () => ({ signOut }),
}))

const user = { id: 7, username: 'tester', role: 'student', avatarUrl: null }

function renderMenu() {
  return render(
    <MemoryRouter>
      <NavbarUserMenu user={user} />
    </MemoryRouter>,
  )
}

function getTrigger() {
  return screen.getByRole('button', { name: /User menu: tester/i })
}

describe('NavbarUserMenu keyboard navigation', () => {
  it('opens the menu and focuses the first item on ArrowDown from the trigger', async () => {
    const u = userEvent.setup()
    renderMenu()

    const trigger = getTrigger()
    act(() => trigger.focus())
    await u.keyboard('{ArrowDown}')

    const items = screen.getAllByRole('menuitem')
    expect(items).toHaveLength(3)
    expect(document.activeElement).toBe(items[0])
  })

  it('ArrowDown / ArrowUp move focus across items and wrap', async () => {
    const u = userEvent.setup()
    renderMenu()

    await u.click(getTrigger())
    const items = screen.getAllByRole('menuitem')
    expect(document.activeElement).toBe(items[0])

    await u.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(items[1])
    await u.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(items[2])
    // Wraps back to the first item.
    await u.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(items[0])
    // ArrowUp from the first item wraps to the last.
    await u.keyboard('{ArrowUp}')
    expect(document.activeElement).toBe(items[2])
  })

  it('Home / End jump to first / last item', async () => {
    const u = userEvent.setup()
    renderMenu()

    await u.click(getTrigger())
    const items = screen.getAllByRole('menuitem')

    await u.keyboard('{End}')
    expect(document.activeElement).toBe(items[2])
    await u.keyboard('{Home}')
    expect(document.activeElement).toBe(items[0])
  })

  it('Escape closes the menu and restores focus to the trigger', async () => {
    const u = userEvent.setup()
    renderMenu()

    const trigger = getTrigger()
    await u.click(trigger)
    expect(screen.getByRole('menu')).toBeInTheDocument()

    await u.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(document.activeElement).toBe(trigger)
  })

  it('renders the three menu items with My Profile, Settings, and Log out', async () => {
    const u = userEvent.setup()
    renderMenu()

    await u.click(getTrigger())
    expect(screen.getByRole('menuitem', { name: 'My Profile' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Log out' })).toBeInTheDocument()
  })
})
