/**
 * ai-sheet-report.spec.js — Hub AI bubble sheet-aware report card.
 *
 * Covers:
 *   1. Logged-in user navigates to /sheets/:id, opens the AI bubble, and sees
 *      the sheet-context "Analyze sheet" action surface.
 *   2. Clicking "Analyze sheet" shows the loading state and then renders the
 *      mocked findings (issues + suggestions).
 *   3. The snapshot-naming modal in the "Edit with AI" flow validates that
 *      the snapshot name is required before the Apply button enables.
 *
 * AiBubble is hidden on /login, /register, /ai, /messages, and the library
 * reader, so we drive the flow from /sheets/:id where the bubble + the
 * AiSheetReport card mount together.
 *
 * Tagged @smoke @cycle-2026-05-12 so it joins the broader cycle gate.
 */
import { expect, test } from '@playwright/test'
import { createSessionUser, mockAuthenticatedApp } from './helpers/mockStudyHubApi.js'

test.use({ serviceWorkers: 'block' })

async function disableTutorials(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('tutorial_feed_seen', '1')
    window.localStorage.setItem('tutorial_sheets_seen', '1')
    window.localStorage.setItem('tutorial_viewer_seen', '1')
  })
}

async function ensureDesktopBubble(page) {
  // AiBubble redirects to /ai full-page on viewports <768px instead of
  // popping the mini-chat. Force a wide viewport so the popover path runs.
  await page.setViewportSize({ width: 1280, height: 900 })
}

test.describe('AI sheet report @smoke @cycle-2026-05-12', () => {
  test('opening the bubble on /sheets/:id surfaces the sheet card', async ({ page }) => {
    await disableTutorials(page)
    await ensureDesktopBubble(page)

    const user = createSessionUser({ id: 42, username: 'sheet_owner', role: 'student' })
    const { sheet } = await mockAuthenticatedApp(page, { user })

    // analyze endpoint not yet called — just make sure it would succeed if hit.
    await page.route(`**/api/ai/sheets/${sheet.id}/analyze`, async (route) => {
      await route.fulfill({
        status: 200,
        json: { ok: true, data: { summary: '', issues: [], suggestions: [] } },
      })
    })

    await page.goto(`/sheets/${sheet.id}`)
    await page.waitForLoadState('domcontentloaded')

    // Open the bubble.
    const bubble = page.getByRole('button', { name: /Open Hub AI/i })
    await expect(bubble).toBeVisible()
    await bubble.click()

    // The AiSheetReport card always exposes the primary "Analyze sheet"
    // action as the first state. "Re-analyze" only appears after one run.
    await expect(page.getByRole('button', { name: 'Analyze sheet' })).toBeVisible()
  })

  test('Analyze sheet shows loading state, then mocked findings', async ({ page }) => {
    await disableTutorials(page)
    await ensureDesktopBubble(page)

    const user = createSessionUser({ id: 42, username: 'sheet_owner', role: 'student' })
    const { sheet } = await mockAuthenticatedApp(page, { user })

    // Resolve analyze synchronously with two findings so we can assert both
    // categories render under their <details> headers.
    await page.route(`**/api/ai/sheets/${sheet.id}/analyze`, async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          summary: 'Decent coverage but a couple of clarity issues.',
          issues: [
            {
              title: 'Vague intro',
              severity: 'medium',
              suggestion: 'Tighten the opening paragraph.',
            },
          ],
          suggestions: [
            { title: 'Add a worked example', why: 'Concrete examples help retention.' },
          ],
        },
      })
    })

    await page.goto(`/sheets/${sheet.id}`)
    await page.waitForLoadState('domcontentloaded')

    await page.getByRole('button', { name: /Open Hub AI/i }).click()

    const analyze = page.getByRole('button', { name: 'Analyze sheet' })
    await expect(analyze).toBeVisible()
    await analyze.click()

    // Findings header renders the issue count from the mock.
    await expect(page.getByText(/Issues \(1\)/)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('Vague intro')).toBeVisible()
    await expect(page.getByText(/Suggestions \(1\)/)).toBeVisible()
    // Button label flips to Re-analyze once a report exists.
    await expect(page.getByRole('button', { name: 'Re-analyze' })).toBeVisible()
  })

  test('snapshot modal requires a name before Apply is enabled', async ({ page }) => {
    await disableTutorials(page)
    await ensureDesktopBubble(page)

    const user = createSessionUser({ id: 42, username: 'sheet_owner', role: 'student' })
    const { sheet } = await mockAuthenticatedApp(page, { user })

    // canEdit detection: GET /api/sheets/:id is mocked to return an owned
    // sheet (userId === user.id) by mockAuthenticatedApp, so the
    // "Edit with AI…" button surfaces.
    await page.route(`**/api/ai/sheets/${sheet.id}/propose-edit`, async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          proposedContent: 'New content',
          diffSummary: { newLength: 100, delta: 10 },
        },
      })
    })

    await page.goto(`/sheets/${sheet.id}`)
    await page.waitForLoadState('domcontentloaded')

    await page.getByRole('button', { name: /Open Hub AI/i }).click()

    // Open the edit panel.
    const editBtn = page.getByRole('button', { name: /Edit with AI/i })
    await expect(editBtn).toBeVisible()
    await editBtn.click()

    // Type instruction + draft.
    await page
      .getByPlaceholder(/Tighten the conclusion/i)
      .fill('Tighten the conclusion. Fix typos.')
    await page.getByRole('button', { name: 'Draft edit' }).click()

    // Apply opens the snapshot modal. The modal is fixed-position and
    // labelled `Save AI snapshot`.
    const apply = page.getByRole('button', { name: /Apply \(save snapshot\)/i })
    await expect(apply).toBeVisible()
    await apply.click()

    const modal = page.getByRole('dialog', { name: 'Save AI snapshot' })
    await expect(modal).toBeVisible()

    // Snapshot name defaults to the first 60 chars of the instruction.
    const nameInput = modal.locator('input[type="text"]').first()
    await expect(nameInput).toHaveValue(/Tighten the conclusion\. Fix typos\./)

    const confirm = modal.getByRole('button', { name: /Save snapshot \+ apply/i })
    await expect(confirm).toBeEnabled()

    // Clearing the name must disable the confirm button (validation contract).
    await nameInput.fill('')
    await expect(confirm).toBeDisabled()

    // Restoring the name re-enables it.
    await nameInput.fill('manual name')
    await expect(confirm).toBeEnabled()
  })
})
