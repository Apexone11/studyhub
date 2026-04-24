# Reference 15 — Secrets & Environment Variables

## Files to Read

- `backend/.env.example` — canonical list of expected env vars
- `backend/src/lib/authTokens.js` — JWT_SECRET access pattern
- `backend/src/modules/ai/ai.service.js` — ANTHROPIC_API_KEY
- `backend/src/modules/payments/payments.service.js` — Stripe key access
- `frontend/studyhub-app/src/config.js` — frontend env vars

---

## Check 15.1 — No Secret Keys in Frontend Code

**Rule:** Backend-only secrets must NEVER appear in frontend source files.

**Grep for leakage in frontend:**

```
sk_live_|sk_test_|ANTHROPIC_API_KEY|JWT_SECRET|DATABASE_URL
```

Run against `frontend/studyhub-app/src/`. Any match is CRITICAL.

**Expected:**

- `STRIPE_SECRET_KEY` → backend only
- `ANTHROPIC_API_KEY` → backend only
- `JWT_SECRET` → backend only
- `DATABASE_URL` → backend only

Frontend env vars (allowed in `VITE_` prefixed vars):

- `VITE_API_URL` → resolves to backend origin (no secrets, just a URL)

---

## Check 15.2 — JWT_SECRET Minimum Length Enforced

**Rule per `authTokens.js`:** `MIN_SECRET_LENGTH = 32`. The app must validate JWT_SECRET length at startup and refuse to start if below threshold.

**Verify:**

```js
// CORRECT — from authTokens.js
const MIN_SECRET_LENGTH = 32
if (!JWT_SECRET || JWT_SECRET.length < MIN_SECRET_LENGTH) {
  throw new Error(`JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters`)
}
```

**Violation:** A short JWT_SECRET allows brute-force token forgery.

---

## Check 15.3 — All process.env.X Documented in .env.example

**Rule per CLAUDE.md:** Any new `process.env.X` access must be documented in `backend/.env.example`.

**Audit method:**

1. Grep all env var accesses:
   ```
   process\.env\.[A-Z_]+
   ```
2. Extract unique names
3. Cross-reference against `.env.example`

**Any env var in code but missing from `.env.example` is a finding** — deployers won't know to set it → silent failures in production.

---

## Check 15.4 — No Module-Level process.env Access (Lazy Init Pattern)

**Rule per CLAUDE.md:** `process.env.X` accessed at module top-level (outside functions) breaks test environments loaded before `.env`.

**Violation:**

```js
// WRONG — top-level access at module load time
const JWT_SECRET = process.env.JWT_SECRET  // breaks if .env not loaded yet

export function signToken(payload) { ... }
```

**Correct:**

```js
// CORRECT — lazy getter
function getJwtSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET not set')
  return secret
}
```

**Exception:** Simple config modules that are only loaded after dotenv is bootstrapped are acceptable if the order is guaranteed. Verify the import chain.

---

## Check 15.5 — Stripe Keys Never in Frontend

**Rule per CLAUDE.md payment architecture:** No Stripe keys in frontend code.

**Required:**

- `STRIPE_SECRET_KEY` → server-side only (prefixed `sk_`)
- `STRIPE_WEBHOOK_SECRET` → server-side only
- `STRIPE_PRICE_ID_PRO` / `STRIPE_PRICE_ID_PRO_YEARLY` / `STRIPE_PRICE_ID_DONATION` → server-side only (price IDs are not secret but leaking them is unnecessary)

**Note:** Stripe Publishable Key (`pk_`) is intentionally public and safe in frontend.

---

## Check 15.6 — Anthropic API Key Server-Side Only

**Rule per CLAUDE.md / Decision #17:** `ANTHROPIC_API_KEY` must never appear in frontend.

**Verify in `ai.service.js`:**

```js
// CORRECT
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
```

**Frontend AI calls** must go through `${API}/api/ai/...` — the backend proxies to Anthropic. No direct Anthropic API calls from frontend.

---

## Check 15.7 — .env Files Not Committed

**Rule:** `.env`, `.env.local`, `.env.production` must be in `.gitignore`.

**Grep .gitignore:**

```
\.env
```

Verify `.env.example` is tracked (safe — no real values) and `.env` is not.

---

## Severity Reference for Secrets Issues

| Issue                                      | OWASP | Severity |
| ------------------------------------------ | ----- | -------- |
| `sk_live_` Stripe key in frontend          | A02   | CRITICAL |
| `ANTHROPIC_API_KEY` in frontend            | A02   | CRITICAL |
| `JWT_SECRET` in frontend                   | A02   | CRITICAL |
| Short JWT_SECRET (< 32 chars)              | A02   | HIGH     |
| .env file committed to repo                | A02   | HIGH     |
| process.env at module top-level            | A05   | MEDIUM   |
| Env var used but missing from .env.example | A05   | MEDIUM   |
