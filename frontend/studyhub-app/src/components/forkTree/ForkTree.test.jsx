/**
 * ForkTree.test.jsx — Vitest coverage for the single-line fork tree
 * renderer added 2026-05-15 (founder screenshot: prior layout was
 * "too big and looks awkward, 'Exampublished' ran together").
 *
 * Verifies:
 *   - Truncation: trees with > DEFAULT_NODE_LIMIT nodes show a
 *     "Show N more forks" button.
 *   - Expand: clicking the button reveals all nodes + adds "Show less".
 *   - Single-line layout: every node renders the lineage-node__row class.
 *   - The current sheet gets the --current modifier.
 *   - Status pill renders for non-published statuses only (published
 *     is the default state so showing the chip on every row is noise).
 *   - Renders nothing for a null root.
 */
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ForkTree from './ForkTree'

function withRouter(node) {
  return <MemoryRouter>{node}</MemoryRouter>
}

function makeNode(id, title, overrides = {}) {
  return {
    id,
    title,
    status: 'published',
    author: { id: 100, username: 'tester', avatarUrl: null },
    forks: 0,
    stars: 0,
    isCurrent: false,
    children: [],
    updatedAt: new Date('2026-05-01').toISOString(),
    ...overrides,
  }
}

describe('ForkTree', () => {
  it('renders nothing when root is null', () => {
    const { container } = render(withRouter(<ForkTree root={null} />))
    expect(container.firstChild).toBeNull()
  })

  it('renders a single root node on one line with the title visible', () => {
    const root = makeNode(1, 'Calculus Cheat Sheet')
    render(withRouter(<ForkTree root={root} />))
    expect(screen.getByText('Calculus Cheat Sheet')).toBeTruthy()
    // The single-line layout class is the structural contract that
    // the CSS hooks into to compress the row to ≤32px tall.
    const row = document.querySelector('.lineage-node--single-line')
    expect(row).toBeTruthy()
  })

  it('flags the current sheet with the --current modifier', () => {
    const root = makeNode(1, 'Original', { isCurrent: true })
    render(withRouter(<ForkTree root={root} />))
    const currentRow = document.querySelector('.lineage-node--current')
    expect(currentRow).toBeTruthy()
    expect(screen.getByText('current')).toBeTruthy()
  })

  it('hides the status pill when status is "published" (default state — too noisy to show on every row)', () => {
    const root = makeNode(1, 'Published Sheet', { status: 'published' })
    render(withRouter(<ForkTree root={root} />))
    expect(document.querySelector('.lineage-node__status')).toBeNull()
  })

  it('shows the status pill for non-default statuses', () => {
    const root = makeNode(1, 'Draft Sheet', { status: 'draft' })
    render(withRouter(<ForkTree root={root} />))
    const pill = document.querySelector('.lineage-node__status--draft')
    expect(pill).toBeTruthy()
    expect(pill?.textContent).toMatch(/draft/i)
  })

  it('truncates to DEFAULT_NODE_LIMIT (6) and shows a "Show more" button', () => {
    // Build a tree of 10 nodes: root + 9 children.
    const root = makeNode(1, 'Root')
    for (let i = 2; i <= 10; i++) {
      root.children.push(makeNode(i, `Fork ${i}`))
    }
    render(withRouter(<ForkTree root={root} />))

    // First 6 nodes visible (root + 5 children)
    expect(screen.queryByText('Root')).toBeTruthy()
    expect(screen.queryByText('Fork 6')).toBeTruthy()
    // Nodes beyond the limit are hidden
    expect(screen.queryByText('Fork 7')).toBeNull()
    expect(screen.queryByText('Fork 10')).toBeNull()
    // "Show N more" button surfaces the hidden count
    expect(screen.getByText(/show 4 more forks/i)).toBeTruthy()
  })

  it('expands fully when "Show more" is clicked and offers "Show less" to collapse again', () => {
    const root = makeNode(1, 'Root')
    for (let i = 2; i <= 10; i++) {
      root.children.push(makeNode(i, `Fork ${i}`))
    }
    render(withRouter(<ForkTree root={root} />))

    fireEvent.click(screen.getByText(/show 4 more forks/i))

    // Now every node is visible
    expect(screen.getByText('Fork 7')).toBeTruthy()
    expect(screen.getByText('Fork 10')).toBeTruthy()
    expect(screen.getByText(/show less/i)).toBeTruthy()

    fireEvent.click(screen.getByText(/show less/i))
    // Re-truncated
    expect(screen.queryByText('Fork 10')).toBeNull()
  })

  it('uses singular wording when exactly one fork is hidden', () => {
    const root = makeNode(1, 'Root')
    for (let i = 2; i <= 7; i++) {
      root.children.push(makeNode(i, `Fork ${i}`))
    }
    // 7 nodes total; limit = 6 → 1 hidden
    render(withRouter(<ForkTree root={root} />))
    expect(screen.getByText(/show 1 more fork ↓/i)).toBeTruthy()
  })

  it('links node titles to the viewer route by default', () => {
    const root = makeNode(42, 'Linked Sheet')
    render(withRouter(<ForkTree root={root} />))
    const link = screen.getByText('Linked Sheet').closest('a')
    expect(link?.getAttribute('href')).toBe('/sheets/42')
  })

  it('links node titles to the lab route when linkMode="lab"', () => {
    const root = makeNode(42, 'Linked Sheet')
    render(withRouter(<ForkTree root={root} linkMode="lab" />))
    const link = screen.getByText('Linked Sheet').closest('a')
    expect(link?.getAttribute('href')).toBe('/sheets/42/lab')
  })
})
