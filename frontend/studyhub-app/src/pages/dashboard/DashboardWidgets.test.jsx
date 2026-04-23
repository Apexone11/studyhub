/**
 * DashboardWidgets — component tests for the exports in this file.
 *
 * These widgets are pure and stateless (they receive data via props) — so
 * testing them is a matter of rendering with representative prop shapes
 * and asserting the visible output. Per tech-debt handoff §13, each test
 * block covers: loading skeleton, empty state, error state (where the
 * component has one), and happy-path rendering.
 */

import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { DashboardSkeleton, EmptyState, RecentSheets, StatCards } from './DashboardWidgets'

function withRouter(ui) {
  return <MemoryRouter>{ui}</MemoryRouter>
}

describe('DashboardSkeleton', () => {
  it('renders the dashboard loading placeholder', () => {
    const { container } = render(<DashboardSkeleton />)
    // Skeleton has multiple grey placeholder divs; at least one must render.
    expect(container.firstChild).toBeTruthy()
  })
})

describe('EmptyState', () => {
  it('renders title and body copy', () => {
    render(
      withRouter(
        <EmptyState
          title="Nothing here yet"
          body="Come back after you've added something."
          actionLabel="Add one"
          actionTo="/add"
        />,
      ),
    )
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument()
    expect(screen.getByText("Come back after you've added something.")).toBeInTheDocument()
  })

  it('renders an action link when actionLabel + actionTo are provided', () => {
    render(
      withRouter(<EmptyState title="T" body="B" actionLabel="Do the thing" actionTo="/thing" />),
    )
    const link = screen.getByRole('link', { name: /do the thing/i })
    expect(link).toHaveAttribute('href', '/thing')
  })

  it('hides the action link when actionLabel is omitted', () => {
    render(withRouter(<EmptyState title="T" body="B" />))
    expect(screen.queryByRole('link')).toBeNull()
  })
})

describe('StatCards', () => {
  it('renders every card passed in', () => {
    render(
      withRouter(
        <StatCards
          cards={[
            { label: 'Sheets', value: 12, helper: '+2 this week', accent: '#000' },
            { label: 'Notes', value: 3, helper: 'across 2 courses', accent: '#000' },
          ]}
        />,
      ),
    )
    expect(screen.getByText('SHEETS')).toBeInTheDocument()
    expect(screen.getByText('NOTES')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('+2 this week')).toBeInTheDocument()
  })

  it('wraps cards in a <Link> when card.to is provided', () => {
    render(
      withRouter(
        <StatCards
          cards={[{ label: 'Sheets', value: 5, helper: 'x', accent: '#000', to: '/sheets' }]}
        />,
      ),
    )
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/sheets')
  })
})

describe('RecentSheets', () => {
  it('renders the heading and list when sheets are provided', () => {
    const sheets = [
      { id: 1, title: 'Discrete Math Notes', course: { code: 'CMSC250' } },
      { id: 2, title: 'Linear Algebra Cheatsheet', course: { code: 'MATH240' } },
    ]
    render(withRouter(<RecentSheets recentSheets={sheets} newCount={0} />))
    expect(screen.getByText(/Recent Sheets/i)).toBeInTheDocument()
    expect(screen.getByText('Discrete Math Notes')).toBeInTheDocument()
    expect(screen.getByText('Linear Algebra Cheatsheet')).toBeInTheDocument()
  })

  it('renders the empty-state copy when no sheets are provided', () => {
    render(withRouter(<RecentSheets recentSheets={[]} newCount={0} />))
    expect(screen.getByText(/No sheets yet/i)).toBeInTheDocument()
  })
})
