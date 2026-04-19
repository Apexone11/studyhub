import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'
import { server } from './server'

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' })
})

afterEach(() => {
  // RTL cleanup is NOT automatic under Vitest; previous containers would
  // otherwise leak into subsequent tests. Discovered when v2 async flag
  // hooks began re-rendering leaked containers with stale module-level
  // mock state (see docs/internal/beta-v2.0.0-release-log.md, 2026-04-19).
  cleanup()
  server.resetHandlers()
  localStorage.clear()
})

afterAll(() => {
  server.close()
})

if (!window.scrollTo) {
  window.scrollTo = vi.fn()
}

if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}
