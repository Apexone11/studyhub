# Reference 05 — CSRF Protection

## Files to Read

- `backend/src/middleware/csrf.js` — CSRF enforcement middleware
- `backend/src/lib/authTokens.js` — `signCsrfToken()`, token structure
- `backend/src/index.js` — middleware ordering
- `frontend/studyhub-app/src/pages/shared/pageUtils.js` — `authHeaders()` helper

---

## Check 5.1 — CSRF Middleware Applied Before Routes

**Verify in `backend/src/index.js`:**

```js
// CORRECT ORDER
app.use(express.json())
app.use(cookieParser())
app.use(requireOriginOrBearer) // CSRF middleware
app.use('/api/auth', authRoutes)
app.use('/api/sheets', sheetsRoutes)
// ... all routes AFTER csrf middleware
```

**Violation:** Any route mounted BEFORE the CSRF middleware is unprotected → CRITICAL

---

## Check 5.2 — CSRF Token Structure (JWT-based)

**StudyHub uses a custom JWT-based CSRF token** (not a random cookie value). This is intentional to tie the CSRF token to the authenticated user.

**Pattern:**

```js
// CORRECT — backend/src/lib/authTokens.js
export function signCsrfToken(user) {
  return jwt.sign(
    { sub: user.id, type: 'csrf' }, // 'type: csrf' marker is critical
    getJwtSecret(),
    { expiresIn: '24h' },
  )
}
```

**Enforcement in csrf.js:**

```js
// CORRECT
const decoded = jwt.verify(csrfToken, getJwtSecret())
if (decoded.type !== 'csrf') throw new Error('Not a CSRF token')
if (decoded.sub !== req.user.userId) throw new Error('CSRF token sub mismatch')
```

**CRITICAL violations:**

- No `type: 'csrf'` check → any valid JWT (including session token) can be used as CSRF token → HIGH
- No `sub` matching between CSRF token and session user → different user's CSRF token accepted → HIGH
- CSRF token exposed in URL or JS-accessible location → HIGH

---

## Check 5.3 — Exempt Methods

**GET, HEAD, OPTIONS must skip CSRF** (they are safe methods per RFC 7231 and should be idempotent).

**Verify:**

```js
// CORRECT
if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
```

**Violation:** GET requests require CSRF token → breaks all browser navigation → breaks API

---

## Check 5.4 — Bearer Token Clients Skip CSRF

**Pattern:**

```js
// CORRECT — API clients using Authorization header (not cookies) skip CSRF
const authHeader = req.headers.authorization
if (authHeader && authHeader.startsWith('Bearer ')) return next()
```

**Why:** Bearer token clients are not vulnerable to CSRF because the browser won't auto-attach the Authorization header to cross-origin requests.

**Violation:** Bearer token check missing → machine clients (mobile apps, CI scripts) must also provide CSRF token → low-severity UX bug but not a security gap.

---

## Check 5.5 — Auth Bootstrap Routes Exempt

**Pattern:**

```js
// CORRECT — csrf.js
const AUTH_BOOTSTRAP_PREFIXES = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/google',
  '/api/auth/google/callback',
]
if (AUTH_BOOTSTRAP_PREFIXES.some((p) => req.path.startsWith(p))) return next()
```

**Violation:** Login endpoint requires CSRF token → user can't log in without already having a valid session (chicken-and-egg) → login broken.

**ALSO check:** No non-auth endpoint accidentally added to bootstrap exemption list.

---

## Check 5.6 — Payment Route Origin Check

**Payments have an additional `requireTrustedOrigin` check** (separate from the main CSRF middleware) because Stripe's webhook uses a different validation method.

**Verify:**

```js
// CORRECT — payments.routes.js
import { requireTrustedOrigin } from '../../middleware/csrf.js'
router.post(
  '/checkout/subscription',
  requireAuth,
  requireTrustedOrigin,
  paymentCheckoutLimiter,
  handler,
)
router.post(
  '/checkout/donation',
  requireAuth,
  requireTrustedOrigin,
  paymentCheckoutLimiter,
  handler,
)
router.post('/portal', requireAuth, requireTrustedOrigin, paymentPortalLimiter, handler)
// NOTE: /webhook does NOT use requireTrustedOrigin — it uses Stripe signature instead
```

**Violation:** Checkout endpoint missing `requireTrustedOrigin` → cross-origin checkout initiation → MEDIUM

---

## Check 5.7 — Frontend CSRF Token Delivery

**Frontend must include `x-csrf-token` header on all mutating fetches.**

**Pattern in frontend:**

```js
// CORRECT — pageUtils.js
export function authHeaders() {
  const csrfToken = getCsrfTokenFromCookie()
  return {
    'Content-Type': 'application/json',
    'x-csrf-token': csrfToken,
  }
}

// Usage
fetch(`${API}/api/sheets`, {
  method: 'POST',
  credentials: 'include',
  headers: authHeaders(),
  body: JSON.stringify(data),
})
```

**Violations:**

- Mutating fetch missing `x-csrf-token` header → 403 CSRF error in production → MEDIUM (broken feature, not security gap)
- `authHeaders()` not called on POST/PATCH/DELETE → same → MEDIUM

---

## Severity Reference for CSRF Issues

| Issue                                   | OWASP | Severity |
| --------------------------------------- | ----- | -------- |
| Route mounted before CSRF middleware    | A01   | CRITICAL |
| No `type:'csrf'` check on token         | A01   | HIGH     |
| No `sub` matching on CSRF token         | A01   | HIGH     |
| CSRF token in URL param                 | A01   | HIGH     |
| Checkout without `requireTrustedOrigin` | A01   | MEDIUM   |
| Missing `x-csrf-token` on mutation      | —     | MEDIUM   |
| Bearer token check missing              | —     | LOW      |
