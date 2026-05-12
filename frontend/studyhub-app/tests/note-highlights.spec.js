/**
 * note-highlights.spec.js — Note Review v1 highlight UI (loop T9, Phase 9).
 *
 * Two scenarios:
 *   1. Selecting text inside the note body surfaces the floating highlight
 *      toolbar with the 5-color picker.
 *   2. Clicking a color triggers a POST /api/notes/:id/highlights save call.
 *
 * The note viewer (`NoteViewerPage`) wraps the rendered markdown in a
 * `<NoteHighlightLayer>` that listens for `mouseup` selections. The toolbar
 * mounts as a child of the wrapping container.
 *
 * Tagged @smoke @cycle-2026-05-12.
 */
import { expect, test } from '@playwright/test'
import { createSessionUser, mockAuthenticatedApp } from './helpers/mockStudyHubApi.js'

test.use({ serviceWorkers: 'block' })

const NOTE_ID = 4242
const NOTE_BODY = 'This is the body text of a shared note used for highlight tests.'

async function disableTutorials(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('tutorial_notes_seen', '1')
    window.localStorage.setItem('tutorial_viewer_seen', '1')
  })
}

async function mockNoteViewer(page, { highlightHandler } = {}) {
  const user = createSessionUser({ id: 99, username: 'note_owner', role: 'student' })
  await mockAuthenticatedApp(page, { user })

  // Specific note endpoint overrides the catch-all in mockAuthenticatedApp.
  await page.route(`**/api/notes/${NOTE_ID}`, async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        id: NOTE_ID,
        title: 'Highlight playground',
        content: NOTE_BODY,
        private: false,
        isOwner: true,
        userId: user.id,
        author: { id: user.id, username: user.username },
        createdAt: '2026-05-12T10:00:00.000Z',
        updatedAt: '2026-05-12T10:00:00.000Z',
        course: null,
        stars: 0,
        commentCount: 0,
        reactions: { likes: 0, dislikes: 0, userReaction: null },
      },
    })
  })

  // Highlights index — start empty so the toolbar is the only thing the user
  // interacts with for this test.
  let posted = null
  await page.route(`**/api/notes/${NOTE_ID}/highlights`, async (route) => {
    if (route.request().method() === 'POST') {
      posted = route.request().postDataJSON()
      if (highlightHandler) await highlightHandler(posted)
      await route.fulfill({
        status: 200,
        json: {
          id: 1,
          noteId: NOTE_ID,
          color: posted?.color || 'yellow',
          anchorText: posted?.anchorText || '',
          anchorOffset: posted?.anchorOffset ?? 0,
          author: { id: user.id, username: user.username },
        },
      })
      return
    }
    await route.fulfill({ status: 200, json: { highlights: [] } })
  })

  return {
    user,
    getPosted: () => posted,
  }
}

test.describe('Note highlights @smoke @cycle-2026-05-12', () => {
  test('selecting text inside the note body shows the highlight toolbar', async ({ page }) => {
    await disableTutorials(page)
    await mockNoteViewer(page)

    await page.goto(`/notes/${NOTE_ID}`)
    await page.waitForLoadState('domcontentloaded')

    // Ensure the rendered body is on the page before selecting.
    const bodyText = page.getByText(NOTE_BODY, { exact: false })
    await expect(bodyText).toBeVisible()

    // Programmatically select the first 10 characters of the note body and
    // fire a mouseup so the layer's selection listener kicks in. Direct
    // mouse drag is too brittle across browser engines.
    await page.evaluate(
      ({ snippet }) => {
        const root = document.body
        // Find the text node containing the snippet.
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null)
        let node = walker.nextNode()
        while (node) {
          if (node.nodeValue && node.nodeValue.includes(snippet)) {
            const start = node.nodeValue.indexOf(snippet)
            const range = document.createRange()
            range.setStart(node, start)
            range.setEnd(node, start + snippet.length)
            const sel = window.getSelection()
            sel.removeAllRanges()
            sel.addRange(range)
            // Mouseup on the parent so the React listener attached on the
            // wrapper picks it up.
            node.parentElement.dispatchEvent(
              new MouseEvent('mouseup', { bubbles: true, clientX: 100, clientY: 100 }),
            )
            return
          }
          node = walker.nextNode()
        }
      },
      { snippet: 'This is the' },
    )

    // Toolbar uses role="toolbar" with the picker aria-label.
    const toolbar = page.getByRole('toolbar', { name: /Highlight color picker/i })
    await expect(toolbar).toBeVisible({ timeout: 3_000 })

    // All 5 color buttons render.
    await expect(toolbar.getByRole('button', { name: /Highlight Yellow/i })).toBeVisible()
    await expect(toolbar.getByRole('button', { name: /Highlight Green/i })).toBeVisible()
    await expect(toolbar.getByRole('button', { name: /Highlight Blue/i })).toBeVisible()
    await expect(toolbar.getByRole('button', { name: /Highlight Pink/i })).toBeVisible()
    await expect(toolbar.getByRole('button', { name: /Highlight Purple/i })).toBeVisible()
  })

  test('applying a color POSTs the highlight to the server', async ({ page }) => {
    await disableTutorials(page)
    const ctx = await mockNoteViewer(page)

    await page.goto(`/notes/${NOTE_ID}`)
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByText(NOTE_BODY, { exact: false })).toBeVisible()

    await page.evaluate(
      ({ snippet }) => {
        const root = document.body
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null)
        let node = walker.nextNode()
        while (node) {
          if (node.nodeValue && node.nodeValue.includes(snippet)) {
            const start = node.nodeValue.indexOf(snippet)
            const range = document.createRange()
            range.setStart(node, start)
            range.setEnd(node, start + snippet.length)
            const sel = window.getSelection()
            sel.removeAllRanges()
            sel.addRange(range)
            node.parentElement.dispatchEvent(
              new MouseEvent('mouseup', { bubbles: true, clientX: 100, clientY: 100 }),
            )
            return
          }
          node = walker.nextNode()
        }
      },
      { snippet: 'body text' },
    )

    const toolbar = page.getByRole('toolbar', { name: /Highlight color picker/i })
    await expect(toolbar).toBeVisible({ timeout: 3_000 })

    // Click the Green swatch and wait for the POST to land.
    const [request] = await Promise.all([
      page.waitForRequest(
        (r) => /\/api\/notes\/\d+\/highlights$/.test(r.url()) && r.method() === 'POST',
      ),
      toolbar.getByRole('button', { name: /Highlight Green/i }).click(),
    ])

    const body = request.postDataJSON()
    expect(body).toBeTruthy()
    expect(body.color).toBe('green')
    // anchorText is the selected substring.
    expect(typeof body.anchorText).toBe('string')
    expect(body.anchorText.length).toBeGreaterThan(0)
    expect(ctx.getPosted()).toMatchObject({ color: 'green' })
  })
})
