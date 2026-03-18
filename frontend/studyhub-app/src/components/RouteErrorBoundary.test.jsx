import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RouteErrorBoundary from './RouteErrorBoundary'

vi.mock('../lib/telemetry', () => ({
  captureRouteCrash: vi.fn(() => 'evt-route-123'),
}))

function CrashyRoute() {
  throw new TypeError('t is not a function')
}

describe('RouteErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('renders a safe fallback with a telemetry reference id', () => {
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <RouteErrorBoundary>
          <CrashyRoute />
        </RouteErrorBoundary>
      </MemoryRouter>,
    )

    expect(screen.getByText('This page crashed.')).toBeInTheDocument()
    expect(screen.getByText(/Reference ID:/)).toHaveTextContent('evt-route-123')
    expect(screen.getByRole('button', { name: 'Retry Route' })).toBeInTheDocument()
  })
})
