/**
 * notes.persistence.spec.js — Notes Hardening v2 regression E2E.
 *
 * Covers the five persistence / resilience scenarios required by the hardening
 * plan (Task 20 of the 21-task cycle):
 *   1. Type, wait, reload: autosaved content persists on the server.
 *   2. Type, close tab, reopen: IndexedDB draft recovers unsaved content.
 *   3. Ctrl+S forces an immediate manual save.
 *   4. Pasted rich HTML is sanitized (no inline styles, no Office namespaces).
 *   5. Route-leave during a dirty state flushes via beforeunload/sendBeacon.
 *
 * Requires a live backend + seeded beta student. The hardening flag is injected
 * via localStorage before the editor mounts so the new persistence path is
 * active even if the server-side flag is still off.
 */
import { expect, test } from '@playwright/test'
import {
  loginAsBetaStudent,
  createNote,
  enableHardeningFlagScript,
} from './helpers/notesHelpers.js'

const SAVED_RE = /Saved|Up to date/i

test.describe('Notes hardening v2 persistence', () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(enableHardeningFlagScript())
  })

  test('type, wait, reload — content persists on the server', async ({ page }) => {
    await loginAsBetaStudent(page)
    const id = await createNote(page, 'Persistence reload test', '')

    await page.goto(`/notes/${id}`)
    await page.locator('[data-testid="note-editor"] .ProseMirror').click()
    await page.keyboard.type('hello persistence ')

    await expect(page.locator('[data-testid="note-save-status"]')).toContainText(SAVED_RE, {
      timeout: 10_000,
    })

    await page.reload()
    await expect(page.locator('[data-testid="note-editor"] .ProseMirror')).toContainText(
      'hello persistence',
      { timeout: 10_000 },
    )
  })

  test('type, close tab, reopen — IDB draft recovers content', async ({ browser }) => {
    const context = await browser.newContext()
    await context.addInitScript(enableHardeningFlagScript())

    const page = await context.newPage()
    await loginAsBetaStudent(page)
    const id = await createNote(page, 'Crash recovery test', '')

    await page.goto(`/notes/${id}`)
    await page.locator('[data-testid="note-editor"] .ProseMirror').click()
    await page.keyboard.type('crash draft ')
    // Close before autosave can complete — rely on IDB draft for recovery.
    await page.close()

    const page2 = await context.newPage()
    await loginAsBetaStudent(page2)
    await page2.goto(`/notes/${id}`)
    await expect(page2.locator('[data-testid="note-editor"] .ProseMirror')).toContainText(
      'crash draft',
      { timeout: 10_000 },
    )

    await context.close()
  })

  test('Ctrl+S forces an immediate manual save', async ({ page }) => {
    await loginAsBetaStudent(page)
    const id = await createNote(page, 'Hotkey test', '')

    await page.goto(`/notes/${id}`)
    await page.locator('[data-testid="note-editor"] .ProseMirror').click()
    await page.keyboard.type('hotkey typed')
    await page.keyboard.press('Control+s')

    await expect(page.locator('[data-testid="note-save-status"]')).toContainText(SAVED_RE, {
      timeout: 5_000,
    })
  })

  test('paste rich HTML is sanitized', async ({ page }) => {
    await loginAsBetaStudent(page)
    const id = await createNote(page, 'Paste test', '')

    await page.goto(`/notes/${id}`)
    await page.locator('[data-testid="note-editor"] .ProseMirror').click()

    const dirtyHtml =
      '<p class="MsoNormal" style="color:red"><o:p>hi</o:p> <strong>bold</strong></p>'

    await page.evaluate((html) => {
      const dt = new DataTransfer()
      dt.setData('text/html', html)
      dt.setData('text/plain', 'hi bold')
      const ed = document.querySelector('[data-testid="note-editor"] .ProseMirror')
      ed.dispatchEvent(
        new ClipboardEvent('paste', {
          clipboardData: dt,
          bubbles: true,
          cancelable: true,
        }),
      )
    }, dirtyHtml)

    await expect(page.locator('[data-testid="note-save-status"]')).toContainText(SAVED_RE, {
      timeout: 10_000,
    })

    const html = await page.locator('[data-testid="note-editor"] .ProseMirror').innerHTML()
    expect(html).not.toMatch(/style=/)
    expect(html).not.toMatch(/o:p/i)
    expect(html).toContain('<strong>')
  })

  test('route-leave during dirty state flushes via beforeunload', async ({ page }) => {
    await loginAsBetaStudent(page)
    const id = await createNote(page, 'Flush test', '')

    await page.goto(`/notes/${id}`)
    await page.locator('[data-testid="note-editor"] .ProseMirror').click()
    await page.keyboard.type('leave flush')
    // Intentionally short — do NOT let debounce autosave land.
    await page.waitForTimeout(200)

    // Navigate away to a known authenticated route. beforeunload + sendBeacon
    // should flush the dirty buffer before the navigation commits.
    await page.goto('/dashboard')

    // Re-open the note; the flushed content should be present.
    await page.goto(`/notes/${id}`)
    await expect(page.locator('[data-testid="note-editor"] .ProseMirror')).toContainText(
      'leave flush',
      { timeout: 10_000 },
    )
  })
})
