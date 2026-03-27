# Sec-1 Session Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Best-effort tab-close logout, tighter 401 handling, and professional session-expired/logout messaging.

**Architecture:** All changes layer into the existing session-context.jsx (session lifecycle authority). Backend change is a one-line CSRF exemption. Frontend changes: pagehide beacon listener, session-expired modal replacing toast, redundant 401 check cleanup, and logout flag on LoginPage.

**Tech Stack:** Express middleware (backend), React context + DOM events (frontend), Vitest + Supertest (tests)

---

### Task 1: Exempt logout from CSRF (backend)

**Files:**
- Modify: `backend/src/middleware/csrf.js:8-12`
- Test: `backend/test/releaseA.stability.middleware.test.js`

- [ ] **Step 1: Write the failing test**

Add to the end of the `describe('release A middleware response envelope', ...)` block in `backend/test/releaseA.stability.middleware.test.js`:

```javascript
it('allows POST /api/auth/logout without CSRF token (exempt)', async () => {
  const app = express()
  app.use(buildTestRateLimiter())
  app.use(csrfProtection)
  app.post('/api/auth/logout', (req, res) => res.status(200).json({ message: 'Logged out.' }))

  const response = await request(app)
    .post('/api/auth/logout')
    .set('Cookie', [`${AUTH_COOKIE_NAME}=${authToken()}`])

  expect(response.status).toBe(200)
  expect(response.body).toMatchObject({ message: 'Logged out.' })
})

it('logout is idempotent — calling twice returns 200 both times', async () => {
  const app = express()
  app.use(buildTestRateLimiter())
  app.use(csrfProtection)
  app.post('/api/auth/logout', (req, res) => res.status(200).json({ message: 'Logged out.' }))

  const first = await request(app)
    .post('/api/auth/logout')
    .set('Cookie', [`${AUTH_COOKIE_NAME}=${authToken()}`])
  const second = await request(app)
    .post('/api/auth/logout')

  expect(first.status).toBe(200)
  expect(second.status).toBe(200)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix backend test -- --reporter verbose 2>&1 | tail -30`

Expected: The first test fails with status 403 (`Missing CSRF token.`) because logout is not yet exempted.

- [ ] **Step 3: Add logout to CSRF skip list**

In `backend/src/middleware/csrf.js`, change the `AUTH_BOOTSTRAP_PREFIXES` array:

```javascript
const AUTH_BOOTSTRAP_PREFIXES = [
  '/api/auth/login',
  '/api/auth/google',
  '/api/auth/register',
  '/api/auth/logout',
]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix backend test -- --reporter verbose 2>&1 | tail -30`

Expected: All tests pass including the two new ones.

- [ ] **Step 5: Commit**

```bash
git add backend/src/middleware/csrf.js backend/test/releaseA.stability.middleware.test.js
git commit -m "feat(auth): exempt /api/auth/logout from CSRF for sendBeacon support"
```

---

### Task 2: Add logged-out flag to logoutSession (frontend)

**Files:**
- Modify: `frontend/studyhub-app/src/lib/session.js:54-62`

- [ ] **Step 1: Add logged-out sessionStorage flag**

In `frontend/studyhub-app/src/lib/session.js`, add the flag constant at the top (after the `inMemoryCsrfToken` declaration) and set it in `logoutSession()`:

Add after line 2:
```javascript
export const LOGGED_OUT_FLAG = 'studyhub:logged-out'
```

Change `logoutSession()` from:

```javascript
export async function logoutSession() {
  try {
    await fetch(`${API}/api/auth/logout`, { method: 'POST' })
  } catch {
    // Best effort only — always clear local cached user state.
  } finally {
    clearStoredSession()
  }
}
```

To:

```javascript
export async function logoutSession() {
  try {
    await fetch(`${API}/api/auth/logout`, { method: 'POST' })
  } catch {
    // Best effort only — always clear local cached user state.
  } finally {
    clearStoredSession()
    try { sessionStorage.setItem(LOGGED_OUT_FLAG, '1') } catch { /* private mode */ }
  }
}
```

- [ ] **Step 2: Run frontend lint**

Run: `npm --prefix frontend/studyhub-app run lint`

