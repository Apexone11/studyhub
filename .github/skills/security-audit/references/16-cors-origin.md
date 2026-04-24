# Reference 16 — CORS & Origin Validation

## Files to Read

- `backend/src/index.js` — CORS middleware config
- `backend/src/middleware/csrf.js` — `requireTrustedOrigin` implementation
- `backend/src/modules/payments/payments.routes.js` — payment route CORS usage
- `backend/.env.example` — FRONTEND_URL, ALLOWED_ORIGINS

---

## Check 16.1 — CORS Origin is an Allowlist, Not Wildcard

**Rule:** `Access-Control-Allow-Origin: *` combined with `credentials: true` is rejected by all browsers (CORS spec). More importantly, an open wildcard allows any site to make credentialed requests.

**Verify in `backend/src/index.js`:**

```js
// CORRECT
app.use(
  cors({
    origin: (origin, callback) => {
      const allowed = getAllowedOrigins()
      if (!origin || allowed.includes(origin)) {
        callback(null, true)
      } else {
        callback(new Error('CORS: origin not allowed'))
      }
    },
    credentials: true, // required for cookie auth
  }),
)
```

**Violation:**

```js
// WRONG — wildcard with credentials
app.use(cors({ origin: '*', credentials: true }))
// Browsers reject this; also allows any external site to make credentialed API calls
```

---

## Check 16.2 — credentials: true in CORS Config

**Rule:** Since StudyHub uses HTTP-only cookies for auth, the CORS `credentials: true` option is mandatory. Without it, browsers strip cookies from cross-origin requests.

**Verify:** `credentials: true` is set in the `cors()` call.

**Impact:** Without `credentials: true`, authenticated users get 401s on cross-origin deployments (beta stack = split origin).

---

## Check 16.3 — Allowed Origins from Environment Variable

**Rule per CLAUDE.md:** Allowed origins should come from environment config, not a hardcoded array, so Railway production vs beta vs local dev can each specify their own.

**Verify:**

```js
// CORRECT
function getAllowedOrigins() {
  const origins = [process.env.FRONTEND_URL]
  if (process.env.ADDITIONAL_ORIGINS) {
    origins.push(...process.env.ADDITIONAL_ORIGINS.split(','))
  }
  return origins.filter(Boolean).map((o) => o.replace(/\/$/, '')) // strip trailing slash
}
```

**Verify `FRONTEND_URL` is in `.env.example`.**

---

## Check 16.4 — requireTrustedOrigin on Mutating Endpoints

**Rule per CLAUDE.md payment architecture:** Payment routes use `requireTrustedOrigin` middleware for CSRF-style origin checking.

**Verify the middleware:**

```js
// From csrf.js or a dedicated middleware
function requireTrustedOrigin(req, res, next) {
  const origin = req.headers.origin || req.headers.referer
  const allowed = getAllowedOrigins()
  // Normalize: strip trailing slash, check protocol
  const normalized = origin?.replace(/\/$/, '')
  if (!normalized || !allowed.some((o) => normalized.startsWith(o))) {
    return sendError(res, 403, 'Origin not trusted', ERROR_CODES.FORBIDDEN)
  }
  next()
}
```

**Applied to:**

- `POST /api/payments/checkout/*`
- `POST /api/payments/portal`
- NOT applied to `POST /api/payments/webhook` (Stripe is not in the allowlist — it uses signature verification instead)

---

## Check 16.5 — Origin Normalization (Trailing Slash, Protocol)

**Rule:** Origin comparison must handle:

1. Trailing slashes: `https://app.example.com/` vs `https://app.example.com`
2. Protocol mismatch: `http://` vs `https://` (production must require `https://`)
3. Port differences: `localhost:3000` vs `localhost:3001`

**Violation:**

```js
// WRONG — direct string equality without normalization
if (req.headers.origin === process.env.FRONTEND_URL) { ... }
// Breaks if FRONTEND_URL has trailing slash or port differs
```

**Correct:**

```js
// CORRECT — normalize before compare
const normalize = (url) => url?.replace(/\/$/, '').toLowerCase()
if (normalize(req.headers.origin) === normalize(process.env.FRONTEND_URL)) { ... }
```

---

## Check 16.6 — Stripe Webhook Exempted from requireTrustedOrigin

**Rule:** `POST /api/payments/webhook` receives requests from Stripe (not the browser). It must NOT go through `requireTrustedOrigin` — Stripe's origin won't be in the allowlist.

**Stripe webhook security is instead:**

1. `express.raw()` body parsing (to preserve raw bytes for signature)
2. `stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET)`

These two together are sufficient. Adding origin checks would break webhook delivery.

---

## Severity Reference for CORS/Origin Issues

| Issue                                              | OWASP | Severity |
| -------------------------------------------------- | ----- | -------- |
| Wildcard `*` with `credentials: true`              | A05   | CRITICAL |
| No `requireTrustedOrigin` on payment routes        | A05   | HIGH     |
| Missing `credentials: true` in CORS config         | A05   | HIGH     |
| Hardcoded origin array (not from env)              | A05   | MEDIUM   |
| Origin normalization bugs (trailing slash, casing) | A05   | MEDIUM   |
| Webhook going through origin check (breaks Stripe) | A05   | MEDIUM   |
