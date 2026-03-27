import '@testing-library/jest-dom/vitest'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from './server'

beforeAll(() => {
  server.use(
    http.get('http://localhost:4000/api/auth/me', () => (
      HttpResponse.json({ error: 'Unauthorized' }, { status: 401 })
    )),
  )
  server.listen({ onUnhandledRequest: 'error' })
})

afterEach(() => {
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