Expected: Clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/studyhub-app/src/lib/session.js
git commit -m "feat(auth): set logged-out flag in sessionStorage on intentional logout"
```

---

### Task 3: Add pagehide beacon + session-expired modal to session-context

**Files:**
- Modify: `frontend/studyhub-app/src/lib/session-context.jsx`

- [ ] **Step 1: Add pagehide listener**

In `frontend/studyhub-app/src/lib/session-context.jsx`, add a new `useEffect` inside `SessionProvider`, after the existing `AUTH_SESSION_EXPIRED_EVENT` listener (after line 154):

```jsx
  // Best-effort logout on tab close / page exit
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    if (status !== 'authenticated') return undefined

    const handlePageHide = () => {
      navigator.sendBeacon(`${API}/api/auth/logout`)
      clearStoredSession()
    }

    window.addEventListener('pagehide', handlePageHide)
    return () => {
      window.removeEventListener('pagehide', handlePageHide)
    }
  }, [status])
```

- [ ] **Step 2: Add sessionExpiredVisible state and replace toast handler with modal state**

Add state declaration after the existing `useState` calls (after line 66):

```jsx
const [sessionExpiredVisible, setSessionExpiredVisible] = useState(false)
```

Replace the existing `AUTH_SESSION_EXPIRED_EVENT` handler (lines 140-154):

From:
```jsx
  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const handleAuthExpired = () => {
      /* Mark the expiry so LoginPage can show a contextual banner */
      try { sessionStorage.setItem(SESSION_EXPIRED_FLAG, '1') } catch { /* private mode */ }
      showToast('Your session has expired. Please sign in again.', 'error', 5000)
      clearSession()
    }

    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, handleAuthExpired)
    return () => {
      window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, handleAuthExpired)
    }
  }, [clearSession])
```

To:
```jsx
  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const handleAuthExpired = () => {
      try { sessionStorage.setItem(SESSION_EXPIRED_FLAG, '1') } catch { /* private mode */ }
      clearSession()
      setSessionExpiredVisible(true)
    }

    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, handleAuthExpired)
    return () => {
      window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, handleAuthExpired)
    }
  }, [clearSession])
