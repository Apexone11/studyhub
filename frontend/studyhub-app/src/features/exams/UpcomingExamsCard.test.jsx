/**
 * UpcomingExamsCard — component tests for load / empty / error / happy-path.
 *
 * The component fetches `/api/exams/upcoming?limit=N` with credentials
 * included (part of the cookie-based auth story). We mock the endpoint
 * via MSW and assert the four states defined by the tech-debt handoff
 * §13.
 */

import { render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '../../test/server'
import UpcomingExamsCard from './UpcomingExamsCard'

describe('UpcomingExamsCard', () => {
  it('renders the loading skeleton while the fetch is in flight', async () => {
    // Never resolve — leaves the component in loading state long enough
    // for the test to assert aria-busy.
    server.use(http.get('http://localhost:4000/api/exams/upcoming', () => new Promise(() => {})))

    render(<UpcomingExamsCard limit={3} />)

    // As of Day 2 the card delegates its loading state to <SkeletonCard>
    // from the ui kit, which renders role="status" + aria-busy="true".
    const skeleton = await screen.findByRole('status')
    expect(skeleton).toHaveAttribute('aria-busy', 'true')
  })

  it('renders the empty-state copy + Add exam CTA when the API returns no exams', async () => {
    server.use(
      http.get('http://localhost:4000/api/exams/upcoming', () => HttpResponse.json({ exams: [] })),
    )

    render(<UpcomingExamsCard limit={3} />)

    await waitFor(() => {
      expect(screen.getByText(/No exams coming up/i)).toBeInTheDocument()
    })
    // Day 4 added the write path: empty state exposes an Add-exam CTA
    // so a real user without seeded exams can actually track one.
    expect(screen.getByRole('button', { name: /add exam/i })).toBeInTheDocument()
  })

  it('renders the error-state copy when the API returns a 500', async () => {
    server.use(
      http.get('http://localhost:4000/api/exams/upcoming', () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 }),
      ),
    )

    render(<UpcomingExamsCard limit={3} />)

    await waitFor(() => {
      expect(screen.getByText(/could not load your exams/i)).toBeInTheDocument()
    })
  })

  it('renders the happy-path list when the API returns exam rows', async () => {
    server.use(
      http.get('http://localhost:4000/api/exams/upcoming', () =>
        HttpResponse.json({
          exams: [
            {
              id: 1,
              title: 'Midterm — Discrete Math',
              examDate: '2026-04-28T14:00:00Z',
              courseCode: 'CMSC250',
            },
            {
              id: 2,
              title: 'Final — Linear Algebra',
              examDate: '2026-05-12T10:00:00Z',
              courseCode: 'MATH240',
            },
          ],
        }),
      ),
    )

    render(<UpcomingExamsCard limit={3} />)

    await waitFor(() => {
      expect(screen.getByText('Midterm — Discrete Math')).toBeInTheDocument()
    })
    expect(screen.getByText('Final — Linear Algebra')).toBeInTheDocument()
    // The date-badge text is rendered in uppercase month + 2-digit day.
    // Assert presence of two month badges to prove the list rendered fully.
    expect(screen.getAllByText(/APR|MAY/).length).toBeGreaterThanOrEqual(2)
  })

  it('sends credentials with the fetch so the auth cookie is included', async () => {
    let seen = ''
    server.use(
      http.get('http://localhost:4000/api/exams/upcoming', ({ request }) => {
        seen = request.credentials
        return HttpResponse.json({ exams: [] })
      }),
    )

    render(<UpcomingExamsCard limit={3} />)

    await waitFor(() => {
      expect(seen).toBe('include')
    })
  })

  it('renders a preparedness bar at the correct width when preparednessPercent=62', async () => {
    server.use(
      http.get('http://localhost:4000/api/exams/upcoming', () =>
        HttpResponse.json({
          exams: [
            {
              id: 7,
              title: 'Biology Midterm',
              examDate: '2026-05-05T14:00:00Z',
              courseCode: 'BIOL201',
              preparednessPercent: 62,
            },
          ],
        }),
      ),
    )

    render(<UpcomingExamsCard limit={3} />)

    await waitFor(() => {
      expect(screen.getByText('Biology Midterm')).toBeInTheDocument()
    })
    const bar = screen.getByTestId('exam-preparedness-7')
    expect(bar).toHaveAttribute('role', 'progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '62')
    // The inner <div> carries the width, not the outer role=progressbar.
    // firstElementChild over firstChild so that a whitespace text node
    // introduced by future JSX formatting wouldn't make this flake.
    const fill = bar.firstElementChild
    expect(fill).toHaveStyle({ width: '62%' })
    // Sanity: the "62% prepared" label is visible.
    expect(screen.getByText(/62% prepared/i)).toBeInTheDocument()
  })

  it('renders "0% prepared" for a new exam with the default value', async () => {
    server.use(
      http.get('http://localhost:4000/api/exams/upcoming', () =>
        HttpResponse.json({
          exams: [
            {
              id: 11,
              title: 'CMSC131 Final',
              examDate: '2026-06-08T10:00:00Z',
              courseCode: 'CMSC131',
              preparednessPercent: 0,
            },
          ],
        }),
      ),
    )

    render(<UpcomingExamsCard limit={3} />)

    await waitFor(() => {
      expect(screen.getByText('CMSC131 Final')).toBeInTheDocument()
    })
    expect(screen.getByText(/0% prepared/i)).toBeInTheDocument()
    const bar = screen.getByTestId('exam-preparedness-11')
    expect(bar).toHaveAttribute('aria-valuenow', '0')
    expect(bar.firstElementChild).toHaveStyle({ width: '0%' })
  })

  it('exposes per-row Edit and Delete buttons when exams exist (Day 4 write path)', async () => {
    server.use(
      http.get('http://localhost:4000/api/exams/upcoming', () =>
        HttpResponse.json({
          exams: [
            {
              id: 99,
              title: 'Physics Midterm',
              examDate: '2026-05-20T14:00:00Z',
              courseCode: 'PHYS101',
              preparednessPercent: 40,
            },
          ],
        }),
      ),
    )

    render(<UpcomingExamsCard limit={3} />)

    await waitFor(() => {
      expect(screen.getByText('Physics Midterm')).toBeInTheDocument()
    })

    // Each exam row has an aria-labelled Edit + Delete button so
    // keyboard users can find them without a hover menu. Real UI
    // stores the exam title in aria-label, so the button is
    // addressable by the specific exam even when multiple rows
    // are on screen.
    expect(screen.getByRole('button', { name: /edit physics midterm/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete physics midterm/i })).toBeInTheDocument()
  })

  it('clamps out-of-range percentages to [0, 100]', async () => {
    server.use(
      http.get('http://localhost:4000/api/exams/upcoming', () =>
        HttpResponse.json({
          exams: [
            {
              id: 20,
              title: 'Weird row',
              examDate: '2026-07-01T10:00:00Z',
              courseCode: 'XX',
              preparednessPercent: 999,
            },
            {
              id: 21,
              title: 'Another weird row',
              examDate: '2026-07-02T10:00:00Z',
              courseCode: 'XX',
              preparednessPercent: -15,
            },
          ],
        }),
      ),
    )

    render(<UpcomingExamsCard limit={3} />)

    await waitFor(() => {
      expect(screen.getByText('Weird row')).toBeInTheDocument()
    })
    expect(screen.getByTestId('exam-preparedness-20')).toHaveAttribute('aria-valuenow', '100')
    expect(screen.getByTestId('exam-preparedness-21')).toHaveAttribute('aria-valuenow', '0')
  })
})
