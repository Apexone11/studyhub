# Reference 01 — Authentication & Session Security

## Files to Read

- `backend/src/lib/authTokens.js` — JWT sign/verify, cookie config, CSRF token
- `backend/src/middleware/auth.js` — `requireAuth` middleware
- `backend/src/middleware/requireAdmin.js` — admin middleware (double DB check)
- `backend/src/modules/auth/session.service.js` — JTI session tracking
- `backend/src/modules/auth/auth.routes.js` — login/logout/register endpoints

---

## Check 1.1 — Cookie Flags

**What to look for:**

```js
// CORRECT — backend/src/lib/authTokens.js
res.cookie('studyhub_session', token, {
  httpOnly: true, // ✅ no JS access
  secure: isProd, // ✅ HTTPS-only in production
  sameSite: isProd ? 'none' : 'lax', // ✅ cross-site safe (Railway split-origin)
  maxAge: 24 * 60 * 60 * 1000, // ✅ 24h expiry
  path: '/', // ✅ sent to /api/* and /socket.io/*
})
```

**CRITICAL violations to flag:**

- `httpOnly: false` → XSS can steal token → CRITICAL
- `secure: false` in production → token sent over HTTP → HIGH
- `sameSite: 'none'` without `secure: true` → browser rejects → HIGH
- `domain:` set too broadly (e.g., `.getstudyhub.org` allows subdomain injection) → HIGH
- JWT stored in `localStorage` or `sessionStorage` → CRITICAL

**Grep patterns:**

```
localStorage.setItem.*token
sessionStorage.setItem.*token
httpOnly.*false
secure.*false
```

---

## Check 1.2 — JWT Secret Strength

**What to look for:**

```js
// CORRECT — backend/src/lib/authTokens.js
const MIN_SECRET_LENGTH = 32

function getJwtSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters`)
  }
  return secret
}
```

**CRITICAL violations to flag:**

- No secret length validation → weak secret in production → CRITICAL
- Secret hardcoded in source → CRITICAL
- Secret in frontend code → CRITICAL
- `JWT_SECRET` not in `backend/.env.example` → HIGH

---

## Check 1.3 — Token Payload Minimality

**What to look for:**

```js
// CORRECT — minimal payload
const payload = { sub: user.id, role: user.role }
// Optional: jti for revocation
```

**Violations to flag:**

- Password hash in payload → HIGH
- Email in payload → MEDIUM (PII leaks on token decode)
- Any secret or PII in payload → HIGH

---

## Check 1.4 — Fresh Role Lookup

**What to look for:**

```js
// CORRECT — auth.js: re-fetch user from DB on every request
const user = await prisma.user.findUnique({
  where: { id: decoded.sub },
  select: { id: true, username: true, role: true, trustLevel: true },
})
if (!user) return sendError(res, 401, 'Account not found', ERROR_CODES.UNAUTHORIZED)
req.user = user
```

**Violations to flag:**

- Trusting role from JWT payload without DB check → role changes don't take effect → HIGH
- `req.user` set from JWT payload directly without DB lookup → HIGH

---

## Check 1.5 — requireAdmin Double-Check

**What to look for:**

```js
// CORRECT — requireAdmin.js: DB lookup even after middleware check
const user = await prisma.user.findUnique({ where: { id: req.user.userId } })
if (!user || user.role !== 'admin') {
  logSecurityEvent('admin.access.denied', { ... })
  return sendError(res, 403, 'Admin access required.', ERROR_CODES.FORBIDDEN)
}
```

**Violations to flag:**

- Admin check using ONLY `req.user.role` from token → stale admin removal not effective → HIGH
- No `logSecurityEvent` on denied admin access → MEDIUM (missing audit trail)
- Route requires admin but uses `requireAuth` instead of `requireAdmin` → CRITICAL

---

## Check 1.6 — Session JTI Revocation

**What to look for:**

```js
// CORRECT — auth.js: JTI-based session validation
if (decoded.jti) {
  const session = await validateSession(decoded.jti)
  if (!session) {
    return sendError(res, 401, 'Session has been revoked.', ERROR_CODES.AUTH_EXPIRED)
  }
}
```

**Violations to flag:**

- No JTI validation → logout does not actually invalidate token → HIGH
- `validateSession` not wrapped in try-catch → migration timing crash → MEDIUM

---

## Check 1.7 — Auth Bootstrap Exempt Routes

**What to look for:**

```js
// CORRECT — csrf.js: login/register skip CSRF (no session exists yet)
const AUTH_BOOTSTRAP_PREFIXES = ['/api/auth/login', '/api/auth/register', '/api/auth/google']

if (AUTH_BOOTSTRAP_PREFIXES.some((prefix) => url.startsWith(prefix))) {
  return next()
}
```

**Violations to flag:**

- State-mutating non-auth route in `AUTH_BOOTSTRAP_PREFIXES` → bypasses CSRF → HIGH
- New auth endpoint added but not added to bootstrap exempt list → login broken → MEDIUM

---

## Check 1.8 — Logout Clears Cookie

**What to look for:**

```js
// CORRECT — logout endpoint
res.clearCookie('studyhub_session', { httpOnly: true, secure: isProd, sameSite: ... })
// Revoke JTI in Session table
await revokeSession(decoded.jti)
```

**Violations to flag:**

- Logout doesn't clear cookie (only revokes server-side) → browser keeps cookie → MEDIUM
- Logout doesn't revoke JTI → token usable until expiry after logout → HIGH
- Logout not rate-limited (spam revocation) → LOW

---

## Severity Reference for Auth Issues

| Issue                          | OWASP | Severity |
| ------------------------------ | ----- | -------- |
| JWT in localStorage            | A02   | CRITICAL |
| No httpOnly cookie             | A02   | CRITICAL |
| Hardcoded JWT secret           | A07   | CRITICAL |
| Role from JWT without DB check | A01   | HIGH     |
| No JTI revocation              | A07   | HIGH     |
| PII in JWT payload             | A02   | HIGH     |
| No logout JTI revocation       | A07   | HIGH     |
| Stale admin middleware         | A01   | HIGH     |
| No secret length validation    | A07   | MEDIUM   |
| Missing auth event logging     | A09   | MEDIUM   |
