/**
 * AiBubble.test.jsx — coverage for the floating Hub AI bubble.
 *
 * Verifies:
 *   - The FAB renders on app routes.
 *   - Clicking it toggles the chat window.
 *   - Escape closes the window.
 *   - The bubble is hidden on /ai, /login, /register, /messages.
 *   - Mobile breakpoints redirect to /ai (no inline window).
 *
 * All cross-module dependencies (AiSheetReport, AiChatProvider, focus
 * trap, AiMarkdown, etc.) are stubbed so the test only exercises bubble
 * behavior — not the full AI stack.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// Mocks BEFORE the SUT import — Vitest hoists vi.mock automatically but
// these have to be defined before the import for ESM ordering safety.

const navigateSpy = vi.fn()
vi.mock('react-router-dom', async (orig) => {
  const actual = await orig()
  return {
    ...actual,
    useNavigate: () => navigateSpy,
  }
})

// AiSheetReport renders null when not on /sheets/:id, so we just stub it
// to a tiny marker so we don't have to wire its dependencies up.
vi.mock('./AiSheetReport', () => ({
  default: () => <div data-testid="ai-sheet-report-stub" />,
}))

vi.mock('./AiMarkdown', () => ({
  default: ({ content }) => <div data-testid="ai-md">{content}</div>,
}))

vi.mock('./AiThinkingDots', () => ({
  default: () => <span data-testid="thinking" />,
}))

vi.mock('./AiSheetPreview', () => ({
  SheetPreviewBar: () => <div data-testid="sheet-preview-bar" />,
}))

vi.mock('./aiSheetPreviewHelpers', () => ({
  extractHtmlFromMessage: () => null,
}))

vi.mock('../Icons', () => ({
  IconSpark: () => <span data-testid="icon-spark" />,
  IconX: () => <span data-testid="icon-x" />,
  IconPlus: () => <span data-testid="icon-plus" />,
}))

const inertChat = {
  conversations: [],
  activeConversationId: null,
  messages: [],
  loading: false,
  streaming: false,
  streamingText: '',
  truncated: false,
  error: null,
  usage: null,
  loadingConversations: false,
  sendMessage: vi.fn(),
  continueGeneration: vi.fn(),
  stopStreaming: vi.fn(),
  startNewConversation: vi.fn(),
  selectConversation: vi.fn(),
  deleteConversation: vi.fn(),
}

vi.mock('../../lib/aiChatContext', () => ({
  useSharedAiChat: () => inertChat,
}))

vi.mock('../../lib/useAiContext', () => ({
  useAiContext: () => [],
}))

vi.mock('../../lib/chatPanelContext.js', () => ({
  useChatPanel: () => ({ isOpen: false, setOpen: () => {} }),
}))

// Focus trap is a thin adapter — for the test we just need it to return a
// usable ref. The real hook wires up focus-trap which jsdom doesn't fully
// emulate; bypassing it is safer than running the real thing.
vi.mock('../../lib/useFocusTrap', () => ({
  useFocusTrap: () => ({ current: null }),
}))

import AiBubble from './AiBubble'

// ── helpers ──────────────────────────────────────────────────────────

function renderAt(pathname) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route path="*" element={<AiBubble />} />
      </Routes>
    </MemoryRouter>,
  )
}

// jsdom doesn't carry a default innerWidth — set one before each test.
let originalInnerWidth
let originalScrollIntoView
beforeEach(() => {
  navigateSpy.mockReset()
  originalInnerWidth = window.innerWidth
  Object.defineProperty(window, 'innerWidth', {
    value: 1280,
    configurable: true,
    writable: true,
  })
  // jsdom lacks Element.prototype.scrollIntoView; the bubble's auto-scroll
  // effect crashes the error boundary without this shim. Install once and
  // restore in afterEach.
  originalScrollIntoView = Element.prototype.scrollIntoView
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  Object.defineProperty(window, 'innerWidth', {
    value: originalInnerWidth,
    configurable: true,
    writable: true,
  })
  if (originalScrollIntoView) Element.prototype.scrollIntoView = originalScrollIntoView
})

// ── tests ────────────────────────────────────────────────────────────

describe('AiBubble', () => {
  it('renders the FAB on a normal authenticated route (/feed)', () => {
    renderAt('/feed')
    expect(screen.getByLabelText('Open Hub AI')).toBeInTheDocument()
  })

  it('toggles the chat window open when the FAB is clicked', () => {
    renderAt('/feed')
    // Closed: chat dialog not in the document.
    expect(screen.queryByRole('dialog', { name: /hub ai mini chat/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Open Hub AI'))
    expect(screen.getByRole('dialog', { name: /hub ai mini chat/i })).toBeInTheDocument()
    // FAB label flips to Close.
    expect(screen.getByLabelText('Close Hub AI')).toBeInTheDocument()
  })

  it('closes on Escape key', () => {
    renderAt('/feed')
    fireEvent.click(screen.getByLabelText('Open Hub AI'))
    expect(screen.getByRole('dialog', { name: /hub ai mini chat/i })).toBeInTheDocument()
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(screen.queryByRole('dialog', { name: /hub ai mini chat/i })).not.toBeInTheDocument()
  })

  it.each([['/ai'], ['/login'], ['/register'], ['/messages']])('hidden on path %s', (pathname) => {
    const { container } = renderAt(pathname)
    // Bubble + dialog both absent — no Open Hub AI label rendered.
    expect(screen.queryByLabelText('Open Hub AI')).not.toBeInTheDocument()
    // The component returns null which renders nothing through the portal.
    expect(container.querySelector('[aria-label="Open Hub AI"]')).toBeNull()
  })

  it('hidden on the library reader route /library/:id/read', () => {
    renderAt('/library/42/read')
    expect(screen.queryByLabelText('Open Hub AI')).not.toBeInTheDocument()
  })

  it('redirects to /ai on mobile breakpoint (< 768px) instead of opening the inline window', () => {
    Object.defineProperty(window, 'innerWidth', { value: 600, configurable: true, writable: true })
    renderAt('/feed')
    fireEvent.click(screen.getByLabelText('Open Hub AI'))
    expect(navigateSpy).toHaveBeenCalledWith('/ai')
    expect(screen.queryByRole('dialog', { name: /hub ai mini chat/i })).not.toBeInTheDocument()
  })
})