```

- [ ] **Step 3: Add SessionExpiredModal component and render it**

Add the `SessionExpiredModal` function component above the `SessionProvider` function (before line 63):

```jsx
function SessionExpiredModal({ visible, onDismiss }) {
  useEffect(() => {
    if (!visible) return undefined
    const handleKey = (e) => { if (e.key === 'Escape') onDismiss('/') }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [visible, onDismiss])

  if (!visible) return null

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        background: 'rgba(15, 23, 42, 0.5)',
        display: 'grid', placeItems: 'center', padding: 24,
      }}
      onClick={() => onDismiss('/')}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Session expired"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--sh-surface, #fff)',
          border: '1px solid var(--sh-border, #e2e8f0)',
          borderRadius: 18, padding: 28,
          width: '100%', maxWidth: 400,
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.2)',
          fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        }}
      >
        <h2 style={{ margin: '0 0 8px', fontSize: 18, color: 'var(--sh-heading, #0f172a)' }}>
          Your session has expired
        </h2>
        <p style={{ margin: '0 0 20px', fontSize: 13, lineHeight: 1.6, color: 'var(--sh-muted, #64748b)' }}>
          For your security, your session ended. Please sign in again to continue.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={() => onDismiss('/')}
            style={{
              padding: '9px 16px', borderRadius: 10,
              border: '1px solid var(--sh-border, #e2e8f0)',
              background: 'var(--sh-surface, #fff)',
              color: 'var(--sh-muted, #64748b)',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Go to Home
          </button>
          <button
            type="button"
            onClick={() => onDismiss('/login')}
            style={{
              padding: '9px 16px', borderRadius: 10, border: 'none',
              background: 'linear-gradient(135deg, #6366f1, #818cf8)',
              color: '#fff',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Sign in again
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Wire the modal into the SessionProvider render**

Add `useNavigate` import at the top of the file:

```jsx
import { useNavigate } from 'react-router-dom'
```

Inside `SessionProvider`, add a navigate reference and dismiss handler before the `value` memo (before the `const value = useMemo(...)` line):

```jsx
  const navigateRef = useRef(null)
  try { navigateRef.current = useNavigate() } catch { /* outside router */ }

  const dismissSessionExpired = useCallback((path) => {
    setSessionExpiredVisible(false)
    if (navigateRef.current) navigateRef.current(path, { replace: true })
  }, [])
```

Change the return JSX from:

```jsx
  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  )
```

To:

```jsx
  return (
    <SessionContext.Provider value={value}>
      {children}
      <SessionExpiredModal visible={sessionExpiredVisible} onDismiss={dismissSessionExpired} />
    </SessionContext.Provider>
  )
```

- [ ] **Step 5: Remove the now-unused showToast import**

Remove `showToast` from the imports at the top of the file:

```jsx
import { showToast } from './toast'
```

Remove that entire line (the toast import is no longer used in this file).

- [ ] **Step 6: Run frontend lint**

Run: `npm --prefix frontend/studyhub-app run lint`

Expected: Clean.

- [ ] **Step 7: Run frontend build**

Run: `npm --prefix frontend/studyhub-app run build 2>&1 | tail -5`

Expected: Build succeeds.

- [ ] **Step 8: Commit**

```bash
git add frontend/studyhub-app/src/lib/session-context.jsx
git commit -m "feat(auth): add pagehide beacon logout + session-expired modal"
```

---

### Task 4: Add logged-out banner to LoginPage

**Files:**
- Modify: `frontend/studyhub-app/src/pages/auth/LoginPage.jsx`

- [ ] **Step 1: Import the logged-out flag**

In `frontend/studyhub-app/src/pages/auth/LoginPage.jsx`, change line 19 from:

```jsx
import { useSession, SESSION_EXPIRED_FLAG } from '../../lib/session-context'
```

To:

```jsx
import { useSession, SESSION_EXPIRED_FLAG } from '../../lib/session-context'
import { LOGGED_OUT_FLAG } from '../../lib/session'
```

- [ ] **Step 2: Add loggedOut state**

After line 33 (`const [sessionExpired, setSessionExpired] = useState(false)`), add:

```jsx
const [loggedOut, setLoggedOut] = useState(false)
```

- [ ] **Step 3: Extend the flag-detection useEffect**

Change the existing useEffect (lines 36-43) from:

```jsx
  useEffect(() => {
    try {
      if (sessionStorage.getItem(SESSION_EXPIRED_FLAG)) {
        setSessionExpired(true)
        sessionStorage.removeItem(SESSION_EXPIRED_FLAG)
      }
    } catch { /* private mode */ }
  }, [])
```

To:

```jsx
  useEffect(() => {
    try {
      if (sessionStorage.getItem(SESSION_EXPIRED_FLAG)) {
        setSessionExpired(true)
        sessionStorage.removeItem(SESSION_EXPIRED_FLAG)
      }
      if (sessionStorage.getItem(LOGGED_OUT_FLAG)) {
        setLoggedOut(true)
        sessionStorage.removeItem(LOGGED_OUT_FLAG)
      }
    } catch { /* private mode */ }
  }, [])
```

- [ ] **Step 4: Add logged-out banner**

After the session-expired banner (after line 150), add:

```jsx
          {loggedOut && !sessionExpired && (
            <div role="status" className="login-alert login-alert--info">
              You've been signed out.
            </div>
          )}
```

Note: `!sessionExpired` prevents both banners from showing simultaneously (session-expired takes priority).

- [ ] **Step 5: Run frontend lint**

Run: `npm --prefix frontend/studyhub-app run lint`

Expected: Clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/studyhub-app/src/pages/auth/LoginPage.jsx
git commit -m "feat(auth): show distinct banner for intentional logout vs session expiry"
```

---

### Task 5: Remove redundant 401 checks from components

**Files:**
- Modify: `frontend/studyhub-app/src/pages/dashboard/useDashboardData.js:55-59`
- Modify: `frontend/studyhub-app/src/pages/feed/useFeedData.js:48-51`
- Modify: `frontend/studyhub-app/src/pages/preview/SheetHtmlPreviewPage.jsx:48-52`
- Modify: `frontend/studyhub-app/src/pages/preview/AttachmentPreviewPage.jsx:123-127`
- Modify: `frontend/studyhub-app/src/pages/admin/SheetReviewPanel.jsx:39-42`

- [ ] **Step 1: Remove auth check from useDashboardData.js**

In `frontend/studyhub-app/src/pages/dashboard/useDashboardData.js`, remove lines 55-59:

```javascript
      if (isAuthSessionFailure(response, data)) {
        clearSession()
        navigate('/login', { replace: true })
        return
      }
```

Also remove the unused imports that this creates. Check if `isAuthSessionFailure` is used elsewhere in the file — if not, remove it from the import. Similarly for `clearSession` and `navigate` if they become unused.

- [ ] **Step 2: Remove auth check from useFeedData.js**

In `frontend/studyhub-app/src/pages/feed/useFeedData.js`, remove lines 48-51:

```javascript
      if (isAuthSessionFailure(response, data)) {
        clearSession()
        return
      }
```

Remove unused imports (`isAuthSessionFailure`, `clearSession`) if they have no other references in the file.

- [ ] **Step 3: Remove auth check from SheetHtmlPreviewPage.jsx**

In `frontend/studyhub-app/src/pages/preview/SheetHtmlPreviewPage.jsx`, remove lines 48-52:

```javascript
      if (isAuthSessionFailure(response, data)) {
        clearSession()
        navigate('/login', { replace: true })
        return
      }
```

Remove unused imports if applicable.

- [ ] **Step 4: Remove auth check from AttachmentPreviewPage.jsx**

In `frontend/studyhub-app/src/pages/preview/AttachmentPreviewPage.jsx`, remove lines 123-127:

```javascript
      if (isAuthSessionFailure(response, data)) {
        clearSession()
        navigate('/login', { replace: true })
        return
      }
```

Remove unused imports if applicable.

- [ ] **Step 5: Remove auth check from SheetReviewPanel.jsx**

In `frontend/studyhub-app/src/pages/admin/SheetReviewPanel.jsx`, remove lines 39-42:

```javascript
      if (response.status === 401) {
        clearSession()
        return
      }
```

Remove unused `clearSession` import/destructure if it has no other references.

- [ ] **Step 6: Run frontend lint**

Run: `npm --prefix frontend/studyhub-app run lint`

Expected: Clean. If lint reports unused imports, remove them and re-run.

- [ ] **Step 7: Run frontend build**

Run: `npm --prefix frontend/studyhub-app run build 2>&1 | tail -5`

Expected: Build succeeds.

- [ ] **Step 8: Commit**

```bash
git add frontend/studyhub-app/src/pages/dashboard/useDashboardData.js \
       frontend/studyhub-app/src/pages/feed/useFeedData.js \
       frontend/studyhub-app/src/pages/preview/SheetHtmlPreviewPage.jsx \
       frontend/studyhub-app/src/pages/preview/AttachmentPreviewPage.jsx \
       frontend/studyhub-app/src/pages/admin/SheetReviewPanel.jsx
git commit -m "refactor(auth): remove redundant per-component 401 checks — global handler covers all"
```

---

### Task 6: Audit bootstrap 401 and protected route behavior

**Files:**
- Read-only audit: `frontend/studyhub-app/src/lib/session-context.jsx`
- Read-only audit: `frontend/studyhub-app/src/App.jsx`

- [ ] **Step 1: Verify bootstrap 401 does not set error**

Read `session-context.jsx` and confirm that `refreshSession()` on 401 (via `fetchSessionUser()` returning `status: 'unauthenticated'`) sets `status = 'unauthenticated'` and `error = ''` — not an error string. The current code at lines 87-93 does this correctly:

```javascript
if (result.status === 'unauthenticated') {
  clearStoredSession()
  setUser(null)
  setStatus('unauthenticated')
  setError('')
  return
}
```

Confirm this is unchanged.

- [ ] **Step 2: Verify PrivateRoute redirects cleanly**

Read `App.jsx` and confirm `PrivateRoute` handles unauthenticated users without a white screen. The current code:

```javascript
function PrivateRoute({ children }) {
  const { isBootstrapping, isAuthenticated } = useSession()
  if (isBootstrapping) return <RouteFallback />
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <RouteErrorBoundary>{children}</RouteErrorBoundary>
}
```

This is correct — shows fallback during bootstrap, redirects to login when unauthenticated.

- [ ] **Step 3: Document audit result**

No code changes needed. Both paths are already correct.

---

### Task 7: Frontend unit tests for session hardening

**Files:**
- Modify: `frontend/studyhub-app/src/lib/session-context.test.jsx`

- [ ] **Step 1: Add session-expired modal and pagehide tests**

Add to the existing test file `frontend/studyhub-app/src/lib/session-context.test.jsx`. The file already imports from `@testing-library/react`, `vitest`, `msw`, and wraps components in `SessionProvider`.

Since `SessionProvider` now uses `useNavigate`, all renders need a Router wrapper. Add `MemoryRouter` to imports and wrap existing tests.

Update the imports at the top of the file:

```jsx
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { SessionProvider, useSession } from './session-context'
import { server } from '../test/server'
import { AUTH_SESSION_EXPIRED_EVENT } from './http'
```

Wrap the existing `SessionProbe` renders and the two existing tests with `<MemoryRouter>`:

In the first test (`clears the cached session when auth refresh returns 401`), change the render call to:

```jsx
    render(
      <MemoryRouter>
        <SessionProvider>
          <SessionProbe />
        </SessionProvider>
      </MemoryRouter>,
    )
```

Do the same for the second test (`keeps the cached session when auth refresh returns 403`).

Then add a new describe block at the end of the file:

```jsx
describe('Session-expired modal', () => {
  it('shows modal when AUTH_SESSION_EXPIRED_EVENT fires', async () => {
    seedUser()

    server.use(
      http.get('http://localhost:4000/api/auth/me', () => (
        HttpResponse.json({
          id: 7, username: 'beta_student1', role: 'student',
          email: 'beta_student1@studyhub.test',
        })
      )),
    )

    render(
      <MemoryRouter>
        <SessionProvider>
          <SessionProbe />
        </SessionProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('authenticated')
    })

    // Fire the session-expired event
    window.dispatchEvent(new Event(AUTH_SESSION_EXPIRED_EVENT))

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    expect(screen.getByText('Your session has expired')).toBeInTheDocument()
    expect(screen.getByText('Sign in again')).toBeInTheDocument()
    expect(screen.getByText('Go to Home')).toBeInTheDocument()
  })
})

describe('pagehide beacon logout', () => {
  it('calls sendBeacon on pagehide when authenticated', async () => {
    seedUser()
    const beaconSpy = vi.fn(() => true)
    navigator.sendBeacon = beaconSpy

    server.use(
      http.get('http://localhost:4000/api/auth/me', () => (
        HttpResponse.json({
          id: 7, username: 'beta_student1', role: 'student',
          email: 'beta_student1@studyhub.test',
        })
      )),
    )

    render(
      <MemoryRouter>
        <SessionProvider>
          <SessionProbe />
        </SessionProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('authenticated')
    })

    window.dispatchEvent(new Event('pagehide'))

    expect(beaconSpy).toHaveBeenCalledWith('http://localhost:4000/api/auth/logout')
  })

  it('does NOT call sendBeacon on pagehide when unauthenticated', async () => {
    const beaconSpy = vi.fn(() => true)
    navigator.sendBeacon = beaconSpy

    render(
      <MemoryRouter>
        <SessionProvider>
          <SessionProbe />
        </SessionProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated')
    })

    window.dispatchEvent(new Event('pagehide'))

    expect(beaconSpy).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the tests**

Run: `npm --prefix frontend/studyhub-app run test -- --reporter verbose 2>&1 | tail -30`

Expected: All tests pass including the 3 new ones.

- [ ] **Step 3: Commit**

```bash
git add frontend/studyhub-app/src/lib/session-context.test.jsx
git commit -m "test(auth): add tests for session-expired modal and pagehide beacon"
```

---

### Task 8: Full validation

- [ ] **Step 1: Run backend tests**

Run: `npm --prefix backend test`

Expected: All tests pass (531+ tests, 42 files).

- [ ] **Step 2: Run backend lint**

Run: `npm --prefix backend run lint`

Expected: Only the 6 pre-existing lint errors.

- [ ] **Step 3: Run frontend lint**

Run: `npm --prefix frontend/studyhub-app run lint`

Expected: Clean.

- [ ] **Step 4: Run frontend build**

Run: `npm --prefix frontend/studyhub-app run build`

Expected: Build succeeds.

- [ ] **Step 5: Update release log**

Add a new section to `docs/beta-v1.7.0-release-log.md` documenting:
- Sec-1.1: CSRF exemption for logout + pagehide sendBeacon
- Sec-1.2: Removed 5 redundant 401 checks
- Sec-1.3: Session-expired modal + logged-out banner
- Validation results
