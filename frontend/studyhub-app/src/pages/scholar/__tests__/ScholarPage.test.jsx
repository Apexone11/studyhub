/**
 * ScholarPage.test.jsx — Scholar landing page unit coverage.
 *
 * Pins the invariants the parallel-redesign agents must not break:
 *   - Hero search input is autofocused on desktop.
 *   - Submitting the hero form navigates to /scholar/search?q=…
 *   - Empty "Recently viewed" returns null for that section (no
 *     placeholder block / heading rendered).
 *   - localStorage failures are swallowed (private-mode safe).
 *
 * Discover endpoints (`/api/scholar/discover`) are stubbed with the
 * useFetch mock — we test the landing's surface, not the fetch hook.
 */
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// Stub ScholarShell to a passthrough so we don't pull AppSidebar /
// Navbar / SessionProvider into the unit test. The landing's behavior
// is independent of the chrome.
vi.mock('../ScholarShell', () => ({
  default: ({ children }) => <div data-testid="scholar-shell">{children}</div>,
}))

// useFetch: return a stable shape that ScholarPage already handles via
// `safePapers(payload)`. Loading false + empty data lets us assert the
// empty-state copy and avoids flakey skeleton snapshots.
vi.mock('../../../lib/useFetch', () => ({
  default: () => ({ data: [], loading: false, error: null, refetch: vi.fn() }),
}))

vi.mock('../../../lib/usePageTitle', () => ({
  usePageTitle: vi.fn(),
}))

vi.mock('../../../components/Skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}))

// Lightweight PaperCard stub — the unit test only cares about the
// landing's shell, not the card internals (those are covered in
// PaperCard.test.jsx).
vi.mock('../paperCard/PaperCard', () => ({
  default: ({ paper }) => <div data-testid="paper-card">{paper?.title}</div>,
}))

import ScholarPage from '../ScholarPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <ScholarPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockNavigate.mockClear()
  // Force the desktop / non-touch branch so the autofocus effect runs.
  // The test/setup.js polyfill returns matches:false for every query —
  // that's the "hover: hover, pointer: fine" branch which is what we
  // want. Explicit re-assignment guards against test order leaking a
  // different polyfill in.
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
})

afterEach(() => {
  cleanup()
})

describe('ScholarPage', () => {
  it('autofocuses the hero search input on mount', () => {
    renderPage()
    const input = screen.getByRole('searchbox', {
      name: /search scholar by title, author, doi, or arxiv id/i,
    })
    expect(input).toBeInTheDocument()
    expect(document.activeElement).toBe(input)
  })

  it('navigates to /scholar/search with the encoded query on Enter', async () => {
    renderPage()
    const user = userEvent.setup()
    const input = screen.getByRole('searchbox', {
      name: /search scholar by title, author, doi, or arxiv id/i,
    })
    await user.type(input, 'attention is all you need{Enter}')
    expect(mockNavigate).toHaveBeenCalledTimes(1)
    expect(mockNavigate).toHaveBeenCalledWith(
      `/scholar/search?q=${encodeURIComponent('attention is all you need')}`,
    )
  })

  it('does not submit when the input is empty or only whitespace', async () => {
    renderPage()
    const user = userEvent.setup()
    const input = screen.getByRole('searchbox', {
      name: /search scholar by title, author, doi, or arxiv id/i,
    })
    await user.type(input, '   {Enter}')
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('does not render the "Recently viewed" section when storage is empty', () => {
    localStorage.clear()
    renderPage()
    expect(screen.queryByRole('heading', { name: /recently viewed/i })).not.toBeInTheDocument()
  })

  it('renders the "Recently viewed" section when localStorage has entries', () => {
    localStorage.setItem(
      'studyhub.scholar.recentlyViewed',
      JSON.stringify([
        { id: 'doi:10.1/a', title: 'Paper Alpha', authors: [{ name: 'Author One' }] },
      ]),
    )
    renderPage()
    expect(screen.getByRole('heading', { name: /recently viewed/i })).toBeInTheDocument()
    expect(screen.getByText('Paper Alpha')).toBeInTheDocument()
  })

  it('does not crash when localStorage throws on read (Safari private mode)', () => {
    // Replace the global Storage prototype methods with throwers. The
    // page's readRecentlyViewed() wraps in try/catch and returns [].
    const origGet = Storage.prototype.getItem
    const origSet = Storage.prototype.setItem
    Storage.prototype.getItem = () => {
      throw new Error('SecurityError: localStorage disabled')
    }
    Storage.prototype.setItem = () => {
      throw new Error('SecurityError: localStorage disabled')
    }
    try {
      expect(() => renderPage()).not.toThrow()
      // The section stays hidden because the read returned [].
      expect(screen.queryByRole('heading', { name: /recently viewed/i })).not.toBeInTheDocument()
    } finally {
      Storage.prototype.getItem = origGet
      Storage.prototype.setItem = origSet
    }
  })

  it('renders an <h1> that contains the page name', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: /scholar/i })).toBeInTheDocument()
  })
})
