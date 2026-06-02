import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '../../test/server'
import { clearFetchCache } from '../../lib/useFetch'

// The page chrome (Navbar + AppSidebar) drags in session / chat / unread
// providers that aren't relevant to the Explore behavior under test. Stub
// them so the test stays focused on chips + shelves + topic refetch.
vi.mock('../../components/navbar/Navbar', () => ({
  default: () => <div data-testid="navbar" />,
}))
vi.mock('../../components/sidebar/AppSidebar', () => ({
  default: () => <div data-testid="sidebar" />,
}))

import ExplorePage from './ExplorePage'

const API = 'http://localhost:4000'

function topicsResponse() {
  return HttpResponse.json({
    topics: [
      { topicTag: 'calculus', displayName: 'Calculus', category: 'math', courseCount: 4 },
      { topicTag: 'algorithms', displayName: 'Algorithms', category: 'cs', courseCount: 3 },
    ],
  })
}

function shelfResponses(topic) {
  // When a topic filters, return a marker title so the test can assert the
  // refetch actually flowed the ?topic= param through.
  const suffix = topic ? ` (${topic})` : ''
  return {
    trending: HttpResponse.json({
      sheets: [
        {
          id: 11,
          title: `Trending Sheet${suffix}`,
          previewText: 'A hot sheet',
          stars: 9,
          createdAt: '2026-05-20T00:00:00.000Z',
          author: { username: 'alice' },
          course: { code: 'CMSC351' },
        },
      ],
    }),
    sheets: HttpResponse.json({
      sheets: [
        {
          id: 21,
          title: `Explore Sheet${suffix}`,
          previewText: 'Notes on big-O',
          stars: 2,
          createdAt: '2026-05-19T00:00:00.000Z',
          author: { username: 'bob' },
          course: { code: 'CMSC351' },
        },
      ],
    }),
    notes: HttpResponse.json({
      notes: [
        {
          id: 31,
          title: `Explore Note${suffix}`,
          previewText: 'Quick recap',
          createdAt: '2026-05-18T00:00:00.000Z',
          author: { username: 'carol' },
          course: { code: 'MATH140' },
        },
      ],
    }),
    groups: HttpResponse.json({
      groups: [
        {
          id: 41,
          name: `Explore Group${suffix}`,
          description: 'Weekly study',
          createdAt: '2026-05-17T00:00:00.000Z',
          course: { code: 'MATH140' },
          _count: { members: 5 },
        },
      ],
    }),
  }
}

function installHandlers({ onTopicRequest } = {}) {
  server.use(
    http.get(`${API}/api/courses/topics`, () => topicsResponse()),
    http.get(`${API}/api/explore/trending`, ({ request }) => {
      const topic = new URL(request.url).searchParams.get('topic') || ''
      if (topic && onTopicRequest) onTopicRequest(topic)
      return shelfResponses(topic).trending
    }),
    http.get(`${API}/api/explore/sheets`, ({ request }) => {
      const topic = new URL(request.url).searchParams.get('topic') || ''
      return shelfResponses(topic).sheets
    }),
    http.get(`${API}/api/explore/notes`, ({ request }) => {
      const topic = new URL(request.url).searchParams.get('topic') || ''
      return shelfResponses(topic).notes
    }),
    http.get(`${API}/api/explore/study-groups`, ({ request }) => {
      const topic = new URL(request.url).searchParams.get('topic') || ''
      return shelfResponses(topic).groups
    }),
  )
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/explore']}>
      <ExplorePage />
    </MemoryRouter>,
  )
}

