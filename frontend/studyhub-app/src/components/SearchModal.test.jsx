import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { server } from '../test/server'
import SearchModal from './SearchModal'

function LocationProbe() {
  const location = useLocation()

  return <div data-testid="location-probe">{`${location.pathname}${location.search}`}</div>
}

function renderSearchModal(onClose = vi.fn()) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <SearchModal open onClose={onClose} />
      <LocationProbe />
    </MemoryRouter>,
  )
}

describe('SearchModal', () => {
  it('navigates to the sheets page using courseId when a course result is clicked', async () => {
    const user = userEvent.setup()
    let requestCredentials = ''

    server.use(
      http.get('http://localhost:4000/api/search', ({ request }) => {
        const url = new URL(request.url)
        const query = url.searchParams.get('q') || ''
        requestCredentials = request.credentials

        if (query !== 'cmsc') {
          return HttpResponse.json({ results: { sheets: [], courses: [], users: [] } })
        }

        return HttpResponse.json({
          results: {
            sheets: [],
            courses: [
              {
                id: 101,
                code: 'CMSC101',
                name: 'Intro to Programming',
                school: { id: 1, name: 'University Test', short: 'UT' },
              },
            ],
            users: [],
          },
        })
      }),
    )

    renderSearchModal()

    await user.type(screen.getByPlaceholderText('Search sheets, notes, courses, users...'), 'cmsc')

    await user.click(
      await screen.findByText((content, element) =>
        element?.textContent === 'CMSC101 — Intro to Programming',
      ),
    )

    await waitFor(() => {
      expect(requestCredentials).toBe('include')
      expect(screen.getByTestId('location-probe')).toHaveTextContent('/sheets?courseId=101')
    })
  })
})