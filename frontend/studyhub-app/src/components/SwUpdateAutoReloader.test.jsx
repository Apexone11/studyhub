import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import SwUpdateAutoReloader from './SwUpdateAutoReloader'
import { _resetForTests, markSwUpdateAvailable } from '../lib/swUpdateState'

// Test harness: renders the reloader plus two routes we can navigate
// between from a button, so we can drive the route-change path from
// inside React without fighting MemoryRouter's internal state.
function Harness({ initialPath = '/a' }) {
  return (
    <MemoryRouter initialEntries={[initialPath]}>
      <SwUpdateAutoReloader />
      <Routes>
        <Route path="/a" element={<NavButton to="/b" label="go-b" />} />
        <Route path="/b" element={<NavButton to="/a" label="go-a" />} />
      </Routes>
    </MemoryRouter>
  )
}

function NavButton({ to, label }) {
  const navigate = useNavigate()
  return (
    <button type="button" data-testid={label} onClick={() => navigate(to)}>
      {label}
    </button>
  )
}

describe('SwUpdateAutoReloader', () => {
  let reloadSpy
  let nowSpy

  beforeEach(() => {
    _resetForTests()
    reloadSpy = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload: reloadSpy },
    })
  })

  afterEach(() => {
    cleanup()
    if (nowSpy) {
      nowSpy.mockRestore()
      nowSpy = undefined
    }
    _resetForTests()
  })

  function advanceWallClockMs(ms) {
    const base = Date.now()
    nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => base + ms)
  }

  it('does not reload on initial mount', () => {
    render(<Harness />)
    expect(reloadSpy).not.toHaveBeenCalled()
  })

  it('does not reload on route change when no update is pending', async () => {
    const { getByTestId } = render(<Harness />)
    await act(async () => {
      getByTestId('go-b').click()
    })
    expect(reloadSpy).not.toHaveBeenCalled()
  })

  it('reloads on route change when an update was flagged past the grace window', async () => {
    const { getByTestId } = render(<Harness />)
    markSwUpdateAvailable()
    advanceWallClockMs(3000) // past the 2s grace
    await act(async () => {
      getByTestId('go-b').click()
    })
    expect(reloadSpy).toHaveBeenCalled()
    expect(reloadSpy.mock.calls.length).toBeGreaterThanOrEqual(1)
  })

  it('defers reload when the update was flagged inside the grace window', async () => {
    const { getByTestId } = render(<Harness />)
    markSwUpdateAvailable()
    // Don't advance the clock — still inside the 2s grace.
    await act(async () => {
      getByTestId('go-b').click()
    })
    expect(reloadSpy).not.toHaveBeenCalled()
  })

  it('reloads at most once even when multiple triggers fire', async () => {
    const { getByTestId } = render(<Harness />)
    markSwUpdateAvailable()
    advanceWallClockMs(3000)

    await act(async () => {
      getByTestId('go-b').click()
    })
    // A second navigation after the first reload guard is in place should
    // not fire a second reload — the browser would tear down the JS
    // context on the first call anyway, but in tests we need the guard
    // to prevent spurious duplicate calls.
    await act(async () => {
      getByTestId('go-a').click()
    })
    // Also simulate a visibility-visible event.
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(reloadSpy).toHaveBeenCalledTimes(1)
  })
})
