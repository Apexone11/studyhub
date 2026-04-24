# Reference 14 — Error Response Leakage

## Files to Read

- `backend/src/middleware/errorEnvelope.js` — `sendError()`, `ERROR_CODES`
- `backend/src/index.js` — global error handler middleware
- Any route or controller file with `res.status(4xx).json()`

---

## Check 14.1 — sendError() Used Instead of Raw JSON Errors

**Rule per CLAUDE.md:** All error responses MUST use `sendError(res, status, message, code, extra)` from `errorEnvelope.js`, NOT raw `res.status(4xx).json({ error: ... })`.

**Violation:**

```js
// WRONG
return res.status(404).json({ error: 'User not found' })
return res.status(500).json({ error: err.message }) // CRITICAL — leaks internals
```

**Correct:**

```js
// CORRECT
return sendError(res, 404, 'User not found', ERROR_CODES.NOT_FOUND)
```

**Grep for violations:**

```
res\.status\(\d{3}\)\.json\(\{.*error
```

Each match is a potential leak. Assess what the `error` value is — if it's a variable derived from `err.message` or a Prisma error → HIGH.

---

## Check 14.2 — No Stack Traces or Prisma Errors to Client

**Rule:** Internal error details (stack traces, Prisma error codes, SQL fragments, file paths) must NEVER be sent to the client.

**Violation:**

```js
// WRONG
return res.status(500).json({ error: err.message })
// Prisma errors include: "Invalid `prisma.user.findUnique()` invocation in /app/src/..."
```

**Correct pattern:**

```js
// CORRECT
console.error('DB error in user lookup:', err)
return sendError(res, 500, 'An error occurred', ERROR_CODES.INTERNAL)
```

**Grep for Prisma error leakage:**

```
err\.message\|error\.message\|err\.stack
```

Look for these inside `res.json()` or `sendError()` `extra` param passed to client.

---

## Check 14.3 — Global Error Handler Catches Unhandled Errors

**Rule:** Express requires a 4-argument error handler as the LAST middleware in `index.js`.

**Verify in `backend/src/index.js`:**

```js
// CORRECT — 4 params signals Express to use as error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err)
  sendError(res, 500, 'Internal server error', ERROR_CODES.INTERNAL)
})
```

**Violation:** No global error handler → unhandled async errors crash the process or return Express's default HTML error page (which includes stack traces in dev).

---

## Check 14.4 — ERROR_CODES Constants Used

**Rule:** Error code strings must come from `ERROR_CODES` in `errorEnvelope.js`, not inline strings.

**Violation:**

```js
// WRONG
sendError(res, 403, 'Forbidden', 'FORBIDDEN') // inline string
```

**Correct:**

```js
// CORRECT
sendError(res, 403, 'Forbidden', ERROR_CODES.FORBIDDEN)
```

---

## Check 14.5 — Auth Errors Return 401 Not 500

**Rule:** A failed JWT verification or missing session should always return 401, never 500. A 500 on an auth path leaks whether the issue is server-side or credential-side.

**Verify in `requireAuth` middleware:**

```js
// CORRECT
if (!req.user) return sendError(res, 401, 'Authentication required', ERROR_CODES.UNAUTHORIZED)
```

---

## Check 14.6 — Validation Errors Return 400 with Field Info, Not 500

**Rule:** Zod validation failures should return 400 with the specific validation error details (field names, constraints), but NOT the raw Zod error object or any internal paths.

**Correct pattern:**

```js
// CORRECT
const result = schema.safeParse(req.body)
if (!result.success) {
  return sendError(res, 400, 'Validation failed', ERROR_CODES.VALIDATION, {
    fields: result.error.flatten().fieldErrors,
  })
}
```

---

## Severity Reference for Error Leakage Issues

| Issue                                                     | OWASP | Severity |
| --------------------------------------------------------- | ----- | -------- |
| `err.message` or stack trace in client response           | A05   | HIGH     |
| Prisma error text in client response                      | A05   | HIGH     |
| No global error handler                                   | A05   | MEDIUM   |
| Raw `res.status().json({error})` instead of `sendError()` | A05   | MEDIUM   |
| Auth failure returns 500 instead of 401                   | A05   | MEDIUM   |
| Inline error code string instead of `ERROR_CODES`         | A05   | LOW      |
