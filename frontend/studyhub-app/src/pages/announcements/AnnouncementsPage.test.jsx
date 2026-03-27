import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { server } from '../../test/server'
import AnnouncementsPage from './AnnouncementsPage'

vi.mock('../../components/Navbar', () => ({
  default: ({ actions }) => <div>{actions}</div>,
}))

vi.mock('../../components/AppSidebar', () => ({
  default: () => <div data-testid="app-sidebar" />,
}))

vi.mock('../../components/SafeJoyride', () => ({
  default: () => null,
}))

vi.mock('../../components/MentionText', () => ({
  default: ({ text }) => <>{text}</>,
}))

vi.mock('../../components/Icons', () => ({
  IconPlus: () => <span>+</span>,
}))

vi.mock('../../components/Skeleton', () => ({
  SkeletonFeed: () => <div data-testid="skeleton-feed" />,
}))

vi.mock('../../lib/session-context', () => ({
  useSession: () => ({
    user: {
      id: 42,
      username: 'studyhub_owner',
      role: 'admin',
    },
  }),
}))

vi.mock('../../lib/useTutorial', () => ({
  useTutorial: () => ({ joyrideProps: {} }),
}))

vi.mock('../../lib/tutorialSteps', () => ({
  ANNOUNCEMENTS_STEPS: [],
  TUTORIAL_VERSIONS: { announcements: 1 },
}))

vi.mock('../../lib/animations', () => ({
  staggerEntrance: vi.fn(),
}))

vi.mock('../../lib/usePageTitle', () => ({
  usePageTitle: vi.fn(),
}))

vi.mock('../shared/pageScaffold', () => ({
  PageShell: ({ nav, sidebar, children }) => (
    <div>
      {nav}
      {sidebar}
      {children}
    </div>
  ),
}))

function renderAnnouncementsPage() {
  return render(
    <MemoryRouter>
      <AnnouncementsPage />
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
})

describe('AnnouncementsPage', () => {
  it('loads announcements with credentials included', async () => {
    let requestCredentials = ''

    server.use(
      http.get('http://localhost:4000/api/announcements', ({ request }) => {
        requestCredentials = request.credentials
        return HttpResponse.json([])
      }),
    )

    renderAnnouncementsPage()

    await screen.findByText('No announcements yet')

    expect(requestCredentials).toBe('include')
  })

  it('posts announcements with credentials included', async () => {
    const user = userEvent.setup()
    let postCredentials = ''
    let postPayload = null

    server.use(
      http.get('http://localhost:4000/api/announcements', () => HttpResponse.json([])),
      http.post('http://localhost:4000/api/announcements', async ({ request }) => {
        postCredentials = request.credentials
        postPayload = await request.json()

        return HttpResponse.json({
          id: 99,
          title: postPayload.title,
          body: postPayload.body,
          pinned: postPayload.pinned,
          createdAt: '2026-03-22T12:00:00.000Z',
          author: { id: 42, username: 'studyhub_owner' },
        })
      }),
    )

    renderAnnouncementsPage()

    await screen.findByText('No announcements yet')

    await user.click(screen.getByRole('button', { name: /Post Announcement/i }))
    await user.type(screen.getByPlaceholderText('Announcement title'), 'Service update')
    await user.type(screen.getByPlaceholderText('Write the announcement body…'), 'Beta stack is healthy again.')
    await user.click(screen.getByRole('button', { name: 'Post' }))

    await screen.findByText('Service update')

    await waitFor(() => {
      expect(postCredentials).toBe('include')
      expect(postPayload).toMatchObject({
        title: 'Service update',
        body: 'Beta stack is healthy again.',
        pinned: false,
      })
    })
  })
})