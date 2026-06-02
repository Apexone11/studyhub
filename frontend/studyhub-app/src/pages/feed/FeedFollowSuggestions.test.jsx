// CLAUDE.md A4 regression. The
// follow button must hydrate its label from the server response body
// (`{ following, requested }`) rather than the requested optimistic value.
// Private accounts return `{ following: false, requested: true }` so the
// UI must distinguish "Pending" from "Following".
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { server } from '../../test/server'
import FeedFollowSuggestions from './FeedFollowSuggestions'

vi.mock('../../lib/toast', () => ({
  showToast: vi.fn(),
}))

import { showToast } from '../../lib/toast'

const SUGGESTIONS = [
  {
    id: 42,
    username: 'alice',
    avatarUrl: null,
    displayName: 'Alice',
    followerCount: 3,
  },
]

function mockSuggestions() {
  server.use(
    http.get('http://localhost:4000/api/users/me/follow-suggestions', () =>
      HttpResponse.json(SUGGESTIONS),
    ),
  )
}

function renderWidget() {
  return render(
    <MemoryRouter>
      <FeedFollowSuggestions accountType="student" />
    </MemoryRouter>,
  )
}

describe('FeedFollowSuggestions follow handler hydration (CLAUDE.md A4)', () => {
  it('shows "Pending" when server returns { requested: true, following: false }', async () => {
    mockSuggestions()
    server.use(
      http.post('http://localhost:4000/api/users/alice/follow', () =>
        HttpResponse.json({ requested: true, following: false }),
      ),
    )
    const user = userEvent.setup()
    renderWidget()

    const followBtn = await screen.findByRole('button', { name: 'Follow' })
    await user.click(followBtn)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Pending' })).toBeInTheDocument()
    })
  })

  it('shows "Following" when server returns { requested: false, following: true }', async () => {
    mockSuggestions()
    server.use(
      http.post('http://localhost:4000/api/users/alice/follow', () =>
        HttpResponse.json({ requested: false, following: true }),
      ),
    )
    const user = userEvent.setup()
    renderWidget()

    const followBtn = await screen.findByRole('button', { name: 'Follow' })
    await user.click(followBtn)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Following' })).toBeInTheDocument()
    })
  })

  it('keeps the "Follow" label and toasts an error when the request fails', async () => {
    mockSuggestions()
    server.use(
      http.post('http://localhost:4000/api/users/alice/follow', () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 }),
      ),
    )
    const user = userEvent.setup()
    renderWidget()

    const followBtn = await screen.findByRole('button', { name: 'Follow' })
    await user.click(followBtn)

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('Could not follow. Please try again.', 'error')
    })
    expect(screen.queryByRole('button', { name: 'Following' })).not.toBeInTheDocument()
  })
})
