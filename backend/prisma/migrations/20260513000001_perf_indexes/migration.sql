-- 20260513000001_perf_indexes
--
-- Loop U10 — deep DB query audit (admin, achievements, creatorAudit,
-- exams, moderation, plagiarism, settings, sharing, users, video,
-- waitlist, webhooks, announcements, reviews, onboarding, dashboard).
-- Adds composite indexes that align with the dominant filter+orderBy
-- shapes those modules send to Prisma so the planner can satisfy each
-- list query with an index range scan instead of a heap scan + sort.
--
-- Every statement is `IF NOT EXISTS` so `prisma migrate deploy` is safe
-- to retry on partial failure (CLAUDE.md A5). Additive-only; no column
-- adds, no table changes, no data rewrites. Index builds are O(N log N)
-- per table but each target table is well under the index-bloat
-- threshold (largest is StudySheet at low-millions, well-handled by a
-- single CONCURRENTLY-equivalent build on Postgres 14+).

-- ─────────────────────────────────────────────────────────────────────
-- User — admin /api/admin/users list ordered by createdAt desc.
-- Without this, every admin user-list page does a Seq Scan + Sort.
-- ─────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "User_createdAt_idx"
  ON "User"("createdAt" DESC);

-- ─────────────────────────────────────────────────────────────────────
-- StudySheet — admin /api/admin/sheets/review list filters by status and
-- orders by updatedAt desc. The existing [status, createdAt] index can't
-- serve the updatedAt sort.
-- ─────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "StudySheet_status_updatedAt_idx"
  ON "StudySheet"("status", "updatedAt" DESC);

-- ─────────────────────────────────────────────────────────────────────
-- AuditLog — settings /my-audit-log filters by actorId, orders by
-- createdAt desc, take 2000. Existing per-column indexes ([actorId] +
-- [createdAt]) cannot be combined by the planner for the desc sort.
-- ─────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "AuditLog_actorId_createdAt_idx"
  ON "AuditLog"("actorId", "createdAt" DESC);

-- ─────────────────────────────────────────────────────────────────────
-- ModerationCase — moderation user controller renders the caller's last
-- 20 cases ordered by createdAt desc. [userId] alone forces a sort.
-- ─────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "ModerationCase_userId_createdAt_idx"
  ON "ModerationCase"("userId", "createdAt" DESC);

-- ─────────────────────────────────────────────────────────────────────
-- Strike — /my-strikes ordered by issuedAt desc per user. The existing
-- [userId, decayedAt, expiresAt] index does not lead with issuedAt.
-- ─────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "Strike_userId_issuedAt_idx"
  ON "Strike"("userId", "issuedAt" DESC);

-- ─────────────────────────────────────────────────────────────────────
-- Appeal — /my-appeals (per-user list ordered by createdAt desc) and
-- admin /appeals (filter by status, same ordering). The existing
-- [userId, status] / [caseId] indexes cannot satisfy either sort.
-- ─────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "Appeal_userId_createdAt_idx"
  ON "Appeal"("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Appeal_status_createdAt_idx"
  ON "Appeal"("status", "createdAt" DESC);

-- ─────────────────────────────────────────────────────────────────────
-- Note — UserProfilePage public-notes section fetches
--   { userId, private: false, moderationStatus: 'clean' }
--   orderBy updatedAt desc, take 10.
-- The base FK [userId] has to filter every author note + sort; this
-- composite serves the public-notes-on-profile read path directly.
-- ─────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "Note_userId_private_updatedAt_idx"
  ON "Note"("userId", "private", "updatedAt" DESC);

-- ─────────────────────────────────────────────────────────────────────
-- ShareLink — /api/sharing/links lists a single user's share links
-- ordered by createdAt desc. [createdById] alone forces a sort.
-- ─────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "ShareLink_createdById_createdAt_idx"
  ON "ShareLink"("createdById", "createdAt" DESC);

-- ─────────────────────────────────────────────────────────────────────
-- ContentShare — /api/sharing/shared-with-me filters by (sharedWithId,
-- contentType?) and orders by createdAt desc. Existing
-- [sharedWithId, contentType] serves the filter, not the sort.
-- ─────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "ContentShare_sharedWithId_contentType_createdAt_idx"
  ON "ContentShare"("sharedWithId", "contentType", "createdAt" DESC);

-- ─────────────────────────────────────────────────────────────────────
-- SheetContribution — dashboard top-contributors widget groups accepted
-- contributions within a 30-day window. Without [status, createdAt] the
-- groupBy plans as a heap scan + sort over the whole table.
-- ─────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "SheetContribution_status_createdAt_idx"
  ON "SheetContribution"("status", "createdAt" DESC);
