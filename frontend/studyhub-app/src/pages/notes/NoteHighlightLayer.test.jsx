/**
 * NoteHighlightLayer.test.jsx — coverage for the Note Review v1
 * highlight UI.
 *
 * The layer:
 *   - fetches existing highlights on mount (GET /api/notes/:id/highlights),
 *   - paints them into the DOM as <mark> elements,
 *   - shows a 5-color toolbar when the user selects text,
 *   - POSTs to /api/notes/:id/highlights when a swatch is clicked,
 *   - shows a popover with Remove when the user clicks an existing <mark>.
 *
 * jsdom can't actually compute selection rects, so the selection-capture
 * test stubs window.getSelection and event.target.closest to drive the
 * toolbar path deterministically.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import NoteHighlightLayer from './NoteHighlightLayer'

const ORIGINAL_FETCH = globalThis.fetch

beforeEach(() => {
  globalThis.fetch = vi.fn()
})

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
})

function mockHighlightsResponse(highlights) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ highlights }),
  }
}

function renderLayer(
  { noteId = 1, isOwner = true, currentUserId = 7, isPrivate = false } = {},
  body = '<p>This is the body of the note for highlight testing.</p>',
) {
  return render(
    <NoteHighlightLayer
      noteId={noteId}
      noteContent={body}
      isOwner={isOwner}
      currentUserId={currentUserId}
      isPrivate={isPrivate}
    >
      <div data-testid="note-body" dangerouslySetInnerHTML={{ __html: body }} />
    </NoteHighlightLayer>,
  )
}

// Trigger a fake selection on the layer. jsdom can't compute Range rects,
// so we stub `window.getSelection` for the duration of the event.
function simulateSelection(container, selectedText) {
  const root = container.firstChild // the relative-positioned wrapper
  const inner = root.firstChild // the onMouseUp target
  // jsdom Range.getBoundingClientRect returns {} — patch it so the
  // component can compute its toolbar position without throwing.
  const fakeRect = { left: 10, top: 10, right: 50, bottom: 20, width: 40, height: 10 }
  const range = {
    startContainer: inner,
    startOffset: 0,
    commonAncestorContainer: inner,
    getBoundingClientRect: () => fakeRect,
    toString: () => selectedText,
  }
  const sel = {
    isCollapsed: false,
    rangeCount: 1,
    getRangeAt: () => range,
    toString: () => selectedText,
    removeAllRanges: vi.fn(),
  }
  const originalGetSelection = window.getSelection
  window.getSelection = () => sel
  // Also fake the layer root's getBoundingClientRect so subtraction works.
  inner.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    right: 200,
    bottom: 100,
    width: 200,
    height: 100,
  })
  // Patch root.contains so the layer thinks the range lives inside it.
  inner.contains = () => true
  fireEvent.mouseUp(inner)
  window.getSelection = originalGetSelection
}

describe('NoteHighlightLayer', () => {
  it('renders the wrapped children (note body) on mount', async () => {
    globalThis.fetch.mockResolvedValue(mockHighlightsResponse([]))
    renderLayer()
    expect(await screen.findByTestId('note-body')).toBeInTheDocument()
  })

  it('shows the 5-color toolbar after a selection is captured', async () => {
    globalThis.fetch.mockResolvedValue(mockHighlightsResponse([]))
    const { container } = renderLayer()
    // Let the mount-fetch settle.
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled()
    })
    await act(async () => {
      simulateSelection(container, 'body of the note')
    })
    // Toolbar carries role="toolbar" with aria-label.
    expect(
      await screen.findByRole('toolbar', { name: /highlight color picker/i }),
    ).toBeInTheDocument()
    // 5 color swatches: yellow / green / blue / pink / purple.
    expect(screen.getByLabelText('Highlight Yellow')).toBeInTheDocument()
    expect(screen.getByLabelText('Highlight Green')).toBeInTheDocument()
    expect(screen.getByLabelText('Highlight Blue')).toBeInTheDocument()
    expect(screen.getByLabelText('Highlight Pink')).toBeInTheDocument()
    expect(screen.getByLabelText('Highlight Purple')).toBeInTheDocument()
  })

  it('POSTs to /api/notes/:id/highlights when a color is picked', async () => {
    globalThis.fetch
      // initial GET
      .mockResolvedValueOnce(mockHighlightsResponse([]))
      // POST response
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            highlight: {
              id: 99,
              anchorText: 'body of the note',
              anchorOffset: 5,
              color: 'yellow',
              userId: 7,
            },
          }),
      })
    const { container } = renderLayer({ noteId: 42 })
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled()
    })
    await act(async () => {
      simulateSelection(container, 'body of the note')
    })
    await screen.findByRole('toolbar', { name: /highlight color picker/i })
    fireEvent.click(screen.getByLabelText('Highlight Yellow'))
    await waitFor(() => {
      // 1 GET + 1 POST.
      expect(globalThis.fetch).toHaveBeenCalledTimes(2)
    })
    const [postUrl, postInit] = globalThis.fetch.mock.calls[1]
    expect(postUrl).toMatch(/\/api\/notes\/42\/highlights$/)
    expect(postInit.method).toBe('POST')
    expect(postInit.credentials).toBe('include')
    const body = JSON.parse(postInit.body)
    expect(body.color).toBe('yellow')
    expect(body.anchorText).toBe('body of the note')
  })

  it('renders existing highlights as <mark> elements inline (server-driven)', async () => {
    globalThis.fetch.mockResolvedValueOnce(
      mockHighlightsResponse([
        {
          id: 1,
          anchorText: 'body of the note',
          anchorOffset: 12,
          color: 'green',
          userId: 7,
          createdAt: '2026-05-12T00:00:00Z',
        },
      ]),
    )
    const { container } = renderLayer()
    await waitFor(() => {
      // After fetch resolves the layer paints a <mark> over the matching text.
      expect(container.querySelector('mark.sh-note-highlight')).toBeTruthy()
    })
    const mark = container.querySelector('mark.sh-note-highlight')
    expect(mark.textContent).toBe('body of the note')
    expect(mark.getAttribute('data-sh-highlight-id')).toBe('1')
  })

  it('opens the delete popover when an existing highlight is clicked', async () => {
    globalThis.fetch.mockResolvedValueOnce(
      mockHighlightsResponse([
        {
          id: 1,
          anchorText: 'body of the note',
          anchorOffset: 12,
          color: 'pink',
          userId: 7,
          author: { username: 'beta_student1' },
          createdAt: '2026-05-12T00:00:00Z',
        },
      ]),
    )
    const { container } = renderLayer({ currentUserId: 7 })
    await waitFor(() => {
      expect(container.querySelector('mark.sh-note-highlight')).toBeTruthy()
    })
    const mark = container.querySelector('mark.sh-note-highlight')
    // The layer's onMouseUp handler reads event.target.closest — let it
    // resolve to the mark by clicking it directly.
    mark.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 80,
      bottom: 20,
      width: 80,
      height: 20,
    })
    const wrapper = container.firstChild.firstChild
    wrapper.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 200,
      bottom: 100,
      width: 200,
      height: 100,
    })
    // Fire mouseUp on the mark itself (event bubbles up to the wrapper).
    fireEvent.mouseUp(mark)
    // Popover is a role="dialog".
    expect(await screen.findByRole('dialog', { name: /highlight options/i })).toBeInTheDocument()
    expect(screen.getByText(/by beta_student1/)).toBeInTheDocument()
    // Owner currentUserId === 7 matches the highlight.userId → Remove button visible.
    expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument()
  })
})
