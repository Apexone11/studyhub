# Sec-1 — Session Hardening + Logout UX Polish

## Goal

Improve session security and user trust with best-effort tab-close logout, tighter 401 handling, and professional session-expired/logout messaging. No impossible promises — web apps cannot guarantee logout on tab close, but we can make it work most of the time and handle the rest gracefully.

## Scope

- Sec-1.1: Best-effort logout on tab close
- Sec-1.2: Session lifecycle tightening (401 cleanup)
- Sec-1.3: Session-expired modal + logout messaging
- Sec-1.4: Skipped (security mode toggle deferred to future cycle)

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Session-expired UX | Blocking modal (not toast) | Toast is easy to miss mid-flow; modal is unmissable |
| Approach | Layer into session-context.jsx | Session lifecycle concerns belong with the session authority; minimal new files |
| CSRF on logout | Exempt `/api/auth/logout` | sendBeacon can't set custom headers; logout is idempotent and harmless — CSRF adds no security value |
| Tab-close event | `pagehide` only | `visibilitychange` is too aggressive (fires on tab switch); `beforeunload` is deprecated for this purpose |
| Sec-1.4 toggle | Deferred | Best-effort logout applies unconditionally — a toggle adds migration + UI for minimal value now |

## Existing Infrastructure

The system already has:
- JWT in HttpOnly cookies (stateless, 24h expiry)
- Global fetch shim that catches all 401s and dispatches `AUTH_SESSION_EXPIRED_EVENT` (debounced)
- Session-context with `clearSession()`, `signOut()`, `refreshSession()`
- sessionStorage flag `studyhub:session-expired` read by LoginPage for contextual banner
- Idempotent `POST /api/auth/logout` (clears cookie, no DB writes)
- `useIdleTimeout` hook (30min default)
- `isAuthSessionFailure()` helper used across components

---

## Sec-1.1: Best-effort logout on tab close

### Backend

**File:** `backend/src/middleware/csrf.js`

Add `/api/auth/logout` to the CSRF skip list alongside existing exemptions (`/login`, `/register`, `/google`). This allows `navigator.sendBeacon()` (which cannot include custom headers) to reach the endpoint.

### Frontend

**File:** `frontend/studyhub-app/src/lib/session-context.jsx`

Inside `SessionProvider`, add a `pagehide` event listener:

- **Gate:** Only fires when `status === 'authenticated'`
- **Action:** Calls `navigator.sendBeacon(API + '/api/auth/logout')` then `clearStoredSession()` locally
- **Lifecycle:** Registers/unregisters via `useEffect` gated on `status`
- **No fallback:** sendBeacon covers all modern browsers; no fetch keepalive needed
- **No `visibilitychange`:** Too aggressive (fires on tab switch)

### Limitations

If the browser kills the process before sendBeacon fires, the cookie survives until JWT expiry (24h). This is inherent to stateless JWT web apps and is acceptable.

---

## Sec-1.2: Session lifecycle tightening

### Remove redundant manual 401 checks

The global fetch shim already catches all 401 responses and dispatches `AUTH_SESSION_EXPIRED_EVENT`. The following files contain redundant manual `if (response.status === 401) clearSession()` checks that should be removed:

- `frontend/studyhub-app/src/pages/dashboard/useDashboardData.js`
- `frontend/studyhub-app/src/pages/feed/useFeedData.js`
- `frontend/studyhub-app/src/pages/preview/SheetHtmlPreviewPage.jsx`
- `frontend/studyhub-app/src/pages/preview/AttachmentPreviewPage.jsx`
- `frontend/studyhub-app/src/pages/admin/SheetReviewPanel.jsx`

These are maintenance hazards — if the 401 handling logic changes, scattered checks won't be updated.

### Audit bootstrap 401 path

Verify that `refreshSession()` on 401 sets `status = 'unauthenticated'` without setting `error` (which would show an error banner instead of rendering public pages normally). The exploration shows this is already correct, but the implementation should confirm.

