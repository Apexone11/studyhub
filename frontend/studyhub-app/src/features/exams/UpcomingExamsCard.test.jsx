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

    const loadingList = await screen.findByRole('list', { hidden: true })
    expect(loadingList).toHaveAttribute('aria-busy', 'true')
  })

  it('renders the empty-state copy when the API returns no exams', async () => {
    server.use(
      http.get('http://localhost:4000/api/exams/upcoming', () => HttpResponse.json({ exams: [] })),
    )

    render(<UpcomingExamsCard limit={3} />)

    await waitFor(() => {
      expect(screen.getByText(/No exams coming up/i)).toBeInTheDocument()
    })
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
})
