import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect } from 'vitest'
import TopContributors from './TopContributors'

/**
 * Phase 1 of the v2 design refresh — Top Contributors mini-widget.
 * See docs/internal/design-refresh-v2-master-plan.md.
 */

function renderWidget(props = {}) {
  return render(
    <MemoryRouter>
      <TopContributors {...props} />
    </MemoryRouter>,
  )
}

const sampleContributors = [
  { id: 1, username: 'ada', displayName: 'Ada L.', contributionCount: 12, avatarUrl: null },
  { id: 2, username: 'grace', displayName: 'Grace H.', contributionCount: 8, avatarUrl: null },
  { id: 3, username: 'linus', displayName: 'Linus T.', contributionCount: 1, avatarUrl: null },
  { id: 4, username: 'kat', displayName: 'Kat G.', contributionCount: 0, avatarUrl: null },
  { id: 5, username: 'brian', displayName: 'Brian K.', contributionCount: 4, avatarUrl: null },
  { id: 6, username: 'elena', displayName: 'Elena M.', contributionCount: 3, avatarUrl: null },
]

describe('TopContributors', () => {
  it('renders the role-aware heading for students', () => {
    renderWidget({ accountType: 'student', contributors: sampleContributors })
    expect(screen.getByRole('heading', { name: /courses/i })).toBeInTheDocument()
  })

  it('renders the role-aware heading for teachers', () => {
    renderWidget({ accountType: 'teacher', contributors: sampleContributors })
    expect(screen.getByRole('heading', { name: /courses/i })).toBeInTheDocument()
  })

  it('renders the Self-learner heading (follow-centric, no courses)', () => {
    renderWidget({ accountType: 'other', contributors: sampleContributors })
    const heading = screen.getByRole('heading', { name: /follow/i })
    expect(heading).toBeInTheDocument()
    expect(heading.textContent).not.toMatch(/classmate/i)
    expect(heading.textContent).not.toMatch(/courses/i)
  })

  it('renders loading skeletons when loading=true (no empty copy, no list items)', () => {
    renderWidget({ accountType: 'student', loading: true, contributors: [] })
    const skeletonList = screen.getByRole('list')
    expect(skeletonList.getAttribute('aria-busy')).toBe('true')
    expect(skeletonList.querySelectorAll('li').length).toBeGreaterThan(0)
    expect(screen.queryByText(/No activity/i)).not.toBeInTheDocument()
  })

  it('renders the role-aware empty state when contributors=[] and not loading', () => {
    renderWidget({ accountType: 'student', contributors: [] })
    expect(screen.getByText(/No activity from classmates yet/i)).toBeInTheDocument()
  })

  it('renders the Self-learner empty state without classmate language', () => {
    renderWidget({ accountType: 'other', contributors: [] })
    const empty = screen.getByText(/Follow a few people/i)
    expect(empty).toBeInTheDocument()
    expect(empty.textContent).not.toMatch(/classmate/i)
  })

  it('renders up to `max` contributors and caps the list', () => {
    renderWidget({ accountType: 'student', contributors: sampleContributors, max: 3 })
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(screen.getByText('Ada L.')).toBeInTheDocument()
    expect(screen.getByText('Grace H.')).toBeInTheDocument()
    expect(screen.getByText('Linus T.')).toBeInTheDocument()
    expect(screen.queryByText('Kat G.')).not.toBeInTheDocument()
  })

  it('defaults max to 5 when not provided', () => {
    renderWidget({ accountType: 'student', contributors: sampleContributors })
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(5)
  })

  it('shows contribution counts with correct pluralization', () => {
    renderWidget({
      accountType: 'student',
      contributors: [
        { id: 1, username: 'ada', displayName: 'Ada', contributionCount: 1 },
        { id: 2, username: 'grace', displayName: 'Grace', contributionCount: 7 },
      ],
    })
    expect(screen.getByText(/^1 contribution$/)).toBeInTheDocument()
    expect(screen.getByText(/^7 contributions$/)).toBeInTheDocument()
  })

  it('links each contributor to their profile', () => {
    renderWidget({
      accountType: 'student',
      contributors: [{ id: 1, username: 'ada', displayName: 'Ada' }],
    })
    const link = screen.getByRole('link', { name: /Ada/i })
    expect(link.getAttribute('href')).toBe('/users/ada')
  })

  it('falls back to username when displayName is absent', () => {
    renderWidget({
      accountType: 'student',
      contributors: [{ id: 1, username: 'ada', contributionCount: 2 }],
    })
    expect(screen.getByText('ada')).toBeInTheDocument()
  })

  it('renders a contextLabel when contributionCount is absent', () => {
    renderWidget({
      accountType: 'other',
      contributors: [{ id: 1, username: 'ada', displayName: 'Ada', contextLabel: 'ML enthusiast' }],
    })
    expect(screen.getByText('ML enthusiast')).toBeInTheDocument()
  })

  it('defaults accountType to student when not provided (safe fallback)', () => {
    renderWidget({ contributors: [] })
    // Student empty copy mentions classmates.
    expect(screen.getByText(/classmates/i)).toBeInTheDocument()
  })
})
