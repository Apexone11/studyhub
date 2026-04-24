# Reference 11 — Feature Flag Security (Fail-Closed Contract)

## Files to Read

- `backend/scripts/seedFeatureFlags.js` — canonical flag list, `SHIPPED_DESIGN_V2_FLAGS`
- `backend/src/modules/flags/` (or wherever `/api/flags` is handled)
- `frontend/studyhub-app/src/lib/designV2Flags.js` — client flag hook
- Any component that conditionally renders behind a flag

---

## Check 11.1 — Flag Evaluation is Fail-Closed (Decision #20 — HARD RULE)

**Rule (LOCKED):** Every non-green signal from flag evaluation returns DISABLED. Only `enabled: true` returns enabled.

**Fail-closed triggers:**
| Condition | Expected result |
|---|---|
| Flag row not in DB (`FLAG_NOT_FOUND`) | DISABLED |
| Network error on `/api/flags` | DISABLED |
| Non-200 HTTP response | DISABLED |
| Malformed or non-JSON response | DISABLED |
| Response missing `enabled` key | DISABLED |
| `enabled: false` | DISABLED |
| `enabled: true` | ENABLED |

**Verify in `designV2Flags.js`:**

```js
// CORRECT — fail-closed
let enabled = false
try {
  const res = await fetch(`${API}/api/flags/${flagName}`, { credentials: 'include' })
  if (res.ok) {
    const data = await res.json()
    enabled = data.enabled === true // strict equality — not truthy
  }
} catch {
  // network error → remains disabled
}
return enabled
```

**Violation (historical bug pattern #12 from CLAUDE.md — do not regress):**

```js
// WRONG — fail-OPEN
enabled = data?.enabled ?? true // missing row defaults to true
```

---

## Check 11.2 — useDesignV2Flags Hook is the Only Flag Consumer

**Rule per CLAUDE.md:** All feature flag checks in frontend must go through `useDesignV2Flags`. No component should call `fetch('/api/flags')` directly.

**Grep (frontend):**

```
fetch.*api/flags\|axios.*api/flags
```

Any direct fetch → bypasses the fail-closed hook contract → MEDIUM.

---

## Check 11.3 — Shipped Flags in seedFeatureFlags.js

**Rule per CLAUDE.md:** Flags for shipped features must be added to `SHIPPED_DESIGN_V2_FLAGS` in `seedFeatureFlags.js` and seeded as `enabled: true`. In-flight flags get NO row (stay closed by default).

**Verify:**

```js
// CORRECT — seeded flag
const SHIPPED_DESIGN_V2_FLAGS = ['design_v2_upcoming_exams', 'design_v2_profile_widgets']
for (const name of SHIPPED_DESIGN_V2_FLAGS) {
  await prisma.featureFlag.upsert({
    where: { name },
    create: { name, enabled: true },
    update: { enabled: true },
  })
}
```

**Violation:** A new flag used in frontend but NOT in `SHIPPED_DESIGN_V2_FLAGS` will fail-closed in production → feature invisible → user ticket.

---

## Check 11.4 — No Hardcoded `enabled: true` Returns in Backend Flag API

**Rule:** The flag API endpoint must return the actual DB row value, not a hardcoded response.

**Verify in flag route handler:**

```js
// CORRECT
const flag = await prisma.featureFlag.findUnique({ where: { name } })
if (!flag) return res.json({ enabled: false }) // fail-closed default
return res.json({ enabled: flag.enabled === true })
```

**Violation:**

```js
// WRONG
return res.json({ enabled: true }) // hardcoded — bypasses flag system
```

---

## Check 11.5 — Seed Script is Idempotent and Upsert-Only

**Rule per CLAUDE.md:** `seedFeatureFlags.js` must be safe for any environment (no user data, upsert-only, idempotent).

**Verify:** The script uses `upsert` not `create`. Running it twice should not duplicate rows or throw errors.

---

## Severity Reference for Feature Flag Issues

| Issue                                             | OWASP | Severity |
| ------------------------------------------------- | ----- | -------- |
| Fail-open flag evaluation (Decision #20 violated) | A05   | HIGH     |
| Hardcoded `enabled: true` in backend flag API     | A05   | HIGH     |
| Direct `fetch('/api/flags')` bypassing hook       | A05   | MEDIUM   |
| Shipped flag not in `seedFeatureFlags.js`         | A05   | LOW      |
| Seed script uses `create` not `upsert`            | A05   | LOW      |
