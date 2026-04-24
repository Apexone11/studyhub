# Reference 17 — Database Migration Safety

## Files to Read

- `backend/prisma/schema.prisma` — model definitions
- `backend/prisma/migrations/` — all migration SQL files
- `backend/src/index.js` — Prisma client initialization

---

## Check 17.1 — Every Prisma Model Has a Corresponding Migration

**Rule per CLAUDE.md (CRITICAL):** Every new model added to `schema.prisma` MUST have a corresponding `CREATE TABLE` in a migration SQL file. Models without migrations = "relation does not exist" error in production.

**Audit method:**

1. List all `model Xxx` declarations in `schema.prisma`
2. Grep migrations directory for `CREATE TABLE "Xxx"`
3. Any model without a matching CREATE TABLE migration → CRITICAL

**Current migration inventory (from CLAUDE.md):**

- v1 core tables: `20260315000000_v1_complete`
- StudyGroup + sub-tables: `20260330000001`
- ShareLink, ContentShare: `20260330000002`
- UserBlock, UserMute: `20260330000003`
- Conversation, ConversationParticipant, Message, MessageReaction: `20260330000004`
- Note.pinned, Note.tags: `20260331000002`
- NoteStar, NoteVersion: `20260331000003`
- AiConversation, AiMessage, AiUsageLog: `20260331000004`
- Subscription, Payment, Donation: `20260403000001`

Any model outside this list without a migration → CRITICAL.

---

## Check 17.2 — NOT NULL Columns Require DEFAULT or Staged Migration

**Rule:** Adding a `NOT NULL` column without a `DEFAULT` to a table with existing rows will fail:

```
ERROR: column "fieldName" of relation "TableName" contains null values
```

**Migration pattern — safe approach:**

```sql
-- Stage 1: add nullable
ALTER TABLE "User" ADD COLUMN "newField" TEXT;

-- Stage 2: backfill (run in a script or subsequent migration)
UPDATE "User" SET "newField" = 'default_value' WHERE "newField" IS NULL;

-- Stage 3: add constraint (only after all rows have values)
ALTER TABLE "User" ALTER COLUMN "newField" SET NOT NULL;
```

**Or provide DEFAULT inline:**

```sql
-- Acceptable if DEFAULT is valid for all existing rows
ALTER TABLE "Exam" ADD COLUMN "preparednessPercent" INTEGER NOT NULL DEFAULT 0;
```

---

## Check 17.3 — Migration Naming Convention

**Rule per CLAUDE.md:** `YYYYMMDDHHMMSS_description` (e.g., `20260330000004_add_messaging_tables`).

**Grep to find non-conforming migrations:**

```
backend/prisma/migrations/
```

List directory — any folder not matching `^\d{14}_` pattern is a finding.

---

## Check 17.4 — CONCURRENTLY for Index Creation on Large Tables

**Rule:** Creating an index on a large table locks it. Use `CONCURRENTLY` to avoid downtime.

**Violation:**

```sql
-- WRONG on large tables (locks the table)
CREATE INDEX "User_email_idx" ON "User"("email");
```

**Correct:**

```sql
-- CORRECT — no table lock
CREATE INDEX CONCURRENTLY "User_email_idx" ON "User"("email");
```

**Exception:** `CONCURRENTLY` cannot be used inside a transaction block. Prisma migrations run in transactions by default — for large-table indexes, use a separate migration with `--create-only` and apply manually, or use Prisma's `pragma: { transaction: false }`.

---

## Check 17.5 — DROP TABLE / DROP COLUMN Paired with Code Changes

**Rule:** Any `DROP TABLE` or `DROP COLUMN` in a migration must be accompanied by code changes that remove all references to the dropped artifact.

**Audit method:**

1. Find any `DROP` statements in migrations
2. Search codebase for references to the dropped table/column
3. If references still exist → code will crash in production after migration runs

**Grep:**

```
DROP TABLE|DROP COLUMN
```

---

## Check 17.6 — schema.prisma Matches Migration SQL

**Rule:** The state of `schema.prisma` must be derivable from running all migrations in order. Common drift scenarios:

- Field added to schema but no `ALTER TABLE ADD COLUMN` in migration → runtime error
- Relation changed in schema but foreign key not updated in migration → relation mismatch

**Audit method:** Run `npx prisma migrate diff` to detect schema/migration drift.

---

## Check 17.7 — Idempotent-Safe DDL

**Rule:** Migrations should be safe to re-run in disaster recovery scenarios.

**Use:**

```sql
CREATE TABLE IF NOT EXISTS "Foo" (...);
CREATE INDEX IF NOT EXISTS "Foo_bar_idx" ON "Foo"("bar");
ALTER TABLE "Foo" ADD COLUMN IF NOT EXISTS "baz" TEXT;
```

**Exception:** Prisma-generated migrations don't use `IF NOT EXISTS` by default. This check applies to hand-written migration patches.

---

## Severity Reference for Migration Issues

| Issue                                              | OWASP | Severity |
| -------------------------------------------------- | ----- | -------- |
| Prisma model with no migration SQL                 | A05   | CRITICAL |
| NOT NULL column without DEFAULT on populated table | A05   | HIGH     |
| DROP TABLE/COLUMN without code cleanup             | A05   | HIGH     |
| schema.prisma / migration drift                    | A05   | HIGH     |
| Non-`CONCURRENTLY` index on large table            | A06   | MEDIUM   |
| Migration naming convention violation              | —     | LOW      |
