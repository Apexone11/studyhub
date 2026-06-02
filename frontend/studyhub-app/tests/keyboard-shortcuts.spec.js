/**
 * keyboard-shortcuts.spec.js — Global keyboard navigation contract.
 *
 * Two scenarios:
 *   1. Pressing `?` opens the global keyboard-shortcuts modal.
 *   2. Pressing `g` then `s` navigates to /sheets (GitHub / Linear-style
 *      sequence shortcut wired through `useGlobalShortcuts`).
 *
 * The `?` handler lives in the legacy `KeyboardShortcuts` component (mounted
 * by the Navbar on every authenticated page). The `g s` sequence handler
 * lives in `lib/useGlobalShortcuts.js` — when that hook is mounted at the
 * App root the test passes; until then the test documents the intended
 * contract and the route-change assertion will reveal a regression.
 *
 * Tagged @smoke @cycle-2026-05-12.
 */
import { expect, test } from '@playwright/test'
import { createSessionUser, mockAuthenticatedApp } from './helpers/mockStudyHubApi.js'

test.use({ serviceWorkers: 'block' })

async function disableTutorials(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('tutorial_feed_seen', '1')
    window.localStorage.setItem('tutorial_sheets_seen', '1')
    window.localStorage.setItem('tutorial_dashboard_seen', '1')
  })
}

test.describe('Keyboard shortcuts @smoke @cycle-2026-05-12', () => {
  test('? opens the keyboard-shortcuts help modal', async ({ page }) => {
    await disableTutorials(page)
    const user = createSessionUser({ username: 'kbd_user', role: 'student' })
    await mockAuthenticatedApp(page, { user })

    await page.goto('/feed')
    await page.waitForLoadState('domcontentloaded')

    // Ensure focus is on the body so the keydown isn't swallowed by a
    // form / input. Clicking the page background works in every engine.
    await page.locator('body').click({ position: { x: 5, y: 5 } })

    // Press '?'. The handler uses event.key === '?' so we send the literal
    // char. Most layouts produce '?' via Shift+/, which Playwright maps
    // when we press 'Shift+/'.
    await page.keyboard.press('Shift+/')

    // The modal's heading is "Keyboard Shortcuts" (rendered by both the
    // legacy KeyboardShortcuts.jsx and the newer KeyboardShortcutsModal.jsx
    // — either is acceptable).
    await expect(page.getByRole('heading', { name: /Keyboard [Ss]hortcuts/ }).first()).toBeVisible({
      timeout: 3_000,
    })
  })

  test('g s navigates to /sheets', async ({ page }) => {
    await disableTutorials(page)
    const user = createSessionUser({ username: 'kbd_user', role: 'student' })
    await mockAuthenticatedApp(page, { user })

    await page.goto('/feed')
    await page.waitForLoadState('domcontentloaded')
    await expect(page).toHaveURL(/\/feed$/)

    // Clear focus from anywhere editable.
    await page.locator('body').click({ position: { x: 5, y: 5 } })

    // Sequence: g, then s within the 1200ms window enforced by
    // useGlobalShortcuts.SEQUENCE_TIMEOUT_MS.
    await page.keyboard.press('g')
    await page.keyboard.press('s')

    await expect(page).toHaveURL(/\/sheets(\?.*)?$/, { timeout: 3_000 })
  })
})
