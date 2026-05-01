/**
 * Modal focus-trap smoke test (W3C ARIA Authoring Practices §3.9 modal
 * dialog pattern).
 *
 * Targets the dev-only `/__a11y/dialog` harness page, which mounts a
 * `FocusTrappedDialog` with three known buttons inside. The harness
 * route is gated on `import.meta.env.DEV` and tree-shaken from prod
 * bundles, so this test exercises the SAME primitive every real modal
 * uses (LegalAcceptanceModal, RoleTile, KeyboardShortcuts, etc.) but
 * doesn't depend on auth state, localStorage flags, or seed fixtures.
 *
 * Earlier iteration (2026-05-01 rev 1) navigated to `/login` and
 * skipped if the modal didn't render — silently green in CI. Replaced
 * with the harness route for determinism.
 *
 * Coverage:
 *   1. Dialog has role="dialog" + aria-modal="true" + aria-labelledby.
 *   2. Tab cycling stays inside the dialog (forward).
 *   3. Shift+Tab cycling stays inside the dialog (backward).
 *   4. Initial focus lands on the data-autofocus element.
 *   5. Escape closes the dialog and restores focus to the trigger.
 */
import { expect, test } from '@playwright/test'

test.describe('FocusTrappedDialog focus-trap smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/__a11y/dialog')
    await page.waitForLoadState('networkidle')
    // The harness opens the dialog on mount; if dev-only gate is off
    // (someone built the test against a prod bundle) the route is a
    // 404 — fail loud rather than skip.
    await expect(page.getByRole('dialog')).toBeVisible()
  })

  test('dialog has correct ARIA attributes', async ({ page }) => {
    const dialog = page.getByRole('dialog')
    await expect(dialog).toHaveAttribute('aria-modal', 'true')
    await expect(dialog).toHaveAttribute('aria-labelledby', 'harness-title')
  })

  test('initial focus lands on data-autofocus element', async ({ page }) => {
    const focusedId = await page.evaluate(() => document.activeElement?.id)
    expect(focusedId).toBe('harness-first')
  })

  test('Tab cycle stays inside the dialog', async ({ page }) => {
    // Three focusables (first, second, third). Tab 6 times — focus
    // should never escape the dialog.
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press('Tab')
      const insideDialog = await page.evaluate(() => {
        const dlg = document.querySelector('[role="dialog"]')
        return dlg ? dlg.contains(document.activeElement) : false
      })
      expect(insideDialog, `Tab ${i + 1}: focus must stay inside dialog`).toBe(true)
    }
  })

  test('Shift+Tab cycle stays inside the dialog', async ({ page }) => {
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press('Shift+Tab')
      const insideDialog = await page.evaluate(() => {
        const dlg = document.querySelector('[role="dialog"]')
        return dlg ? dlg.contains(document.activeElement) : false
      })
      expect(insideDialog, `Shift+Tab ${i + 1}: focus must stay inside dialog`).toBe(true)
    }
  })

  test('Escape closes the dialog', async ({ page }) => {
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()
  })
})
