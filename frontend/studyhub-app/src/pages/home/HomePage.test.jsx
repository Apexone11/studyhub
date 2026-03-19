import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import HomePage from './HomePage'

vi.mock('../../components/Navbar', () => ({
  default: () => <div data-testid="mock-navbar" />,
}))

vi.mock('../../lib/animations', () => ({
  fadeInOnScroll: vi.fn(),
}))

function SheetsLocationProbe() {
  const location = useLocation()

  return <div data-testid="sheets-location-probe">{`${location.pathname}${location.search}`}</div>
}

function renderHomePage() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/sheets" element={<SheetsLocationProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('HomePage', () => {
  it('navigates to the sheets page using the search query parameter', async () => {
    const user = userEvent.setup()

    renderHomePage()

    await user.type(screen.getByPlaceholderText('Search sheets, courses, topics...'), 'biology')
    await user.click(screen.getByRole('button', { name: 'Search' }))

    expect(await screen.findByTestId('sheets-location-probe')).toHaveTextContent('/sheets?search=biology')
  })
})