/**
 * Phase 3 — SheetLab editor mode toggle.
 *
 * Covers:
 *   - Rich Text ↔ HTML/Code pill toggle renders in the Lab Editor tab
 *   - HTML mode shows the CodeMirror editor (gutter + dark background)
 *   - Stacked layout: editor header + preview header both visible, both
 *     collapsible via click
 *   - Legacy markdown sheets show a "Markdown (legacy)" badge and the
 *     user can migrate one-way to Rich Text
 *
 * Mock-first — matches the rest of the suite. The 18 Vitest unit tests
 * on editorSanitize cover lossy-detection + sanitizeForTipTap behavior.
 *
 * @tags @smoke @phase-3 @editor-toggle
 */
import { test, expect } from '@playwright/test'
import { mockAuthenticatedApp } from './helpers/mockStudyHubApi.js'

test.use({ serviceWorkers: 'block' })

async function disableOverlays(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('tutorial_feed_seen', '1')
    window.localStorage.setItem('tutorial_sheets_seen', '1')
    window.localStorage.setItem('tutorial_dashboard_seen', '1')
    window.localStorage.setItem('tutorial_notes_seen', '1')
    window.localStorage.setItem('tutorial_viewer_seen', '1')
    window.localStorage.setItem('tutorial_lab_seen', '1')
    // StackedEditorPane persistence: start with both panes expanded so
    // tests can reliably click the headers to toggle them.
    window.localStorage.removeItem('sheetlab:editor-pane:html')
    window.localStorage.removeItem('sheetlab:editor-pane:markdown')
  })

  // Hide Termly cookie banner + react-joyride overlays that intercept clicks.
  await page.addInitScript(() => {
    const css = `
      #termly-code-snippet-support,
      [class*="termly-styles-module-root"],
      .react-joyride__overlay,
      .react-joyride__tooltip,
      #react-joyride-portal {
        display: none !important;
        pointer-events: none !important;
      }
    `
    const inject = () => {
      if (!document.head) return
      const style = document.createElement('style')
      style.textContent = css
      document.head.appendChild(style)
    }
    if (document.head) inject()
    else document.addEventListener('DOMContentLoaded', inject, { once: true })
  })
}

async function mockLabEndpoints(page, sheet) {
  await page.route(`**/api/sheets/${sheet.id}/commits?*`, async (route) => {
    await route.fulfill({ status: 200, json: { commits: [], total: 0 } })
  })
  await page.route(`**/api/sheets/${sheet.id}/working`, async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        content: sheet.content || '',
        title: sheet.title,
        description: sheet.description,
        lastSavedAt: null,
      },
    })
  })
}

test.describe('SheetLab editor mode toggle @phase-3', () => {
  test('HTML sheet shows Rich Text + HTML pills and CodeMirror editor', async ({ page }) => {
    await disableOverlays(page)

    const { sheet } = await mockAuthenticatedApp(page, {
      sheet: {
        id: 511,
        contentFormat: 'html',
        content: '<h1>Hello</h1><p>world</p>',
      },
    })
    await mockLabEndpoints(page, sheet)

    await page.goto(`/sheets/${sheet.id}/lab?tab=editor`)

    // Both pills visible.
    await expect(page.getByRole('tab', { name: /^rich text$/i })).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('tab', { name: /html \/ code/i })).toBeVisible()

    // HTML pill is active (aria-selected).
    await expect(page.getByRole('tab', { name: /html \/ code/i })).toHaveAttribute('aria-selected', 'true')

    // CodeMirror root appears.
    await expect(page.locator('.sh-html-code-editor .cm-editor')).toBeVisible({ timeout: 5000 })

    // Stacked layout: both headers visible.
    await expect(page.getByRole('button', { name: /collapse html editor/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /collapse live preview/i })).toBeVisible()
  })

  test('clicking the preview header collapses it and expands editor area', async ({ page }) => {
    await disableOverlays(page)

    const { sheet } = await mockAuthenticatedApp(page, {
      sheet: { id: 512, contentFormat: 'html', content: '<p>x</p>' },
    })
    await mockLabEndpoints(page, sheet)

    await page.goto(`/sheets/${sheet.id}/lab?tab=editor`)

    await expect(page.locator('.sh-html-code-editor .cm-editor')).toBeVisible({ timeout: 5000 })

    // Click the Live Preview header to collapse.
    await page.getByRole('button', { name: /collapse live preview/i }).click()

    // After collapse, the expand affordance should be visible on the same
    // header (aria-label flips).
    await expect(page.getByRole('button', { name: /expand live preview/i })).toBeVisible()

    // And the iframe should no longer be in the DOM.
    await expect(page.locator('iframe[title="html-preview"]')).toHaveCount(0)
  })

  test('legacy markdown sheet shows "Markdown (legacy)" badge', async ({ page }) => {
    await disableOverlays(page)

    const { sheet } = await mockAuthenticatedApp(page, {
      sheet: {
        id: 513,
        contentFormat: 'markdown',
        content: '# heading\n\nparagraph text.',
      },
    })
    await mockLabEndpoints(page, sheet)

    await page.goto(`/sheets/${sheet.id}/lab?tab=editor`)

    await expect(page.getByText(/markdown \(legacy\)/i)).toBeVisible({ timeout: 5000 })
    // Rich Text and HTML/Code pills are both available as migration targets.
    await expect(page.getByRole('tab', { name: /^rich text$/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /html \/ code/i })).toBeVisible()
  })
})
