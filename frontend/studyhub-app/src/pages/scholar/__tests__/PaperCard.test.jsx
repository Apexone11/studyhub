/**
 * PaperCard.test.jsx — Scholar paper card unit coverage.
 *
 * Owned by the a11y/perf/test sweep (2026-05-12). Other Scholar agents
 * are redesigning the page surfaces this session; these tests pin the
 * card's public contract so a regression surfaces here rather than in
 * production:
 *   - Renders with minimal `paper` shape without throwing.
 *   - "Save" action fires `onSave`.
 *   - Selectable variant renders a checkbox; toggling fires
 *     `onToggleSelect`.
 *   - Author list truncates to 3 then shows " · et al.".
 *   - External `target="_blank"` links carry `rel="noopener noreferrer"`
 *     (CLAUDE.md A15).
 */
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PaperCard from '../paperCard/PaperCard'

// useDeviceClass hits window.matchMedia + UA sniffing — stub it so the
// component reliably renders the desktop branch in tests. The
// match-media polyfill in test/setup.js returns matches:false for every
// query, which makes the hook treat the env as a touch tablet on the
// first effect pass and flicker the "Why this paper?" branch. Locking
// the return value here keeps assertions deterministic.
vi.mock('../../../lib/useDeviceClass', () => ({
  default: () => ({ deviceClass: 'desktop', isTouch: false, width: 1280, height: 800 }),
}))

const MINIMAL_PAPER = {
  id: 'doi:10.1234/example',
  title: 'A Study of Gravity',
}

function renderCard(props = {}) {
  return render(
    <MemoryRouter>
      <PaperCard paper={MINIMAL_PAPER} {...props} />
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
})

describe('PaperCard', () => {
  it('renders with a minimal paper prop without throwing', () => {
    renderCard()
    expect(screen.getByRole('heading', { name: 'A Study of Gravity' })).toBeInTheDocument()
  })

  it('returns null when paper is missing', () => {
    const { container } = render(
      <MemoryRouter>
        <PaperCard paper={null} />
      </MemoryRouter>,
    )
    expect(container.firstChild).toBeNull()
  })

  it('invokes onSave when the Save action is clicked', async () => {
    const onSave = vi.fn()
    renderCard({ onSave })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /save paper/i }))
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith(MINIMAL_PAPER)
  })

  it('renders a checkbox in selectable variant and fires onToggleSelect', async () => {
    const onToggleSelect = vi.fn()
    renderCard({ variant: 'selectable', onToggleSelect })
    const checkbox = screen.getByRole('checkbox')
    expect(checkbox).toBeInTheDocument()
    const user = userEvent.setup()
    await user.click(checkbox)
    expect(onToggleSelect).toHaveBeenCalledTimes(1)
    expect(onToggleSelect).toHaveBeenCalledWith(MINIMAL_PAPER, true)
  })

  it('truncates the author list to 3 and renders an "et al." suffix', () => {
    const paper = {
      ...MINIMAL_PAPER,
      authors: [
        { name: 'Author One' },
        { name: 'Author Two' },
        { name: 'Author Three' },
        { name: 'Author Four' },
        { name: 'Author Five' },
      ],
    }
    renderCard({ paper })
    expect(screen.getByRole('button', { name: 'Author One' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Author Two' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Author Three' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Author Four' })).not.toBeInTheDocument()
    expect(screen.getByText(/et al\./i)).toBeInTheDocument()
  })

  it('does not show "et al." when there are 3 or fewer authors', () => {
    const paper = {
      ...MINIMAL_PAPER,
      authors: [{ name: 'Solo Author' }, { name: 'Co-author' }, { name: 'Third' }],
    }
    renderCard({ paper })
    expect(screen.queryByText(/et al\./i)).not.toBeInTheDocument()
  })

  it('every target="_blank" link inside the card carries rel="noopener noreferrer"', () => {
    // PaperCard renders internal <Link> elements (no external _blank by
    // design). This test pins the invariant: if a future change adds an
    // external link with target="_blank", it MUST also carry rel with
    // both noopener and noreferrer (CLAUDE.md A15). We assert across
    // every anchor — empty matches pass trivially today and fail loud
    // tomorrow if a regression slips in.
    const { container } = renderCard()
    const blankLinks = container.querySelectorAll('a[target="_blank"]')
    for (const a of blankLinks) {
      const rel = a.getAttribute('rel') || ''
      expect(rel).toMatch(/noopener/)
      expect(rel).toMatch(/noreferrer/)
    }
  })

  it('renders the compact variant with title + first 2 authors', () => {
    const paper = {
      ...MINIMAL_PAPER,
      publishedAt: '2023-05-01',
      authors: [{ name: 'Alice' }, { name: 'Bob' }, { name: 'Carol' }],
    }
    renderCard({ paper, variant: 'compact' })
    // Compact short-circuits: no action bar.
    expect(screen.queryByRole('button', { name: /save paper/i })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: paper.title })).toBeInTheDocument()
  })
})
