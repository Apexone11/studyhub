/**
 * ForYouSection.test.jsx — regression coverage for the A4 reconciliation
 * fix on the discovery cards (GROUP F audit, finding 6).
 *
 * Before the fix, PersonCard.handleFollow set the button to "Following" from
 * a local flag and never reconciled from the response — so following a
 * private account (which lands `requested: true`, not `following: true`)
 * incorrectly displayed "Following" instead of "Requested".
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { server } from '../../test/server'
import ForYouSection from './ForYouSection'

afterEach(() => {
  cleanup()
})

function renderForYou(people) {
  server.use(
    http.get('http://localhost:4000/api/feed/for-you', () =>
      HttpResponse.json({ sheets: [], groups: [], people, trending: [] }),
    ),
  )
  return render(
    <MemoryRouter>
      <ForYouSection />
    </MemoryRouter>,
  )
}

describe('ForYouSection PersonCard follow reconciliation (finding 6)', () => {
  it('shows "Requested" (not "Following") when a private-account follow lands pending', async () => {
    server.use(
      http.post('http://localhost:4000/api/users/:username/follow', () =>
        HttpResponse.json({ following: false, requested: true }),
      ),
    )

    renderForYou([{ id: 1, username: 'privacy_pat', avatarUrl: null, sharedCourses: 2 }])

    const followBtn = await screen.findByRole('button', { name: 'Follow' })
    await userEvent.click(followBtn)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Requested' })).toBeTruthy())
    expect(screen.queryByRole('button', { name: 'Following' })).toBeNull()
  })

  it('shows "Following" when an open-account follow lands active', async () => {
    server.use(
      http.post('http://localhost:4000/api/users/:username/follow', () =>
        HttpResponse.json({ following: true, followerCount: 12 }),
      ),
    )

    renderForYou([{ id: 2, username: 'open_olivia', avatarUrl: null, sharedCourses: 1 }])

    const followBtn = await screen.findByRole('button', { name: 'Follow' })
    await userEvent.click(followBtn)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Following' })).toBeTruthy())
  })

  it('leaves the button on "Follow" when the request fails', async () => {
    server.use(
      http.post('http://localhost:4000/api/users/:username/follow', () =>
        HttpResponse.json({ error: 'rate limited' }, { status: 429 }),
      ),
    )

    renderForYou([{ id: 3, username: 'flaky_fred', avatarUrl: null, sharedCourses: 0 }])

    const followBtn = await screen.findByRole('button', { name: 'Follow' })
    await userEvent.click(followBtn)

    // Still re-clickable; no false "Following" state on a rejected write.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Follow' })).toBeTruthy())
  })
})
