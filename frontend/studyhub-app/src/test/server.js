import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'

// Default handlers persist across `server.resetHandlers()` calls. Tests that
// need a specific response can override these by calling `server.use(...)`.
export const server = setupServer(
  http.get('http://localhost:4000/api/auth/me', () =>
    HttpResponse.json({ error: 'Unauthorized' }, { status: 401 }),
  ),
  // Feature-flag evaluation — default to disabled so components render their
  // legacy paths unless a test opts-in to a specific flag state.
  http.get('http://localhost:4000/api/flags/evaluate/:flag', ({ params }) =>
    HttpResponse.json({ flag: params.flag, enabled: false }),
  ),
)