describe('ExplorePage', () => {
  beforeEach(() => {
    // useFetch caches per cacheKey at module scope; clear so each test starts
    // from a cold cache and the MSW handlers actually run.
    clearFetchCache()
  })

  afterEach(() => {
    clearFetchCache()
  })

  it('renders topic chips and all four shelves', async () => {
    installHandlers()
    renderPage()

    // Topic chips (plus the "All topics" reset chip).
    expect(await screen.findByRole('button', { name: 'Filter by Calculus' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Filter by Algorithms' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show all topics' })).toBeInTheDocument()

    // Shelf headings.
    expect(screen.getByRole('heading', { name: /Trending this week/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Study sheets/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Notes/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Study groups/ })).toBeInTheDocument()

    // Shelf items resolve and cross-link to the right detail routes.
    const trendingLink = await screen.findByRole('link', { name: /Trending Sheet/ })
    expect(trendingLink).toHaveAttribute('href', '/sheets/11')
    expect(await screen.findByRole('link', { name: /Explore Note/ })).toHaveAttribute(
      'href',
      '/notes/31',
    )
    expect(await screen.findByRole('link', { name: /Explore Group/ })).toHaveAttribute(
      'href',
      '/study-groups/41',
    )
  })

  it('refetches shelves with ?topic= when a topic chip is clicked', async () => {
    const requested = []
    installHandlers({ onTopicRequest: (topic) => requested.push(topic) })
    const user = userEvent.setup()
    renderPage()

    await screen.findByRole('button', { name: 'Filter by Calculus' })

    await user.click(screen.getByRole('button', { name: 'Filter by Calculus' }))

    // The trending handler records the topic param, proving the click flowed
    // ?topic=calculus through to a refetch.
    await waitFor(() => expect(requested).toContain('calculus'))

    // The filtered marker title appears in the trending shelf.
    expect(
      await screen.findByRole('link', { name: /Trending Sheet \(calculus\)/ }),
    ).toBeInTheDocument()
  })

  it('shows a topic empty state with a reset action when a shelf is empty', async () => {
    server.use(
      http.get(`${API}/api/courses/topics`, () => topicsResponse()),
      http.get(`${API}/api/explore/trending`, () => HttpResponse.json({ sheets: [] })),
      http.get(`${API}/api/explore/sheets`, () => HttpResponse.json({ sheets: [] })),
      http.get(`${API}/api/explore/notes`, () => HttpResponse.json({ notes: [] })),
      http.get(`${API}/api/explore/study-groups`, () => HttpResponse.json({ groups: [] })),
    )
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Filter by Algorithms' }))

    const emptyMessages = await screen.findAllByText('No content for this topic yet.')
    expect(emptyMessages.length).toBeGreaterThan(0)

    // Each empty shelf offers a "Browse all topics" reset, which clears the filter.
    const resetButtons = screen.getAllByRole('button', { name: 'Browse all topics' })
    expect(resetButtons.length).toBeGreaterThan(0)
    await user.click(resetButtons[0])

    // After reset, the All-topics chip is the pressed one. aria-pressed lives
    // on the focusable button, not the inner Chip span.
    await waitFor(() => {
      const allButton = screen.getByRole('button', { name: 'Show all topics' })
      expect(allButton).toHaveAttribute('aria-pressed', 'true')
    })
  })

  it('reflects the active topic via aria-pressed on the topic button', async () => {
    installHandlers()
    const user = userEvent.setup()
    renderPage()

    const calcButton = await screen.findByRole('button', { name: 'Filter by Calculus' })
    // Initially "All topics" is pressed and no topic button is.
    expect(screen.getByRole('button', { name: 'Show all topics' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(calcButton).toHaveAttribute('aria-pressed', 'false')

    await user.click(calcButton)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Filter by Calculus' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
    })
    expect(screen.getByRole('button', { name: 'Show all topics' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('shows the disabled panel when the trending endpoint 503s (flag off)', async () => {
    server.use(
      http.get(`${API}/api/courses/topics`, () => topicsResponse()),
      http.get(`${API}/api/explore/trending`, () => new HttpResponse(null, { status: 503 })),
      http.get(`${API}/api/explore/sheets`, () => new HttpResponse(null, { status: 503 })),
      http.get(`${API}/api/explore/notes`, () => new HttpResponse(null, { status: 503 })),
      http.get(`${API}/api/explore/study-groups`, () => new HttpResponse(null, { status: 503 })),
    )
    renderPage()

    expect(
      await screen.findByText('Explore is not available right now. Check back soon.'),
    ).toBeInTheDocument()
    // No shelf headings render when the surface is disabled.
    expect(screen.queryByRole('heading', { name: /Trending this week/ })).not.toBeInTheDocument()
  })

  it('shows a per-shelf error affordance with a retry when one shelf fails', async () => {
    let trendingCalls = 0
    server.use(
      http.get(`${API}/api/courses/topics`, () => topicsResponse()),
      // Trending stays healthy so the surface is not treated as disabled.
      http.get(`${API}/api/explore/trending`, ({ request }) => {
        const topic = new URL(request.url).searchParams.get('topic') || ''
        return shelfResponses(topic).trending
      }),
      // Sheets fails the first time, then succeeds on retry.
      http.get(`${API}/api/explore/sheets`, ({ request }) => {
        trendingCalls += 1
        if (trendingCalls === 1) return new HttpResponse(null, { status: 500 })
        const topic = new URL(request.url).searchParams.get('topic') || ''
        return shelfResponses(topic).sheets
      }),
      http.get(`${API}/api/explore/notes`, ({ request }) => {
        const topic = new URL(request.url).searchParams.get('topic') || ''
        return shelfResponses(topic).notes
      }),
      http.get(`${API}/api/explore/study-groups`, ({ request }) => {
        const topic = new URL(request.url).searchParams.get('topic') || ''
        return shelfResponses(topic).groups
      }),
    )
    const user = userEvent.setup()
    renderPage()

    // The failed sheets shelf shows the distinct error copy, not the empty copy.
    expect(await screen.findByText("Couldn't load this section.")).toBeInTheDocument()

    // Retry refetches and the shelf recovers.
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('link', { name: /Explore Sheet/ })).toHaveAttribute(
      'href',
      '/sheets/21',
    )
  })
})