### Protected route redirect

Verify that protected route guards redirect to `/login` on unauthenticated status (not show a blank screen). If any path produces a white screen, fix it.

---

## Sec-1.3: Session-expired modal + logout messaging

### Session-expired modal

**File:** `frontend/studyhub-app/src/lib/session-context.jsx`

Replace the current toast-based `AUTH_SESSION_EXPIRED_EVENT` handler:

**State:** Add `sessionExpiredVisible` boolean to SessionProvider.

**Event handler change:**
- Set `sessionExpiredVisible = true`
- Clear session state (same as current)
- Set sessionStorage `studyhub:session-expired` flag (same as current)
- Remove the `showToast()` call

**Modal component:** Inline within session-context.jsx (~30-40 lines JSX):
- Blocking overlay: fixed inset, semi-transparent backdrop (`rgba(15, 23, 42, 0.5)`)
- Heading: "Your session has expired"
- Body: "For your security, your session ended. Please sign in again to continue."
- Buttons: "Sign in again" (navigates to `/login`), "Go to Home" (navigates to `/`)
- Escape key and backdrop click dismiss (navigates to `/`)
- All colors use CSS custom property tokens from `index.css`

### Intentional logout messaging

**File:** `frontend/studyhub-app/src/lib/session.js`

In `logoutSession()`, after clearing the stored session, set sessionStorage flag `studyhub:logged-out`.

**File:** `frontend/studyhub-app/src/pages/auth/LoginPage.jsx`

On mount, check for both flags:
- `studyhub:session-expired` -> "Your session expired. Sign in again to pick up where you left off." (already exists)
- `studyhub:logged-out` -> "You've been signed out." (new — no security framing since this was intentional)

Both flags cleared after reading.

---

## Testing

### Backend tests

**File:** Existing auth test file or new `backend/test/logout-csrf.test.js`

- `POST /api/auth/logout` without `X-CSRF-Token` header returns 200 (not 403) — verifies CSRF exemption
- `POST /api/auth/logout` called twice returns 200 both times — verifies idempotency

### Frontend unit tests (Vitest)

**File:** New `frontend/studyhub-app/src/lib/__tests__/session-hardening.test.js` (or similar)

- `pagehide` handler calls `navigator.sendBeacon` with correct URL when status is `authenticated`
- `pagehide` handler does NOT call `sendBeacon` when status is `unauthenticated`
- Session-expired modal renders when `sessionExpiredVisible` is true
- Modal dismisses and navigates on button click

### Not included

No new E2E tests. Tab-close sendBeacon is non-deterministic in Playwright. The 401-to-modal flow is covered by unit tests. Existing E2E tests cover public page browsing while logged out.

---

## Files changed (summary)

| File | Change |
|------|--------|
| `backend/src/middleware/csrf.js` | Exempt `/api/auth/logout` from CSRF |
| `frontend/studyhub-app/src/lib/session-context.jsx` | Add pagehide listener, session-expired modal, `sessionExpiredVisible` state |
| `frontend/studyhub-app/src/lib/session.js` | Set `studyhub:logged-out` flag in `logoutSession()` |
| `frontend/studyhub-app/src/pages/auth/LoginPage.jsx` | Read `studyhub:logged-out` flag, show distinct banner |
| `frontend/studyhub-app/src/pages/dashboard/useDashboardData.js` | Remove manual 401 check |
| `frontend/studyhub-app/src/pages/feed/useFeedData.js` | Remove manual 401 check |
| `frontend/studyhub-app/src/pages/preview/SheetHtmlPreviewPage.jsx` | Remove manual 401 check |
| `frontend/studyhub-app/src/pages/preview/AttachmentPreviewPage.jsx` | Remove manual 401 check |
| `frontend/studyhub-app/src/pages/admin/SheetReviewPanel.jsx` | Remove manual 401 check |
| Backend test file | Logout CSRF exemption + idempotency tests |
| Frontend test file | pagehide handler + modal tests |
