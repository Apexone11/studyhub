# Reference 20 — Logging & PII Leakage

## Files to Read

- `backend/src/index.js` — global error handler, morgan/request logging
- `backend/src/lib/` — any `logger.js` or `logSecurityEvent.js`
- `backend/src/modules/*/` — scan for console.log with user data
- `frontend/studyhub-app/src/lib/` — PostHog, Sentry init

---

## Check 20.1 — No console.log with PII in Production Backend

**Rule per CLAUDE.md:** `console.log` in production code is a finding. `console.error` is acceptable for legitimate error paths.

**Critical grep:**

```
console\.log.*req\.body|console\.log.*user\.|console\.log.*email|console\.log.*password|console\.log.*token
```

**Findings for each match:**

- `console.log(req.body)` → may contain password, email, session tokens
- `console.log(user)` → leaks user PII to logs
- `console.log(email)` → PII in logs
- `console.log(password)` → plaintext credential in logs

**General console.log sweep:**

```
console\.log\(
```

Every match in `backend/src/` (excluding test files) is a finding unless it's clearly not in a hot path and contains no user data.

---

## Check 20.2 — Error Responses Don't Leak Internal Details

**Rule per CLAUDE.md (anti-pattern):** Error responses must not leak stack traces, SQL errors, file paths, or other internals to the client.

**Violation:**

```js
// WRONG
res.status(500).json({ error: err.stack })
res.status(500).json({ error: err.message }) // Prisma messages can contain table names, query details
```

**Correct:**

```js
// CORRECT — generic message to client, log detail server-side
console.error('DB error:', err)
sendError(res, 500, 'Internal server error', ERROR_CODES.INTERNAL)
```

**Specific grep for Prisma error leakage:**

```
err\.message|error\.message
```

Scan for any case where `err.message` is sent directly to the client.

---

## Check 20.3 — Global Error Handler Catches All Unhandled Errors

**Rule:** Express needs a 4-argument error handler registered as the LAST middleware to catch unhandled errors and prevent stack leakage.

**Verify in `backend/src/index.js`:**

```js
// CORRECT — 4-arg signature, registered last
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err)
  sendError(res, 500, 'Internal server error', ERROR_CODES.INTERNAL)
})
```

**If missing:** Any unhandled rejection will surface Express's default error page, which may include stack traces.

---

## Check 20.4 — Sentry Not Capturing PII

**Rule:** Sentry `beforeSend` hook must scrub PII from events before transmission.

**Verify in Sentry init (backend):**

```js
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  beforeSend(event) {
    // Scrub email, password from request data
    if (event.request?.data) {
      delete event.request.data.password
      delete event.request.data.email
    }
    return event
  },
})
```

**Verify in Sentry init (frontend):**

```js
Sentry.init({
  beforeSend(event) {
    // Strip user PII from breadcrumbs
    if (event.breadcrumbs) {
      event.breadcrumbs.values = event.breadcrumbs.values?.map((b) => ({
        ...b,
        data: undefined, // or selectively strip
      }))
    }
    return event
  },
})
```

---

## Check 20.5 — PostHog Events Don't Contain PII

**Rule per CLAUDE.md:** PostHog telemetry in frontend must not include PII in event properties.

**Violations:**

```js
// WRONG
posthog.capture('user_action', { email: user.email, name: user.name })
posthog.identify(user.id, { email: user.email }) // identify with PII is acceptable per GDPR if disclosed — verify
```

**Allowed:**

```js
// CORRECT — use IDs, not PII
posthog.capture('sheet_viewed', { sheetId: id, courseId })
```

**Grep:**

```
posthog\.capture|posthog\.identify
```

Scan all event properties for PII fields.

---

## Check 20.6 — logSecurityEvent Used for Auth/Security Events

**Rule:** Security events (login, logout, failed auth, permission denied, rate limit hit) should use a dedicated `logSecurityEvent()` helper — not `console.log` — so they can be routed to structured log storage or SIEM.

**Verify `logSecurityEvent` exists** in `backend/src/lib/`.

**Expected usage:**

```js
logSecurityEvent('auth:login:success', { userId, ip: req.ip })
logSecurityEvent('auth:login:failed', { email: /* redacted or hashed */, ip: req.ip })
logSecurityEvent('authz:forbidden', { userId, path: req.path })
```

**If `logSecurityEvent` doesn't exist:** This is a MEDIUM gap — security events mixed with general app logs are harder to audit.

---

## Check 20.7 — Request Logger Excludes Sensitive Fields

**Rule:** If morgan or a custom request logger logs request bodies (for debugging), it must exclude `password`, `token`, `authorization`, `cookie` fields.

**Violation:**

```js
// WRONG — logs all headers including auth cookies
app.use(morgan('combined')) // combined format logs auth headers
```

**Correct:**

```js
// CORRECT — skip auth/cookie fields
app.use(
  morgan(':method :url :status :response-time ms', {
    skip: (req) => req.path.startsWith('/api/payments/webhook'),
  }),
)
// And never enable body logging in production
```

---

## Severity Reference for Logging/PII Issues

| Issue                                        | OWASP | Severity |
| -------------------------------------------- | ----- | -------- |
| `console.log(req.body)` with password/token  | A09   | CRITICAL |
| Stack trace / Prisma error in API response   | A05   | HIGH     |
| No global error handler (raw Express errors) | A05   | HIGH     |
| Sentry capturing plaintext passwords         | A09   | HIGH     |
| PostHog events with email/PII                | A09   | MEDIUM   |
| No `logSecurityEvent` for auth events        | A09   | MEDIUM   |
| Request logger includes Authorization header | A09   | MEDIUM   |
| `console.log` in production (non-PII)        | —     | LOW      |
