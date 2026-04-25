# Reference 03 — Input Validation

## Files to Read

- `backend/src/middleware/validate.js` — Zod validation middleware
- `backend/src/lib/inputSanitizer.js` — sanitizer helpers
- `backend/src/lib/validators/` — shared Zod schemas (if directory exists)
- Any `*.routes.js` file for a new endpoint being reviewed

---

## Check 3.1 — Zod Validation on Every New Endpoint

**Rule:** Every endpoint that accepts body / params / query MUST validate with Zod via the `validate` middleware. No raw `req.body.field` without schema validation.

**Pattern to look for:**

```js
// CORRECT
import { z } from 'zod'
import { validate } from '../../../middleware/validate.js'

const createSheetSchema = z.object({
  title: z.string().min(1).max(200).trim(),
  content: z.string().max(500_000),
  courseId: z.string().uuid().optional(),
  visibility: z.enum(['public', 'private', 'school']).default('public'),
})

router.post('/', requireAuth, validate(createSheetSchema), sheetController.create)
```

**Violations to flag:**

```js
// WRONG — raw body access without validation
router.post('/', requireAuth, async (req, res) => {
  const { title, content } = req.body // ← no validation → mass assignment, type confusion
  await prisma.studySheet.create({ data: { title, content, userId: req.user.userId } })
})
```

**Grep for raw body access without validate middleware:**

```
req\.body\.[a-zA-Z]+
```

Then check if `validate(` appears as a middleware on the same route.

---

## Check 3.2 — URL Parameter Validation

**Rule:** `req.params.id` must be validated as a UUID (or appropriate type) before passing to Prisma. An invalid UUID string passed to Prisma will either throw an ugly 500 or (in some Prisma versions) silently return empty results.

**Pattern:**

```js
// CORRECT
const paramsSchema = z.object({ id: z.string().uuid() })
router.get('/:id', validate({ params: paramsSchema }), handler)

// ALSO CORRECT inline
const { id } = req.params
if (!/^[0-9a-f-]{36}$/.test(id)) {
  return sendError(res, 400, 'Invalid ID', ERROR_CODES.VALIDATION)
}
```

**Violations to flag:**

- `req.params.id` passed directly to `prisma.*.findUnique({ where: { id } })` without UUID validation → potential 500 error exposure → MEDIUM

---

## Check 3.3 — Query Parameter Validation & Pagination Clamping

**Rule:** Pagination params (`page`, `limit`) must use `clampLimit` / `clampPage` from `backend/src/lib/constants.js`. Unvalidated `limit` param could allow `limit=999999` → DoS via massive DB query.

**Pattern:**

```js
// CORRECT
import { clampLimit, clampPage, DEFAULT_PAGE_SIZE } from '../../lib/constants.js'

const page = clampPage(req.query.page)
const limit = clampLimit(req.query.limit)
```

**Violations to flag:**

```js
// WRONG
const limit = parseInt(req.query.limit) || 20 // ← no max cap → DoS
const page = parseInt(req.query.page) || 1 // ← no min/max cap
```

---

## Check 3.4 — String Sanitization for User Content

**Rule:** User-supplied strings stored in the DB should be trimmed and length-capped. Any string rendered as HTML must go through DOMPurify (frontend) or the HTML scan pipeline (backend).

**Pattern:**

```js
// CORRECT — inputSanitizer.js helpers
import { trimmedString, sanitizeText } from '../../lib/inputSanitizer.js'

const title = trimmedString(req.body.title, 200) // trims + caps at 200 chars
const bio = sanitizeText(req.body.bio, 500) // strips HTML tags + caps
```

**Violations to flag:**

- User bio / display name stored without stripping HTML tags → stored XSS when rendered without DOMPurify → HIGH
- No length cap on any user string field → DB column overflow / DoS → MEDIUM

---

## Check 3.5 — Mass Assignment Protection

**Rule:** Never spread `req.body` directly into a Prisma create/update. Explicitly list allowed fields.

**Violation pattern:**

```js
// WRONG — mass assignment
await prisma.user.update({
  where: { id: req.user.userId },
  data: { ...req.body }, // ← caller can set role, trustLevel, etc.
})
```

**Correct pattern:**

```js
// CORRECT
const { displayName, bio, avatarUrl } = req.body // or via Zod schema pick
await prisma.user.update({
  where: { id: req.user.userId },
  data: { displayName, bio, avatarUrl },
})
```

**Grep:**

```
data:.*\.\.\.req\.body
data:.*spread.*req\.body
```

---

## Check 3.6 — Message Length Cap

**Rule per CLAUDE.md:** Max message length is 5000 characters. Validated on both frontend and backend.

**Backend grep:**

```
MAX_MESSAGE_LENGTH
message.*length
```

Verify `MAX_MESSAGE_LENGTH` from `backend/src/lib/constants.js` is imported and used in the messaging POST route.

**Violation:** No server-side length check on message body → frontend bypass allows >5000 char messages → MEDIUM.

---

## Check 3.7 — Content-Type Enforcement

**Rule:** Endpoints expecting JSON should reject non-JSON `Content-Type` to prevent CSRF from forms.

Express 5 with `express.json()` middleware automatically ignores non-JSON bodies (returns `undefined`). Verify:

- `app.use(express.json())` is present in `backend/src/index.js`.
- No route manually reads `req.body` when content type is not JSON without validation.

---

## Severity Reference for Validation Issues

| Issue                               | OWASP | Severity |
| ----------------------------------- | ----- | -------- |
| No Zod validation on write endpoint | A03   | HIGH     |
| Mass assignment (`...req.body`)     | A03   | HIGH     |
| Stored XSS via unsanitized string   | A03   | HIGH     |
| No UUID validation on params        | A03   | MEDIUM   |
| No pagination limit cap             | A05   | MEDIUM   |
| No message length server check      | A03   | MEDIUM   |
| No string trim / length cap         | A03   | LOW      |
