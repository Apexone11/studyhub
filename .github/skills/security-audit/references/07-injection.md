# Reference 07 — SQL / NoSQL Injection

## Files to Read

- Any file that uses `prisma.$queryRaw` or `prisma.$executeRaw`
- `backend/src/modules/search/search.routes.js` — text search queries
- `backend/src/lib/sheetSearch.js` — shared sheet search clause builder
- Any service file with dynamic `orderBy` or `where` clause construction

---

## Check 7.1 — No Template Literal Interpolation in Raw Queries

**Rule:** `prisma.$queryRaw` and `prisma.$executeRaw` MUST use tagged template literals (Prisma's built-in parameterization) or `Prisma.sql`. NEVER interpolate user input into a raw query string.

**CRITICAL violation:**

```js
// WRONG — SQL injection
const results = await prisma.$queryRaw(
  `SELECT * FROM "StudySheet" WHERE title LIKE '%${req.query.q}%'`,
)
```

**Correct pattern:**

```js
// CORRECT — parameterized via tagged template
import { Prisma } from '@prisma/client'
const results = await prisma.$queryRaw`
  SELECT * FROM "StudySheet" WHERE title LIKE ${'%' + sanitizedQ + '%'}
`
// OR using Prisma.sql
const results = await prisma.$queryRaw(
  Prisma.sql`SELECT * FROM "StudySheet" WHERE title LIKE ${searchTerm}`,
)
```

**Grep for raw query violations:**

```
\$queryRaw\s*\(`\|prisma\.\$queryRaw\s*\(\s*`
```

For every match, verify no `${` interpolation of user-controlled values appears inside.

---

## Check 7.2 — Dynamic `orderBy` Injection

**Risk:** If `orderBy` column or direction comes from user input, an attacker can trigger an error by supplying an invalid column name or inject into the query.

**Violation:**

```js
// WRONG
const orderBy = { [req.query.sortField]: req.query.sortDir }
await prisma.studySheet.findMany({ orderBy })
```

**Correct pattern:**

```js
// CORRECT — allowlist
const ALLOWED_SORT_FIELDS = ['createdAt', 'updatedAt', 'title', 'stars']
const ALLOWED_SORT_DIRS = ['asc', 'desc']
const sortField = ALLOWED_SORT_FIELDS.includes(req.query.sortField)
  ? req.query.sortField
  : 'createdAt'
const sortDir = ALLOWED_SORT_DIRS.includes(req.query.sortDir) ? req.query.sortDir : 'desc'
const orderBy = { [sortField]: sortDir }
```

**Grep:**

```
orderBy.*req\.(query|body|params)
```

---

## Check 7.3 — Prisma 6.x Null Syntax (Historical Bug Pattern)

**Rule per CLAUDE.md:** Do NOT use `field: { not: null }`. Prisma 6.19+ rejects it. Use array form at the where level.

**Violation:**

```js
// WRONG — Prisma 6.x throws "Argument `not` must not be null"
prisma.exam.findMany({ where: { courseId: { not: null } } })
```

**Correct:**

```js
// CORRECT
prisma.exam.findMany({ where: { NOT: [{ courseId: null }] } })
```

**Grep for violations:**

```
\{\s*not:\s*null\s*\}
```

---

## Check 7.4 — Search Query Sanitization

**Verify in `backend/src/lib/sheetSearch.js`:**

- The `q` search parameter is sanitized before use in `contains` / `startsWith` clauses.
- Prisma's `contains` / `startsWith` / `endsWith` are NOT vulnerable to SQL injection (they are parameterized under the hood), but the value should still be length-capped.

**Acceptable:**

```js
// CORRECT — Prisma ORM method (parameterized internally)
where: { title: { contains: q, mode: 'insensitive' } }
```

**The only risk:** If `q` is extremely long, it causes an expensive `LIKE` query → also a DoS concern → cap at 200 chars before using in search.

---

## Check 7.5 — Dynamic Table / Field References

**Rule:** Never use user input to select a Prisma model or field name programmatically.

**Violation:**

```js
// WRONG
const model = req.query.model // could be 'user', 'payment', etc.
const results = await prisma[model].findMany()
```

**Correct:** Allowlist the model name if dynamic access is needed, or eliminate the pattern.

---

## Check 7.6 — Prisma Error Leakage

**Rule:** Prisma errors should NEVER be sent to the client. They can contain table names, column names, constraint names, and query fragments.

**Violation:**

```js
// WRONG
try {
  await prisma.user.create({ data })
} catch (err) {
  res.status(500).json({ error: err.message }) // leaks Prisma internals
}
```

**Correct:**

```js
// CORRECT
try {
  await prisma.user.create({ data })
} catch (err) {
  console.error('[create user]', err)
  sendError(res, 500, 'Failed to create user', ERROR_CODES.INTERNAL)
}
```

---

## Severity Reference for Injection Issues

| Issue                                               | OWASP | Severity |
| --------------------------------------------------- | ----- | -------- |
| Template literal interpolation in `$queryRaw`       | A03   | CRITICAL |
| Dynamic model selection from user input             | A03   | CRITICAL |
| Dynamic `orderBy` from user input without allowlist | A03   | HIGH     |
| Prisma error message sent to client                 | A05   | HIGH     |
| `field: { not: null }` Prisma 6 syntax              | —     | MEDIUM   |
| No length cap on search query `q`                   | A05   | LOW      |
