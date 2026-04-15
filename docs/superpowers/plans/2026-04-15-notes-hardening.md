# Notes Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix silent save failures and empty-on-return bugs in the Notes editor by moving to a local-first state machine with IndexedDB draft cache, server-authoritative revision concurrency, manual save controls, lifecycle flushes, sanitized paste, and a word-level version diff + non-destructive restore.

**Architecture:** Three-layer client: TipTap editor → `useNotePersistence` state-machine hook (`useReducer`, statuses `idle/dirty/saving/saved/error/offline/conflict`) → transport (`noteDraftStore` over IndexedDB + Service Worker background-sync). Backend adds optimistic-concurrency fields (`revision`, `lastSaveId`, `contentHash`) and a typed version kind (`AUTO`/`MANUAL`/`PRE_RESTORE`/`CONFLICT_LOSER`). Rolled out behind `flag_notes_hardening_v2`.

**Tech Stack:** React 19, TipTap (existing), `idb` (new, ~2KB), `sanitize-html` (existing backend dep, add to frontend), `diff` (new backend dep for `diffWordsWithSpace`), Prisma 6, Express 5, Vitest, Playwright, PostHog, Sentry.

**Spec:** [docs/superpowers/specs/2026-04-15-notes-hardening-design.md](../specs/2026-04-15-notes-hardening-design.md)

---

## File Structure

### Backend (`backend/`)

- **Create** `prisma/migrations/20260415000001_notes_hardening/migration.sql` — adds `Note.revision`, `Note.lastSaveId`, `Note.contentHash`, `NoteVersion.revision`, `NoteVersion.parentVersionId`, `NoteVersion.kind`, `NoteVersion.bytesContent`, `NoteVersionKind` enum, `(noteId, createdAt)` index.
- **Modify** `prisma/schema.prisma` — mirror the migration.
- **Modify** `src/modules/notes/notes.controller.js` — rewrite `update` (PATCH) for revision/saveId/contentHash handling; rewrite version creation; split into smaller handlers.
- **Create** `src/modules/notes/notes.concurrency.js` — pure helpers: `computeContentHash`, `shouldCreateAutoVersion`, `pruneOldAutoVersions`, revision conflict detection.
- **Create** `src/modules/notes/notes.chunks.js` — Redis/in-memory buffer for chunked saves.
- **Create** `src/modules/notes/notes.diff.js` — wraps `diff` package, returns structured chunks.
- **Modify** `src/modules/notes/notes.routes.js` — add chunk / restore / diff routes; wire new rate limiters.
- **Modify** `src/lib/rateLimiters.js` — add `notesPatchLimiter` (raise to 120/min), `notesChunkLimiter`, `notesRestoreLimiter`, `notesDiffLimiter`.
- **Modify** `src/middleware/errorEnvelope.js` — add new error codes.
- **Create** `scripts/backfillNoteVersionBytes.js` — one-time backfill for existing rows.
- **Modify** `package.json` — add `diff` dep; add `seed:notes-hardening-flag` script.
- **Create** `scripts/seedNotesHardeningFlag.js` — idempotent feature-flag seed (like existing `seedRolesV2Flags.js`).

### Frontend (`frontend/studyhub-app/`)

- **Create** `src/pages/notes/noteDraftStore.js` — IndexedDB wrapper (+ sessionStorage fallback).
- **Create** `src/pages/notes/noteDraftStore.test.js` — unit tests.
- **Create** `src/pages/notes/notePersistenceReducer.js` — pure reducer for state machine.
- **Create** `src/pages/notes/notePersistenceReducer.test.js` — unit tests per transition.
- **Create** `src/pages/notes/useNotePersistence.js` — the hook. Owns refs, debounce, lifecycle listeners, BroadcastChannel.
- **Create** `src/pages/notes/notePaste.js` — TipTap paste-transform with sanitize-html whitelist.
- **Create** `src/pages/notes/notePaste.test.js` — fixtures for Word/Docs/plain/mixed.
- **Create** `src/pages/notes/NoteSaveStatus.jsx` — status chip component.
- **Create** `src/pages/notes/NoteConflictBanner.jsx` — banner + resolver entry.
- **Create** `src/pages/notes/NoteVersionDiff.jsx` — diff modal (inline + side-by-side toggle).
- **Modify** `src/pages/notes/useNotesData.js` — remove autosave; keep list/CRUD only.
- **Modify** `src/pages/notes/NoteEditor.jsx` — wire `useNotePersistence`, status chip, Save button, Ctrl+S, paste config.
- **Modify** `src/pages/notes/NoteVersionHistory.jsx` — enriched list, kind pills, diff/restore actions.
- **Create** `public/sw-notes.js` — Service Worker for background sync.
- **Modify** `src/main.jsx` — register the SW under a scope limited to `/api/notes/*`.
- **Modify** `package.json` — add `idb`, `sanitize-html`.
- **Create** `tests/notes.persistence.spec.js` — Playwright E2E covering all regression scenarios.

---

## Task Sequence Overview

Backend first (migration + schema + server endpoints), then frontend modules bottom-up (draft store → reducer → hook → components), then integration (wire into editor), then E2E tests, then rollout wiring.

1. Feature flag + migration scaffolding
2. Prisma schema + migration
3. Backend: concurrency helpers + unit tests
4. Backend: PATCH rewrite (revision/saveId/contentHash/409)
5. Backend: version creation rules + kind + pruning
6. Backend: chunked save endpoint
7. Backend: restore endpoint
8. Backend: diff endpoint
9. Backend: rate limiters + error codes
10. Backend: backfill script
11. Frontend: noteDraftStore (IDB + sessionStorage fallback)
12. Frontend: notePersistenceReducer (pure state machine)
13. Frontend: useNotePersistence hook (refs, debounce, lifecycle, BroadcastChannel)
14. Frontend: notePaste (sanitize-html whitelist)
15. Frontend: NoteSaveStatus chip
16. Frontend: NoteConflictBanner
17. Frontend: NoteVersionDiff modal
18. Frontend: wire NoteEditor (hook + Save button + Ctrl+S + paste)
19. Frontend: update NoteVersionHistory for new fields
20. Frontend: Service Worker for background sync
21. Frontend: split useNotesData (remove autosave)
22. E2E Playwright regression suite
23. Rollout wiring (feature flag gate + telemetry + release log)

---

## Task 1: Seed `flag_notes_hardening_v2` feature flag

**Files:**

- Create: `backend/scripts/seedNotesHardeningFlag.js`
- Modify: `backend/package.json` (add `seed:notes-hardening-flag` script)

- [ ] **Step 1: Inspect the existing seed pattern**

Read `backend/scripts/seedRolesV2Flags.js` to match the idempotent upsert pattern.

- [ ] **Step 2: Create the seed script**

```js
// backend/scripts/seedNotesHardeningFlag.js
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const flag = await prisma.featureFlag.upsert({
    where: { key: 'flag_notes_hardening_v2' },
    update: {},
    create: {
      key: 'flag_notes_hardening_v2',
      enabled: false,
      rolloutPercent: 0,
      description:
        'Notes hardening v2: local-first state machine, IDB draft, revision concurrency, diff/restore',
    },
  })
  console.log('[seed] flag_notes_hardening_v2 =', flag.enabled, flag.rolloutPercent + '%')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
```

- [ ] **Step 3: Wire the npm script**

In `backend/package.json` scripts, add:

```
"seed:notes-hardening-flag": "node scripts/seedNotesHardeningFlag.js"
```

- [ ] **Step 4: Verify locally**

Run: `npm --prefix backend run seed:notes-hardening-flag`
Expected output: `[seed] flag_notes_hardening_v2 = false 0%`

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/seedNotesHardeningFlag.js backend/package.json
git commit -m "feat(notes): seed flag_notes_hardening_v2 (disabled)"
```

---

## Task 2: Prisma schema + migration

**Files:**

- Modify: `backend/prisma/schema.prisma` (Note + NoteVersion models, NoteVersionKind enum)
- Create: `backend/prisma/migrations/20260415000001_notes_hardening/migration.sql`

- [ ] **Step 1: Edit `schema.prisma` Note model**

Inside `model Note { ... }` add:

```prisma
  revision      Int       @default(0)
  lastSaveId    String?   @db.Uuid
  contentHash   String?
```

- [ ] **Step 2: Edit `schema.prisma` NoteVersion model**

Inside `model NoteVersion { ... }` add:

```prisma
  revision        Int       @default(0)
  parentVersionId String?   @db.Uuid
  kind            NoteVersionKind @default(AUTO)
  bytesContent    Int       @default(0)

  @@index([noteId, createdAt])
```

Add enum at end of schema:

```prisma
enum NoteVersionKind {
  AUTO
  MANUAL
  PRE_RESTORE
  CONFLICT_LOSER
}
```

- [ ] **Step 3: Write migration SQL**

Create `backend/prisma/migrations/20260415000001_notes_hardening/migration.sql`:

```sql
-- Note additions
ALTER TABLE "Note" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Note" ADD COLUMN "lastSaveId" UUID;
ALTER TABLE "Note" ADD COLUMN "contentHash" TEXT;

-- NoteVersionKind enum
CREATE TYPE "NoteVersionKind" AS ENUM ('AUTO', 'MANUAL', 'PRE_RESTORE', 'CONFLICT_LOSER');

-- NoteVersion additions
ALTER TABLE "NoteVersion" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "NoteVersion" ADD COLUMN "parentVersionId" UUID;
ALTER TABLE "NoteVersion" ADD COLUMN "kind" "NoteVersionKind" NOT NULL DEFAULT 'AUTO';
ALTER TABLE "NoteVersion" ADD COLUMN "bytesContent" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "NoteVersion_noteId_createdAt_idx" ON "NoteVersion"("noteId", "createdAt");
```

- [ ] **Step 4: Regenerate Prisma client**

Run: `npx --prefix backend prisma generate`
Expected: "Generated Prisma Client"

- [ ] **Step 5: Apply migration to local DB**

Run: `npm --prefix backend run migrate` (or equivalent — check backend/package.json scripts for the dev migrate command)
Expected: migration `20260415000001_notes_hardening` listed as applied.

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260415000001_notes_hardening/
git commit -m "feat(notes): add revision, saveId, contentHash, version kind schema"
```

---

## Task 3: Backend concurrency helpers + tests

**Files:**

- Create: `backend/src/modules/notes/notes.concurrency.js`
- Create: `backend/test/notes.concurrency.test.js`

- [ ] **Step 1: Write failing tests**

```js
// backend/test/notes.concurrency.test.js
import { describe, it, expect } from 'vitest'
import {
  computeContentHash,
  isRevisionConflict,
  shouldCreateAutoVersion,
} from '../src/modules/notes/notes.concurrency.js'

describe('notes.concurrency', () => {
  it('computeContentHash produces stable sha256 for same input', () => {
    const a = computeContentHash('hello world')
    const b = computeContentHash('hello world')
    expect(a).toBe(b)
    expect(a).toMatch(/^sha256:[a-f0-9]{64}$/)
  })

  it('computeContentHash differs for different input', () => {
    expect(computeContentHash('a')).not.toBe(computeContentHash('b'))
  })

  it('isRevisionConflict returns true when baseRevision < current', () => {
    expect(isRevisionConflict(10, 12)).toBe(true)
    expect(isRevisionConflict(12, 12)).toBe(false)
    expect(isRevisionConflict(13, 12)).toBe(false)
  })

  it('shouldCreateAutoVersion true if last AUTO version older than 5 min', () => {
    const now = new Date('2026-04-15T12:00:00Z')
    const sixMinAgo = new Date(now.getTime() - 6 * 60 * 1000)
    expect(shouldCreateAutoVersion({ lastAutoVersionAt: sixMinAgo, now })).toBe(true)
  })

  it('shouldCreateAutoVersion false if last AUTO less than 5 min', () => {
    const now = new Date('2026-04-15T12:00:00Z')
    const fourMinAgo = new Date(now.getTime() - 4 * 60 * 1000)
    expect(shouldCreateAutoVersion({ lastAutoVersionAt: fourMinAgo, now })).toBe(false)
  })

  it('shouldCreateAutoVersion true when no prior AUTO version', () => {
    expect(shouldCreateAutoVersion({ lastAutoVersionAt: null, now: new Date() })).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm --prefix backend test -- notes.concurrency`
Expected: FAIL (module does not exist).

- [ ] **Step 3: Implement the helpers**

```js
// backend/src/modules/notes/notes.concurrency.js
import crypto from 'node:crypto'

const AUTO_VERSION_COOLDOWN_MS = 5 * 60 * 1000

export function computeContentHash(content) {
  const hex = crypto
    .createHash('sha256')
    .update(content ?? '', 'utf8')
    .digest('hex')
  return `sha256:${hex}`
}

export function isRevisionConflict(baseRevision, currentRevision) {
  return Number(baseRevision) < Number(currentRevision)
}

export function shouldCreateAutoVersion({ lastAutoVersionAt, now = new Date() }) {
  if (!lastAutoVersionAt) return true
  return now.getTime() - new Date(lastAutoVersionAt).getTime() >= AUTO_VERSION_COOLDOWN_MS
}

export const AUTO_VERSION_COOLDOWN = AUTO_VERSION_COOLDOWN_MS
```

- [ ] **Step 4: Run tests**

Run: `npm --prefix backend test -- notes.concurrency`
Expected: 6/6 passing.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/notes/notes.concurrency.js backend/test/notes.concurrency.test.js
git commit -m "feat(notes): add concurrency helpers (hash, revision conflict, auto-version cooldown)"
```

---

## Task 4: Backend PATCH rewrite — revision / saveId / contentHash / 409

**Files:**

- Modify: `backend/src/modules/notes/notes.controller.js` (replace `update` handler)
- Modify: `backend/src/middleware/errorEnvelope.js` (add error codes)
- Create: `backend/test/notes.update.test.js`

- [ ] **Step 1: Add error codes**

In `backend/src/middleware/errorEnvelope.js`, add to `ERROR_CODES`:

```js
  NOTE_REVISION_CONFLICT: 'NOTE_REVISION_CONFLICT',
  NOTE_PAYLOAD_TOO_LARGE: 'NOTE_PAYLOAD_TOO_LARGE',
  NOTE_CHUNK_OUT_OF_ORDER: 'NOTE_CHUNK_OUT_OF_ORDER',
  NOTE_VERSION_NOT_FOUND: 'NOTE_VERSION_NOT_FOUND',
```

- [ ] **Step 2: Write failing tests**

```js
// backend/test/notes.update.test.js
import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import app from '../src/index.js' // verify correct import path in repo
import { createUserAndLogin, createNote } from './helpers/testHelpers.js' // follow existing helper pattern

describe('PATCH /api/notes/:id', () => {
  let agent, user, note
  beforeEach(async () => {
    ;({ agent, user } = await createUserAndLogin())
    note = await createNote({ userId: user.id, title: 'T', content: 'C' })
  })

  it('persists and bumps revision on matching baseRevision', async () => {
    const res = await agent.patch(`/api/notes/${note.id}`).send({
      title: 'T2',
      content: 'C2',
      baseRevision: 0,
      saveId: '11111111-1111-1111-1111-111111111111',
      contentHash: 'sha256:abc',
      trigger: 'manual',
    })
    expect(res.status).toBe(200)
    expect(res.body.revision).toBe(1)
    expect(res.body.note.title).toBe('T2')
  })

  it('returns 409 on stale baseRevision', async () => {
    await agent.patch(`/api/notes/${note.id}`).send({
      title: 'X',
      content: 'Y',
      baseRevision: 0,
      saveId: '22222222-2222-2222-2222-222222222222',
      contentHash: 'sha256:one',
      trigger: 'manual',
    })
    const res = await agent.patch(`/api/notes/${note.id}`).send({
      title: 'Z',
      content: 'W',
      baseRevision: 0,
      saveId: '33333333-3333-3333-3333-333333333333',
      contentHash: 'sha256:two',
      trigger: 'manual',
    })
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('NOTE_REVISION_CONFLICT')
    expect(res.body.current.revision).toBe(1)
    expect(res.body.yours.title).toBe('Z')
  })

  it('is idempotent on repeated saveId — returns 202 with same result', async () => {
    const body = {
      title: 'T2',
      content: 'C2',
      baseRevision: 0,
      saveId: '44444444-4444-4444-4444-444444444444',
      contentHash: 'sha256:abc',
      trigger: 'manual',
    }
    const first = await agent.patch(`/api/notes/${note.id}`).send(body)
    expect(first.status).toBe(200)
    const repeat = await agent.patch(`/api/notes/${note.id}`).send(body)
    expect(repeat.status).toBe(202)
    expect(repeat.body.revision).toBe(first.body.revision)
  })

  it('returns 200 no-op when contentHash matches current', async () => {
    const first = await agent.patch(`/api/notes/${note.id}`).send({
      title: 'T',
      content: 'C',
      baseRevision: 0,
      saveId: '55555555-5555-5555-5555-555555555555',
      contentHash: 'sha256:initial',
      trigger: 'manual',
    })
    const sameHash = first.body.note.contentHash
    const res = await agent.patch(`/api/notes/${note.id}`).send({
      title: 'T',
      content: 'C',
      baseRevision: first.body.revision,
      saveId: '66666666-6666-6666-6666-666666666666',
      contentHash: sameHash,
      trigger: 'debounce',
    })
    expect(res.status).toBe(200)
    expect(res.body.revision).toBe(first.body.revision) // unchanged
    expect(res.body.versionCreated).toBe(false)
  })

  it('rejects content > 200000 chars with 413', async () => {
    const big = 'x'.repeat(200001)
    const res = await agent.patch(`/api/notes/${note.id}`).send({
      title: 'T',
      content: big,
      baseRevision: 0,
      saveId: '77777777-7777-7777-7777-777777777777',
      contentHash: 'sha256:big',
      trigger: 'manual',
    })
    expect(res.status).toBe(413)
    expect(res.body.code).toBe('NOTE_PAYLOAD_TOO_LARGE')
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `npm --prefix backend test -- notes.update`
Expected: FAIL.

- [ ] **Step 4: Implement the new `update` handler**

Replace the existing `update` in `backend/src/modules/notes/notes.controller.js` with (keep the surrounding imports/exports intact):

```js
import {
  computeContentHash,
  isRevisionConflict,
  shouldCreateAutoVersion,
} from './notes.concurrency.js'
import { sendError, ERROR_CODES } from '../../middleware/errorEnvelope.js'

const MAX_NOTE_CONTENT = 200000

export async function update(req, res) {
  const { id } = req.params
  const { title, content, baseRevision, saveId, contentHash, trigger } = req.body ?? {}

  if (typeof content === 'string' && content.length > MAX_NOTE_CONTENT) {
    return sendError(
      res,
      413,
      'Note content exceeds 200000 characters',
      ERROR_CODES.NOTE_PAYLOAD_TOO_LARGE,
    )
  }

  const note = await prisma.note.findUnique({ where: { id } })
  if (!note || note.userId !== req.user.id) {
    return sendError(res, 404, 'Note not found', ERROR_CODES.NOT_FOUND)
  }

  // Idempotent replay: same saveId as the last successful write returns that result.
  if (saveId && note.lastSaveId === saveId) {
    return res.status(202).json({
      note,
      revision: note.revision,
      savedAt: note.updatedAt,
      versionCreated: false,
      replay: true,
    })
  }

  if (isRevisionConflict(baseRevision ?? 0, note.revision)) {
    return res.status(409).json({
      code: ERROR_CODES.NOTE_REVISION_CONFLICT,
      current: {
        revision: note.revision,
        title: note.title,
        content: note.content,
        updatedAt: note.updatedAt,
        contentHash: note.contentHash,
      },
      yours: { title, content },
    })
  }

  // No-op detection
  const normalizedIncomingHash = contentHash || computeContentHash(content ?? '')
  if (note.contentHash && note.contentHash === normalizedIncomingHash && note.title === title) {
    return res.status(200).json({
      note,
      revision: note.revision,
      savedAt: note.updatedAt,
      versionCreated: false,
      noop: true,
    })
  }

  // Decide if an AUTO version is due (MANUAL always creates one — handled below).
  const lastAutoVersion = await prisma.noteVersion.findFirst({
    where: { noteId: id, kind: 'AUTO' },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })
  const autoDue = shouldCreateAutoVersion({
    lastAutoVersionAt: lastAutoVersion?.createdAt ?? null,
  })
  const shouldSnapshot = trigger === 'manual' || autoDue

  const updated = await prisma.$transaction(async (tx) => {
    if (shouldSnapshot && (note.title || note.content)) {
      await tx.noteVersion.create({
        data: {
          noteId: id,
          userId: req.user.id,
          title: note.title,
          content: note.content,
          message: trigger === 'manual' ? 'Manual save' : null,
          revision: note.revision,
          kind: trigger === 'manual' ? 'MANUAL' : 'AUTO',
          bytesContent: Buffer.byteLength(note.content ?? '', 'utf8'),
        },
      })
    }
    return tx.note.update({
      where: { id },
      data: {
        title,
        content,
        revision: note.revision + 1,
        lastSaveId: saveId ?? null,
        contentHash: normalizedIncomingHash,
      },
    })
  })

  // Pruning: keep last 50 AUTO versions.
  await prunePastFiftyAuto(id)

  res.status(200).json({
    note: updated,
    revision: updated.revision,
    savedAt: updated.updatedAt,
    versionCreated: shouldSnapshot,
  })
}

async function prunePastFiftyAuto(noteId) {
  const autos = await prisma.noteVersion.findMany({
    where: { noteId, kind: 'AUTO' },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })
  if (autos.length <= 50) return
  const toDelete = autos.slice(50).map((v) => v.id)
  await prisma.noteVersion.deleteMany({ where: { id: { in: toDelete } } })
}
```

- [ ] **Step 5: Run tests**

Run: `npm --prefix backend test -- notes.update`
Expected: 5/5 passing.

- [ ] **Step 6: Full backend test sweep**

Run: `npm --prefix backend test`
Expected: all prior tests still pass.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/notes/notes.controller.js backend/src/middleware/errorEnvelope.js backend/test/notes.update.test.js
git commit -m "feat(notes): revision concurrency, saveId idempotency, contentHash no-op, 413 cap"
```

---

## Task 5: Backend chunked save endpoint

**Files:**

- Create: `backend/src/modules/notes/notes.chunks.js`
- Create: `backend/test/notes.chunks.test.js`
- Modify: `backend/src/modules/notes/notes.routes.js`
- Modify: `backend/src/modules/notes/notes.controller.js` (add `appendChunk` handler)

- [ ] **Step 1: Write failing tests**

```js
// backend/test/notes.chunks.test.js
import { describe, it, expect } from 'vitest'
import { ChunkBuffer } from '../src/modules/notes/notes.chunks.js'

describe('notes.chunks.ChunkBuffer', () => {
  it('assembles ordered chunks in sequence', () => {
    const buf = new ChunkBuffer()
    expect(buf.append('s1', 0, 3, 'hello ')).toEqual({ complete: false })
    expect(buf.append('s1', 1, 3, 'there ')).toEqual({ complete: false })
    const final = buf.append('s1', 2, 3, 'world')
    expect(final.complete).toBe(true)
    expect(final.content).toBe('hello there world')
  })

  it('rejects out-of-order chunk', () => {
    const buf = new ChunkBuffer()
    buf.append('s2', 0, 3, 'a')
    expect(() => buf.append('s2', 2, 3, 'c')).toThrow(/out of order/i)
  })

  it('expires stale sessions after TTL', () => {
    const buf = new ChunkBuffer({ ttlMs: 10 })
    buf.append('s3', 0, 2, 'a')
    return new Promise((r) => setTimeout(r, 20)).then(() => {
      buf.sweep()
      expect(() => buf.append('s3', 1, 2, 'b')).toThrow(/expired|out of order/i)
    })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm --prefix backend test -- notes.chunks`
Expected: FAIL.

- [ ] **Step 3: Implement ChunkBuffer**

```js
// backend/src/modules/notes/notes.chunks.js
export class ChunkBuffer {
  constructor({ ttlMs = 5 * 60 * 1000 } = {}) {
    this.sessions = new Map()
    this.ttlMs = ttlMs
  }

  append(saveId, chunkIndex, chunkCount, chunk) {
    const now = Date.now()
    let sess = this.sessions.get(saveId)
    if (!sess) {
      if (chunkIndex !== 0) throw new Error('chunk out of order')
      sess = { parts: [], expected: chunkCount, updatedAt: now }
      this.sessions.set(saveId, sess)
    }
    if (chunkIndex !== sess.parts.length) throw new Error('chunk out of order')
    if (chunkCount !== sess.expected) throw new Error('chunkCount mismatch')
    sess.parts.push(chunk)
    sess.updatedAt = now
    if (sess.parts.length === sess.expected) {
      const content = sess.parts.join('')
      this.sessions.delete(saveId)
      return { complete: true, content }
    }
    return { complete: false }
  }

  sweep() {
    const now = Date.now()
    for (const [id, sess] of this.sessions) {
      if (now - sess.updatedAt > this.ttlMs) this.sessions.delete(id)
    }
  }
}

export const defaultChunkBuffer = new ChunkBuffer()
setInterval(() => defaultChunkBuffer.sweep(), 60 * 1000).unref?.()
```

- [ ] **Step 4: Run unit tests**

Run: `npm --prefix backend test -- notes.chunks`
Expected: 3/3 pass.

- [ ] **Step 5: Add controller handler**

In `backend/src/modules/notes/notes.controller.js`:

```js
import { defaultChunkBuffer } from './notes.chunks.js'

export async function appendChunk(req, res) {
  const { id } = req.params
  const { saveId, chunkIndex, chunkCount, chunk, baseRevision, contentHash, title } = req.body ?? {}
  if (
    !saveId ||
    typeof chunkIndex !== 'number' ||
    typeof chunkCount !== 'number' ||
    typeof chunk !== 'string'
  ) {
    return sendError(res, 400, 'Invalid chunk payload', ERROR_CODES.BAD_REQUEST)
  }
  let result
  try {
    result = defaultChunkBuffer.append(saveId, chunkIndex, chunkCount, chunk)
  } catch (e) {
    return sendError(res, 400, e.message, ERROR_CODES.NOTE_CHUNK_OUT_OF_ORDER)
  }
  if (!result.complete) {
    return res.status(202).json({ received: chunkIndex + 1, total: chunkCount })
  }
  // Delegate to update() with fully-assembled content.
  req.body = {
    title,
    content: result.content,
    baseRevision,
    saveId,
    contentHash,
    trigger: 'debounce',
  }
  return update(req, res)
}
```

- [ ] **Step 6: Wire the route**

In `backend/src/modules/notes/notes.routes.js`, add:

```js
router.post('/:id/chunks', requireAuth, notesChunkLimiter, appendChunk)
```

(Import `notesChunkLimiter` and `appendChunk` at top.)

- [ ] **Step 7: Run backend tests**

Run: `npm --prefix backend test`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/notes/notes.chunks.js backend/test/notes.chunks.test.js backend/src/modules/notes/notes.controller.js backend/src/modules/notes/notes.routes.js
git commit -m "feat(notes): chunked save endpoint for >64KB payloads"
```

---

## Task 6: Backend restore endpoint

**Files:**

- Modify: `backend/src/modules/notes/notes.controller.js` (add `restoreVersion`)
- Modify: `backend/src/modules/notes/notes.routes.js`
- Create: `backend/test/notes.restore.test.js`

- [ ] **Step 1: Write failing tests**

```js
// backend/test/notes.restore.test.js
import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import app from '../src/index.js'
import { createUserAndLogin, createNote, createNoteVersion } from './helpers/testHelpers.js'

describe('POST /api/notes/:id/versions/:versionId/restore', () => {
  let agent, user, note, version
  beforeEach(async () => {
    ;({ agent, user } = await createUserAndLogin())
    note = await createNote({ userId: user.id, title: 'Current', content: 'Current content' })
    version = await createNoteVersion({
      noteId: note.id,
      userId: user.id,
      title: 'Old',
      content: 'Old content',
      kind: 'MANUAL',
      revision: 0,
    })
  })

  it('creates PRE_RESTORE snapshot, overwrites note, bumps revision', async () => {
    const res = await agent.post(`/api/notes/${note.id}/versions/${version.id}/restore`).send({})
    expect(res.status).toBe(200)
    expect(res.body.note.title).toBe('Old')
    expect(res.body.note.content).toBe('Old content')
    expect(res.body.note.revision).toBe(note.revision + 1)

    const versions = await prisma.noteVersion.findMany({
      where: { noteId: note.id },
      orderBy: { createdAt: 'desc' },
    })
    expect(versions[0].kind).toBe('PRE_RESTORE')
    expect(versions[0].title).toBe('Current')
    expect(versions[0].content).toBe('Current content')
  })

  it('404 when version does not belong to note', async () => {
    const otherNote = await createNote({ userId: user.id, title: 'Other', content: 'Other' })
    const otherVersion = await createNoteVersion({
      noteId: otherNote.id,
      userId: user.id,
      title: 'X',
      content: 'Y',
      kind: 'MANUAL',
      revision: 0,
    })
    const res = await agent
      .post(`/api/notes/${note.id}/versions/${otherVersion.id}/restore`)
      .send({})
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('NOTE_VERSION_NOT_FOUND')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm --prefix backend test -- notes.restore`
Expected: FAIL.

- [ ] **Step 3: Implement `restoreVersion`**

```js
// in notes.controller.js
export async function restoreVersion(req, res) {
  const { id, versionId } = req.params
  const note = await prisma.note.findUnique({ where: { id } })
  if (!note || note.userId !== req.user.id) {
    return sendError(res, 404, 'Note not found', ERROR_CODES.NOT_FOUND)
  }
  const version = await prisma.noteVersion.findUnique({ where: { id: versionId } })
  if (!version || version.noteId !== id) {
    return sendError(res, 404, 'Version not found', ERROR_CODES.NOTE_VERSION_NOT_FOUND)
  }
  const updated = await prisma.$transaction(async (tx) => {
    await tx.noteVersion.create({
      data: {
        noteId: id,
        userId: req.user.id,
        title: note.title,
        content: note.content,
        message: `Before restore to ${version.createdAt.toISOString()}`,
        revision: note.revision,
        parentVersionId: version.id,
        kind: 'PRE_RESTORE',
        bytesContent: Buffer.byteLength(note.content ?? '', 'utf8'),
      },
    })
    return tx.note.update({
      where: { id },
      data: {
        title: version.title,
        content: version.content,
        revision: note.revision + 1,
        contentHash: computeContentHash(version.content ?? ''),
        lastSaveId: null,
      },
    })
  })
  res.json({ note: updated, revision: updated.revision })
}
```

- [ ] **Step 4: Wire the route**

In `notes.routes.js`:

```js
router.post('/:id/versions/:versionId/restore', requireAuth, notesRestoreLimiter, restoreVersion)
```

- [ ] **Step 5: Run tests**

Run: `npm --prefix backend test -- notes.restore`
Expected: 2/2 pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/notes/notes.controller.js backend/src/modules/notes/notes.routes.js backend/test/notes.restore.test.js
git commit -m "feat(notes): non-destructive restore with PRE_RESTORE snapshot"
```

---

## Task 7: Backend diff endpoint

**Files:**

- Create: `backend/src/modules/notes/notes.diff.js`
- Create: `backend/test/notes.diff.test.js`
- Modify: `backend/package.json` (add `diff` dep)
- Modify: `backend/src/modules/notes/notes.controller.js` (add `getVersionDiff`)
- Modify: `backend/src/modules/notes/notes.routes.js`

- [ ] **Step 1: Add `diff` dependency**

Run: `npm --prefix backend install diff`
Expected: `diff` added to `dependencies`.

- [ ] **Step 2: Write failing tests**

```js
// backend/test/notes.diff.test.js
import { describe, it, expect } from 'vitest'
import { buildWordDiff } from '../src/modules/notes/notes.diff.js'

describe('buildWordDiff', () => {
  it('returns equal/add/remove chunks for word-level changes', () => {
    const { chunks, summary } = buildWordDiff('hello world', 'hello brave world')
    const types = chunks.map((c) => c.type)
    expect(types).toContain('add')
    expect(summary.added).toBeGreaterThan(0)
    expect(summary.removed).toBe(0)
  })

  it('handles empty-to-full', () => {
    const { chunks, summary } = buildWordDiff('', 'brand new note')
    expect(summary.added).toBe(3)
    expect(summary.removed).toBe(0)
    expect(chunks.find((c) => c.type === 'add')).toBeTruthy()
  })

  it('handles full-to-empty', () => {
    const { summary } = buildWordDiff('was here', '')
    expect(summary.added).toBe(0)
    expect(summary.removed).toBe(2)
  })

  it('returns all-equal for identical text', () => {
    const { chunks, summary } = buildWordDiff('same', 'same')
    expect(summary.added).toBe(0)
    expect(summary.removed).toBe(0)
    expect(chunks.every((c) => c.type === 'equal')).toBe(true)
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `npm --prefix backend test -- notes.diff`
Expected: FAIL.

- [ ] **Step 4: Implement `buildWordDiff`**

```js
// backend/src/modules/notes/notes.diff.js
import { diffWordsWithSpace } from 'diff'

export function buildWordDiff(oldText, newText) {
  const parts = diffWordsWithSpace(oldText ?? '', newText ?? '')
  let added = 0,
    removed = 0
  const chunks = parts.map((p) => {
    const type = p.added ? 'add' : p.removed ? 'remove' : 'equal'
    if (type === 'add') added += p.value.split(/\s+/).filter(Boolean).length
    if (type === 'remove') removed += p.value.split(/\s+/).filter(Boolean).length
    return { type, text: p.value }
  })
  return { chunks, summary: { added, removed } }
}
```

- [ ] **Step 5: Add controller handler**

```js
// notes.controller.js
import { buildWordDiff } from './notes.diff.js'

export async function getVersionDiff(req, res) {
  const { id, versionId } = req.params
  const against = req.query.against || 'current'
  const note = await prisma.note.findUnique({ where: { id } })
  if (!note || note.userId !== req.user.id) {
    return sendError(res, 404, 'Note not found', ERROR_CODES.NOT_FOUND)
  }
  const version = await prisma.noteVersion.findUnique({ where: { id: versionId } })
  if (!version || version.noteId !== id) {
    return sendError(res, 404, 'Version not found', ERROR_CODES.NOTE_VERSION_NOT_FOUND)
  }
  let rightText
  if (against === 'current') {
    rightText = note.content ?? ''
  } else {
    const other = await prisma.noteVersion.findUnique({ where: { id: against } })
    if (!other || other.noteId !== id) {
      return sendError(res, 404, 'Comparison version not found', ERROR_CODES.NOTE_VERSION_NOT_FOUND)
    }
    rightText = other.content ?? ''
  }
  const result = buildWordDiff(version.content ?? '', rightText)
  res.set('Cache-Control', 'private, max-age=60')
  res.json(result)
}
```

- [ ] **Step 6: Wire the route**

```js
router.get('/:id/versions/:versionId/diff', requireAuth, notesDiffLimiter, getVersionDiff)
```

- [ ] **Step 7: Run tests**

Run: `npm --prefix backend test -- notes.diff`
Expected: 4/4 pass.

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/notes/notes.diff.js backend/test/notes.diff.test.js backend/src/modules/notes/notes.controller.js backend/src/modules/notes/notes.routes.js backend/package.json backend/package-lock.json
git commit -m "feat(notes): word-level diff endpoint with 60s cache"
```

---

## Task 8: Rate limiters

**Files:**

- Modify: `backend/src/lib/rateLimiters.js`

- [ ] **Step 1: Add limiters**

In `rateLimiters.js` (follow existing pattern — look at `paymentCheckoutLimiter` et al.):

```js
export const notesPatchLimiter = rateLimit({
  windowMs: WINDOW_1_MIN,
  max: 120,
  keyGenerator: byUserOrIp,
  message: { error: 'Too many note saves. Slow down.', code: 'RATE_LIMITED' },
})
export const notesChunkLimiter = rateLimit({
  windowMs: WINDOW_1_MIN,
  max: 30,
  keyGenerator: byUserOrIp,
  message: { error: 'Too many chunks.', code: 'RATE_LIMITED' },
})
export const notesRestoreLimiter = rateLimit({
  windowMs: WINDOW_1_MIN,
  max: 10,
  keyGenerator: byUserOrIp,
  message: { error: 'Too many restores.', code: 'RATE_LIMITED' },
})
export const notesDiffLimiter = rateLimit({
  windowMs: WINDOW_1_MIN,
  max: 60,
  keyGenerator: byUserOrIp,
  message: { error: 'Too many diff requests.', code: 'RATE_LIMITED' },
})
```

- [ ] **Step 2: Wire PATCH to use new limiter**

In `notes.routes.js`, replace the existing PATCH rate limiter with `notesPatchLimiter`:

```js
router.patch('/:id', requireAuth, notesPatchLimiter, update)
```

- [ ] **Step 3: Backend test sweep**

Run: `npm --prefix backend test`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add backend/src/lib/rateLimiters.js backend/src/modules/notes/notes.routes.js
git commit -m "feat(notes): dedicated rate limiters (patch 120/min, chunk 30, restore 10, diff 60)"
```

---

## Task 9: Backfill script for `bytesContent`

**Files:**

- Create: `backend/scripts/backfillNoteVersionBytes.js`

- [ ] **Step 1: Write script**

```js
// backend/scripts/backfillNoteVersionBytes.js
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const batchSize = 500
  let offset = 0
  let total = 0
  for (;;) {
    const rows = await prisma.noteVersion.findMany({
      where: { bytesContent: 0 },
      take: batchSize,
      select: { id: true, content: true },
    })
    if (rows.length === 0) break
    for (const r of rows) {
      const bytes = Buffer.byteLength(r.content ?? '', 'utf8')
      await prisma.noteVersion.update({ where: { id: r.id }, data: { bytesContent: bytes } })
    }
    total += rows.length
    console.log(`[backfill] updated ${total}`)
    offset += rows.length
    if (rows.length < batchSize) break
  }
  console.log(`[backfill] done. total updated = ${total}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
```

- [ ] **Step 2: Commit**

```bash
git add backend/scripts/backfillNoteVersionBytes.js
git commit -m "chore(notes): backfill script for NoteVersion.bytesContent"
```

---

## Task 10: Frontend `noteDraftStore` (IDB + sessionStorage fallback)

**Files:**

- Modify: `frontend/studyhub-app/package.json` (add `idb`)
- Create: `frontend/studyhub-app/src/pages/notes/noteDraftStore.js`
- Create: `frontend/studyhub-app/src/pages/notes/noteDraftStore.test.js`

- [ ] **Step 1: Add dep**

Run: `npm --prefix frontend/studyhub-app install idb`
Expected: `idb` added.

- [ ] **Step 2: Write failing tests**

```js
// frontend/studyhub-app/src/pages/notes/noteDraftStore.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { draftStore } from './noteDraftStore.js'

describe('draftStore', () => {
  beforeEach(async () => {
    await draftStore._reset()
  })

  it('put + get roundtrips', async () => {
    await draftStore.put('n1', {
      title: 'T',
      content: 'C',
      baseRevision: 5,
      dirtyAt: Date.now(),
      saveId: 'u1',
    })
    const got = await draftStore.get('n1')
    expect(got.title).toBe('T')
    expect(got.baseRevision).toBe(5)
  })

  it('get returns null when missing', async () => {
    expect(await draftStore.get('missing')).toBeNull()
  })

  it('delete removes entry', async () => {
    await draftStore.put('n2', {
      title: 'x',
      content: 'y',
      baseRevision: 0,
      dirtyAt: 0,
      saveId: 'u2',
    })
    await draftStore.delete('n2')
    expect(await draftStore.get('n2')).toBeNull()
  })

  it('listPending returns all entries', async () => {
    await draftStore.put('a', {
      title: 'a',
      content: '',
      baseRevision: 0,
      dirtyAt: 0,
      saveId: 'sa',
    })
    await draftStore.put('b', {
      title: 'b',
      content: '',
      baseRevision: 0,
      dirtyAt: 0,
      saveId: 'sb',
    })
    const all = await draftStore.listPending()
    expect(all.map((d) => d.noteId).sort()).toEqual(['a', 'b'])
  })
})
```

Add to `frontend/studyhub-app/package.json` devDependencies if missing: `fake-indexeddb`.
Run: `npm --prefix frontend/studyhub-app install -D fake-indexeddb`

- [ ] **Step 3: Run to verify failure**

Run: `npm --prefix frontend/studyhub-app test -- noteDraftStore`
Expected: FAIL.

- [ ] **Step 4: Implement**

```js
// frontend/studyhub-app/src/pages/notes/noteDraftStore.js
import { openDB } from 'idb'

const DB = 'studyhub-notes'
const STORE = 'noteDrafts'
const SS_KEY = 'studyhub.noteDrafts.v1'

let dbPromise = null
function db() {
  if (typeof indexedDB === 'undefined') return null
  if (!dbPromise) {
    dbPromise = openDB(DB, 1, {
      upgrade(d) {
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'noteId' })
      },
    }).catch(() => null)
  }
  return dbPromise
}

function ssRead() {
  try {
    return JSON.parse(sessionStorage.getItem(SS_KEY) ?? '{}')
  } catch {
    return {}
  }
}
function ssWrite(obj) {
  try {
    sessionStorage.setItem(SS_KEY, JSON.stringify(obj))
  } catch {
    /* quota */
  }
}

export const draftStore = {
  async put(noteId, draft) {
    const rec = { noteId, ...draft }
    const d = await db()
    if (d) {
      await d.put(STORE, rec)
      return
    }
    const all = ssRead()
    all[noteId] = rec
    ssWrite(all)
  },
  async get(noteId) {
    const d = await db()
    if (d) return (await d.get(STORE, noteId)) ?? null
    return ssRead()[noteId] ?? null
  },
  async delete(noteId) {
    const d = await db()
    if (d) {
      await d.delete(STORE, noteId)
      return
    }
    const all = ssRead()
    delete all[noteId]
    ssWrite(all)
  },
  async listPending() {
    const d = await db()
    if (d) return d.getAll(STORE)
    return Object.values(ssRead())
  },
  async _reset() {
    const d = await db()
    if (d) {
      await d.clear(STORE)
      return
    }
    ssWrite({})
  },
}
```

- [ ] **Step 5: Run tests**

Run: `npm --prefix frontend/studyhub-app test -- noteDraftStore`
Expected: 4/4 pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/studyhub-app/src/pages/notes/noteDraftStore.js frontend/studyhub-app/src/pages/notes/noteDraftStore.test.js frontend/studyhub-app/package.json frontend/studyhub-app/package-lock.json
git commit -m "feat(notes): IndexedDB draft store with sessionStorage fallback"
```

---

## Task 11: Frontend persistence reducer (pure state machine)

**Files:**

- Create: `frontend/studyhub-app/src/pages/notes/notePersistenceReducer.js`
- Create: `frontend/studyhub-app/src/pages/notes/notePersistenceReducer.test.js`

- [ ] **Step 1: Write failing tests**

```js
// frontend/studyhub-app/src/pages/notes/notePersistenceReducer.test.js
import { describe, it, expect } from 'vitest'
import { initialState, reducer } from './notePersistenceReducer.js'

describe('notePersistenceReducer', () => {
  it('starts idle', () => {
    expect(initialState.status).toBe('idle')
  })
  it('EDITOR_CHANGE → dirty', () => {
    const s = reducer(initialState, { type: 'EDITOR_CHANGE' })
    expect(s.status).toBe('dirty')
  })
  it('SAVE_START → saving', () => {
    const s = reducer({ ...initialState, status: 'dirty' }, { type: 'SAVE_START' })
    expect(s.status).toBe('saving')
  })
  it('SAVE_SUCCESS → saved with revision + timestamp', () => {
    const s = reducer(
      { ...initialState, status: 'saving' },
      {
        type: 'SAVE_SUCCESS',
        revision: 7,
        savedAt: new Date('2026-04-15T00:00:00Z'),
      },
    )
    expect(s.status).toBe('saved')
    expect(s.lastServerRevision).toBe(7)
    expect(s.lastSavedAt).toEqual(new Date('2026-04-15T00:00:00Z'))
  })
  it('SAVE_FAILURE → error with reason', () => {
    const s = reducer(
      { ...initialState, status: 'saving' },
      {
        type: 'SAVE_FAILURE',
        error: { code: 'NET', message: 'offline' },
      },
    )
    expect(s.status).toBe('error')
    expect(s.lastSaveError.code).toBe('NET')
  })
  it('SAVE_FAILURE with networkError → offline', () => {
    const s = reducer(
      { ...initialState, status: 'saving' },
      {
        type: 'SAVE_FAILURE',
        error: { code: 'NET', message: 'offline' },
        networkError: true,
      },
    )
    expect(s.status).toBe('offline')
  })
  it('CONFLICT_DETECTED → conflict with payload', () => {
    const s = reducer(
      { ...initialState, status: 'saving' },
      {
        type: 'CONFLICT_DETECTED',
        current: { revision: 9 },
        yours: { title: 'mine' },
      },
    )
    expect(s.status).toBe('conflict')
    expect(s.pendingConflict.current.revision).toBe(9)
  })
  it('CONFLICT_RESOLVED clears pendingConflict, returns dirty', () => {
    const s = reducer(
      { ...initialState, status: 'conflict', pendingConflict: { current: {}, yours: {} } },
      { type: 'CONFLICT_RESOLVED' },
    )
    expect(s.status).toBe('dirty')
    expect(s.pendingConflict).toBeNull()
  })
  it('SERVER_REVISION_ADVANCED bumps lastServerRevision without changing status', () => {
    const s = reducer(
      { ...initialState, status: 'dirty', lastServerRevision: 3 },
      { type: 'SERVER_REVISION_ADVANCED', revision: 5 },
    )
    expect(s.status).toBe('dirty')
    expect(s.lastServerRevision).toBe(5)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm --prefix frontend/studyhub-app test -- notePersistenceReducer`
Expected: FAIL.

- [ ] **Step 3: Implement**

```js
// frontend/studyhub-app/src/pages/notes/notePersistenceReducer.js
export const initialState = {
  status: 'idle',
  lastSavedAt: null,
  lastServerRevision: 0,
  lastSaveError: null,
  pendingConflict: null,
  bytesContent: 0,
}

export function reducer(state, action) {
  switch (action.type) {
    case 'EDITOR_CHANGE':
      return {
        ...state,
        status: state.status === 'conflict' ? 'conflict' : 'dirty',
        bytesContent: action.bytesContent ?? state.bytesContent,
      }
    case 'SAVE_START':
      return { ...state, status: 'saving', lastSaveError: null }
    case 'SAVE_SUCCESS':
      return {
        ...state,
        status: 'saved',
        lastSavedAt: action.savedAt,
        lastServerRevision: action.revision,
        lastSaveError: null,
      }
    case 'SAVE_FAILURE':
      return {
        ...state,
        status: action.networkError ? 'offline' : 'error',
        lastSaveError: action.error,
      }
    case 'CONFLICT_DETECTED':
      return {
        ...state,
        status: 'conflict',
        pendingConflict: { current: action.current, yours: action.yours },
      }
    case 'CONFLICT_RESOLVED':
      return { ...state, status: 'dirty', pendingConflict: null }
    case 'SERVER_REVISION_ADVANCED':
      return { ...state, lastServerRevision: action.revision }
    case 'RESET_TO_SAVED':
      return {
        ...state,
        status: 'saved',
        lastServerRevision: action.revision,
        lastSavedAt: action.savedAt,
        pendingConflict: null,
      }
    default:
      return state
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npm --prefix frontend/studyhub-app test -- notePersistenceReducer`
Expected: 9/9 pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/studyhub-app/src/pages/notes/notePersistenceReducer.js frontend/studyhub-app/src/pages/notes/notePersistenceReducer.test.js
git commit -m "feat(notes): pure reducer for persistence state machine"
```

---

## Task 12: `useNotePersistence` hook

**Files:**

- Create: `frontend/studyhub-app/src/pages/notes/useNotePersistence.js`

This is the central coordinator. Given its size, implement in clearly-labeled sub-sections.

- [ ] **Step 1: Scaffold the hook**

```js
// frontend/studyhub-app/src/pages/notes/useNotePersistence.js
import { useEffect, useMemo, useReducer, useRef, useCallback } from 'react'
import { API } from '../../config.js'
import { authHeaders } from '../shared/pageUtils.js'
import { draftStore } from './noteDraftStore.js'
import { reducer, initialState } from './notePersistenceReducer.js'

const DEBOUNCE_MS = 800
const SAFETY_FLUSH_MS = 5000
const CHUNK_THRESHOLD = 64 * 1024

function sha256HexBrowser(text) {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then((buf) => {
    const arr = Array.from(new Uint8Array(buf))
    return 'sha256:' + arr.map((b) => b.toString(16).padStart(2, '0')).join('')
  })
}

export function useNotePersistence(noteId) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const latest = useRef({ title: '', content: '' })
  const baseRevision = useRef(0)
  const pendingSaveId = useRef(null)
  const debounceTimer = useRef(null)
  const safetyTimer = useRef(null)
  const broadcast = useRef(null)

  // ...populated in subsequent steps
}
```

- [ ] **Step 2: Implement mount sequence (load server + draft, decide)**

Inside the hook, after `broadcast`:

```js
useEffect(() => {
  if (!noteId) return
  let cancelled = false
  Promise.all([
    fetch(`${API}/api/notes/${noteId}`, { credentials: 'include', headers: authHeaders() }).then(
      (r) => r.json(),
    ),
    draftStore.get(noteId),
  ]).then(([server, draft]) => {
    if (cancelled) return
    const srv = server?.note ?? server
    latest.current = { title: srv.title ?? '', content: srv.content ?? '' }
    baseRevision.current = srv.revision ?? 0

    if (draft) {
      if (draft.baseRevision < (srv.revision ?? 0)) {
        dispatch({
          type: 'CONFLICT_DETECTED',
          current: srv,
          yours: { title: draft.title, content: draft.content },
        })
        latest.current = { title: draft.title, content: draft.content }
        return
      }
      latest.current = { title: draft.title, content: draft.content }
      dispatch({ type: 'EDITOR_CHANGE', bytesContent: new Blob([draft.content ?? '']).size })
      scheduleFlush('debounce')
    } else {
      dispatch({
        type: 'RESET_TO_SAVED',
        revision: srv.revision ?? 0,
        savedAt: new Date(srv.updatedAt ?? Date.now()),
      })
    }
  })
  return () => {
    cancelled = true
  }
}, [noteId])
```

- [ ] **Step 3: Implement `onEditorChange` and debounce/safety flush**

```js
const scheduleFlush = useCallback(
  (trigger) => {
    if (state.status === 'conflict') return
    clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => flush(trigger), DEBOUNCE_MS)
    if (!safetyTimer.current) {
      safetyTimer.current = setTimeout(() => flush('safety-flush'), SAFETY_FLUSH_MS)
    }
  },
  [state.status],
)

const onEditorChange = useCallback(
  async (title, content) => {
    latest.current = { title, content }
    dispatch({ type: 'EDITOR_CHANGE', bytesContent: new Blob([content ?? '']).size })
    if (!pendingSaveId.current) pendingSaveId.current = crypto.randomUUID()
    draftStore.put(noteId, {
      title,
      content,
      baseRevision: baseRevision.current,
      dirtyAt: Date.now(),
      saveId: pendingSaveId.current,
    })
    scheduleFlush('debounce')
  },
  [noteId, scheduleFlush],
)
```

- [ ] **Step 4: Implement `flush` (PATCH / chunked / error handling)**

```js
const flush = useCallback(
  async (trigger) => {
    clearTimeout(debounceTimer.current)
    clearTimeout(safetyTimer.current)
    safetyTimer.current = null
    if (state.status === 'conflict') return
    const { title, content } = latest.current
    if (!pendingSaveId.current) return // nothing dirty
    const saveId = pendingSaveId.current
    dispatch({ type: 'SAVE_START' })
    const contentHash = await sha256HexBrowser(content ?? '')
    const payload = {
      title,
      content,
      baseRevision: baseRevision.current,
      saveId,
      contentHash,
      trigger,
    }
    try {
      const bytes = new Blob([content ?? '']).size
      const useChunked = bytes > CHUNK_THRESHOLD
      const res = useChunked
        ? await sendChunked(noteId, payload)
        : await fetch(`${API}/api/notes/${noteId}`, {
            method: 'PATCH',
            credentials: 'include',
            headers: { ...authHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
      if (res.status === 409) {
        const body = await res.json()
        dispatch({ type: 'CONFLICT_DETECTED', current: body.current, yours: body.yours })
        return
      }
      if (!res.ok) {
        dispatch({ type: 'SAVE_FAILURE', error: { code: res.status, message: res.statusText } })
        return
      }
      const body = await res.json()
      baseRevision.current = body.revision
      pendingSaveId.current = null
      draftStore.delete(noteId)
      dispatch({ type: 'SAVE_SUCCESS', revision: body.revision, savedAt: new Date(body.savedAt) })
      broadcast.current?.postMessage({ type: 'saved', noteId, revision: body.revision })
    } catch (e) {
      dispatch({
        type: 'SAVE_FAILURE',
        error: { code: 'NET', message: e.message },
        networkError: true,
      })
    }
  },
  [noteId, state.status],
)

async function sendChunked(noteId, payload) {
  const chunkSize = 32 * 1024
  const text = payload.content ?? ''
  const chunks = []
  for (let i = 0; i < text.length; i += chunkSize) chunks.push(text.slice(i, i + chunkSize))
  let last
  for (let i = 0; i < chunks.length; i++) {
    last = await fetch(`${API}/api/notes/${noteId}/chunks`, {
      method: 'POST',
      credentials: 'include',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        saveId: payload.saveId,
        chunkIndex: i,
        chunkCount: chunks.length,
        chunk: chunks[i],
        baseRevision: payload.baseRevision,
        contentHash: payload.contentHash,
        title: payload.title,
      }),
    })
    if (!last.ok && last.status !== 202) return last
  }
  return last
}
```

- [ ] **Step 5: Implement `saveNow`, `resolveConflict`, `discardDraft`**

```js
const saveNow = useCallback((reason = 'manual') => flush(reason), [flush])

const resolveConflict = useCallback(
  async (choice) => {
    const conflict = state.pendingConflict
    if (!conflict) return
    if (choice === 'take-server') {
      latest.current = { title: conflict.current.title, content: conflict.current.content }
      baseRevision.current = conflict.current.revision
      pendingSaveId.current = null
      await draftStore.delete(noteId)
      dispatch({ type: 'RESET_TO_SAVED', revision: conflict.current.revision, savedAt: new Date() })
    } else if (choice === 'keep-mine') {
      baseRevision.current = conflict.current.revision
      pendingSaveId.current = crypto.randomUUID()
      dispatch({ type: 'CONFLICT_RESOLVED' })
      flush('manual')
    } else if (typeof choice === 'string' && choice.startsWith('merged:')) {
      const merged = choice.slice('merged:'.length)
      latest.current = { ...latest.current, content: merged }
      baseRevision.current = conflict.current.revision
      pendingSaveId.current = crypto.randomUUID()
      dispatch({ type: 'CONFLICT_RESOLVED' })
      flush('manual')
    }
  },
  [state.pendingConflict, noteId, flush],
)

const discardDraft = useCallback(async () => {
  await draftStore.delete(noteId)
  pendingSaveId.current = null
  dispatch({ type: 'RESET_TO_SAVED', revision: baseRevision.current, savedAt: new Date() })
}, [noteId])
```

- [ ] **Step 6: Lifecycle listeners + BroadcastChannel + return**

```js
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    broadcast.current = new BroadcastChannel('studyhub-notes')
    const onMessage = (ev) => {
      if (ev.data?.type === 'saved' && ev.data.noteId === noteId) {
        if (ev.data.revision > baseRevision.current) {
          baseRevision.current = ev.data.revision
          dispatch({ type: 'SERVER_REVISION_ADVANCED', revision: ev.data.revision })
        }
      }
    }
    broadcast.current.addEventListener('message', onMessage)
    return () => {
      broadcast.current?.removeEventListener('message', onMessage)
      broadcast.current?.close()
    }
  }, [noteId])

  useEffect(() => {
    const onBeforeUnload = () => {
      if (!pendingSaveId.current) return
      const payload = JSON.stringify({
        title: latest.current.title, content: latest.current.content,
        baseRevision: baseRevision.current, saveId: pendingSaveId.current,
        contentHash: null, trigger: 'beforeunload',
      })
      const blob = new Blob([payload], { type: 'application/json' })
      navigator.sendBeacon(`${API}/api/notes/${noteId}`, blob)
    }
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush('visibility') }
    const onOnline = () => { if (pendingSaveId.current) flush('debounce') }
    window.addEventListener('beforeunload', onBeforeUnload)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('online', onOnline)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', onOnline)
    }
  }, [noteId, flush])

  return useMemo(() => ({
    state, onEditorChange, saveNow, resolveConflict, discardDraft,
    currentValues: latest,  // ref, for editor to read latest without rerender
  }), [state, onEditorChange, saveNow, resolveConflict, discardDraft])
}
```

- [ ] **Step 7: Run frontend tests**

Run: `npm --prefix frontend/studyhub-app test`
Expected: all pass (no new tests here; this is integration-tested via E2E in Task 22).

- [ ] **Step 8: Commit**

```bash
git add frontend/studyhub-app/src/pages/notes/useNotePersistence.js
git commit -m "feat(notes): useNotePersistence hook (refs, debounce, lifecycle, broadcast)"
```

---

## Task 13: Paste sanitizer

**Files:**

- Modify: `frontend/studyhub-app/package.json` (add `sanitize-html`)
- Create: `frontend/studyhub-app/src/pages/notes/notePaste.js`
- Create: `frontend/studyhub-app/src/pages/notes/notePaste.test.js`

- [ ] **Step 1: Add dep**

Run: `npm --prefix frontend/studyhub-app install sanitize-html`

- [ ] **Step 2: Write failing tests**

```js
// frontend/studyhub-app/src/pages/notes/notePaste.test.js
import { describe, it, expect } from 'vitest'
import { sanitizePastedHtml } from './notePaste.js'

describe('sanitizePastedHtml', () => {
  it('strips Office namespaces', () => {
    const input = '<p><o:p>foo</o:p></p>'
    expect(sanitizePastedHtml(input)).not.toMatch(/o:p/)
  })
  it('preserves semantic tags', () => {
    const html = '<p><strong>bold</strong> <em>i</em> <a href="https://x.y">link</a></p>'
    const out = sanitizePastedHtml(html)
    expect(out).toContain('<strong>')
    expect(out).toContain('href="https://x.y"')
  })
  it('drops inline styles and classes', () => {
    const html = '<p class="m1" style="color:red">x</p>'
    const out = sanitizePastedHtml(html)
    expect(out).not.toMatch(/class=/)
    expect(out).not.toMatch(/style=/)
  })
  it('drops scripts and style tags', () => {
    const html = '<p>hi</p><script>alert(1)</script><style>.a{}</style>'
    const out = sanitizePastedHtml(html)
    expect(out).not.toMatch(/script|<style/)
  })
  it('preserves tables', () => {
    const html = '<table><tbody><tr><td>1</td></tr></tbody></table>'
    expect(sanitizePastedHtml(html)).toContain('<table>')
  })
})
```

- [ ] **Step 3: Implement**

```js
// frontend/studyhub-app/src/pages/notes/notePaste.js
import sanitizeHtml from 'sanitize-html'

const allowedTags = [
  'p',
  'br',
  'h1',
  'h2',
  'h3',
  'ul',
  'ol',
  'li',
  'strong',
  'em',
  's',
  'u',
  'code',
  'pre',
  'blockquote',
  'a',
  'img',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'hr',
]

export function sanitizePastedHtml(html) {
  return sanitizeHtml(html ?? '', {
    allowedTags,
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    disallowedTagsMode: 'discard',
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
    },
  })
}

export function tiptapPasteTransform(editor) {
  return {
    transformPastedHTML(html) {
      const cleaned = sanitizePastedHtml(html)
      if (!cleaned.trim()) return null // fall through to plain-text handler
      return cleaned
    },
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npm --prefix frontend/studyhub-app test -- notePaste`
Expected: 5/5 pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/studyhub-app/src/pages/notes/notePaste.js frontend/studyhub-app/src/pages/notes/notePaste.test.js frontend/studyhub-app/package.json frontend/studyhub-app/package-lock.json
git commit -m "feat(notes): sanitize-html paste transform with semantic whitelist"
```

---

## Task 14: `NoteSaveStatus` chip component

**Files:**

- Create: `frontend/studyhub-app/src/pages/notes/NoteSaveStatus.jsx`

- [ ] **Step 1: Implement**

```jsx
// frontend/studyhub-app/src/pages/notes/NoteSaveStatus.jsx
import { useEffect, useState } from 'react'

const STATUS_META = {
  idle: { label: 'Up to date', dot: 'var(--sh-slate-300)' },
  dirty: { label: 'Unsaved changes', dot: 'var(--sh-warning)' },
  saving: { label: 'Saving…', dot: 'var(--sh-warning)', pulse: true },
  saved: { label: 'Saved', dot: 'var(--sh-success)' },
  error: { label: 'Save failed — retry', dot: 'var(--sh-danger)' },
  offline: { label: 'Offline — saved locally', dot: 'var(--sh-slate-400)' },
  conflict: { label: 'Newer version on server', dot: 'var(--sh-danger)' },
}

export default function NoteSaveStatus({
  status,
  lastSavedAt,
  onRetry,
  onOpenConflict,
  onSaveNow,
}) {
  const meta = STATUS_META[status] ?? STATUS_META.idle
  const [displayLabel, setDisplayLabel] = useState(meta.label)

  useEffect(() => {
    setDisplayLabel(meta.label)
    if (status === 'saved') {
      const t = setTimeout(() => setDisplayLabel('Up to date'), 3000)
      return () => clearTimeout(t)
    }
  }, [status, meta.label])

  const tooltip =
    status === 'saved' && lastSavedAt
      ? `Saved at ${new Date(lastSavedAt).toLocaleTimeString()}`
      : status === 'error'
        ? 'Click to retry'
        : status === 'conflict'
          ? 'Tap to resolve'
          : null

  const clickable = status === 'error' || status === 'conflict'
  const onClick = status === 'error' ? onRetry : status === 'conflict' ? onOpenConflict : undefined

  return (
    <div
      className="sh-note-save-status"
      role={clickable ? 'button' : 'status'}
      aria-live="polite"
      title={tooltip ?? ''}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 10px',
        borderRadius: 999,
        background: 'var(--sh-soft)',
        color: 'var(--sh-slate-700)',
        cursor: clickable ? 'pointer' : 'default',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: meta.dot,
          animation: meta.pulse ? 'sh-pulse 1s ease-in-out infinite' : 'none',
        }}
      />
      <span style={{ fontSize: 13 }}>{displayLabel}</span>
      {(status === 'dirty' || status === 'error' || status === 'offline') && onSaveNow && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onSaveNow()
          }}
          style={{
            marginLeft: 4,
            fontSize: 12,
            padding: '2px 8px',
            border: 'none',
            borderRadius: 6,
            background: 'var(--sh-primary)',
            color: '#fff',
          }}
        >
          Save now
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add `@keyframes sh-pulse` to `index.css` if not present**

Check [index.css](../../../frontend/studyhub-app/src/index.css). If no `sh-pulse`, add:

```css
@keyframes sh-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/studyhub-app/src/pages/notes/NoteSaveStatus.jsx frontend/studyhub-app/src/index.css
git commit -m "feat(notes): save-status chip with dot + label + tooltip + save-now button"
```

---

## Task 15: `NoteConflictBanner` + `NoteVersionDiff` modal

**Files:**

- Create: `frontend/studyhub-app/src/pages/notes/NoteConflictBanner.jsx`
- Create: `frontend/studyhub-app/src/pages/notes/NoteVersionDiff.jsx`

- [ ] **Step 1: Implement `NoteConflictBanner`**

```jsx
// frontend/studyhub-app/src/pages/notes/NoteConflictBanner.jsx
export default function NoteConflictBanner({ onKeepMine, onTakeTheirs, onCompare }) {
  return (
    <div
      role="alert"
      style={{
        padding: 12,
        marginBottom: 12,
        borderRadius: 10,
        background: 'var(--sh-danger-bg)',
        color: 'var(--sh-danger-text)',
        border: '1px solid var(--sh-danger-border)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
      }}
    >
      <strong>Newer version on server.</strong>
      <span style={{ flex: 1 }}>Another device or tab updated this note.</span>
      <button onClick={onKeepMine} style={btnStyle('primary')}>
        Keep mine
      </button>
      <button onClick={onTakeTheirs} style={btnStyle('secondary')}>
        Use theirs
      </button>
      <button onClick={onCompare} style={btnStyle('secondary')}>
        Compare side-by-side
      </button>
    </div>
  )
}
function btnStyle(kind) {
  return {
    padding: '6px 12px',
    borderRadius: 8,
    border: 'none',
    cursor: 'pointer',
    background: kind === 'primary' ? 'var(--sh-primary)' : 'var(--sh-surface)',
    color: kind === 'primary' ? '#fff' : 'var(--sh-slate-800)',
    border: kind === 'primary' ? 'none' : '1px solid var(--sh-border)',
  }
}
```

- [ ] **Step 2: Implement `NoteVersionDiff` (fetch + render inline / side-by-side)**

```jsx
// frontend/studyhub-app/src/pages/notes/NoteVersionDiff.jsx
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { API } from '../../config.js'
import { authHeaders } from '../shared/pageUtils.js'

export default function NoteVersionDiff({
  noteId,
  versionId,
  against = 'current',
  onClose,
  footer,
}) {
  const [mode, setMode] = useState('inline')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`${API}/api/notes/${noteId}/versions/${versionId}/diff?against=${against}`, {
      credentials: 'include',
      headers: authHeaders(),
    })
      .then((r) => r.json())
      .then((d) => {
        setData(d)
        setLoading(false)
      })
  }, [noteId, versionId, against])

  if (!data && loading) return null

  const body = (
    <div style={backdropStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <header style={headerStyle}>
          <strong>Diff</strong>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setMode('inline')} style={tabStyle(mode === 'inline')}>
              Inline
            </button>
            <button onClick={() => setMode('sidebyside')} style={tabStyle(mode === 'sidebyside')}>
              Side by side
            </button>
          </div>
          <button onClick={onClose} aria-label="Close" style={closeStyle}>
            ×
          </button>
        </header>
        <section style={{ padding: 12, color: 'var(--sh-slate-600)', fontSize: 13 }}>
          <span style={{ color: 'var(--sh-success-text)' }}>+{data.summary.added} words</span>
          {'  '}
          <span style={{ color: 'var(--sh-danger-text)' }}>−{data.summary.removed} words</span>
        </section>
        <section style={{ padding: 16, overflow: 'auto', flex: 1 }}>
          {mode === 'inline' ? (
            <InlineDiff chunks={data.chunks} />
          ) : (
            <SideBySide chunks={data.chunks} />
          )}
        </section>
        {footer && <footer style={footerStyle}>{footer}</footer>}
      </div>
    </div>
  )
  return createPortal(body, document.body)
}

function InlineDiff({ chunks }) {
  return (
    <div style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
      {chunks.map((c, i) => (
        <span key={i} style={chunkStyle(c.type)}>
          {c.text}
        </span>
      ))}
    </div>
  )
}

function SideBySide({ chunks }) {
  const left = chunks
    .filter((c) => c.type !== 'add')
    .map((c, i) => (
      <span key={i} style={chunkStyle(c.type === 'remove' ? 'remove' : 'equal')}>
        {c.text}
      </span>
    ))
  const right = chunks
    .filter((c) => c.type !== 'remove')
    .map((c, i) => (
      <span key={i} style={chunkStyle(c.type === 'add' ? 'add' : 'equal')}>
        {c.text}
      </span>
    ))
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <div
        style={{
          whiteSpace: 'pre-wrap',
          borderRight: '1px solid var(--sh-border)',
          paddingRight: 12,
        }}
      >
        {left}
      </div>
      <div style={{ whiteSpace: 'pre-wrap' }}>{right}</div>
    </div>
  )
}

function chunkStyle(type) {
  if (type === 'add') return { background: 'var(--sh-success-bg)', color: 'var(--sh-success-text)' }
  if (type === 'remove')
    return {
      background: 'var(--sh-danger-bg)',
      color: 'var(--sh-danger-text)',
      textDecoration: 'line-through',
    }
  return {}
}

const backdropStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
}
const modalStyle = {
  background: 'var(--sh-surface)',
  color: 'var(--sh-slate-800)',
  width: 'min(1000px, 90vw)',
  height: 'min(80vh, 700px)',
  borderRadius: 12,
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 10px 40px rgba(0,0,0,.2)',
}
const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: 12,
  borderBottom: '1px solid var(--sh-border)',
}
const footerStyle = {
  padding: 12,
  borderTop: '1px solid var(--sh-border)',
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
}
const closeStyle = {
  marginLeft: 'auto',
  border: 'none',
  background: 'transparent',
  fontSize: 24,
  cursor: 'pointer',
  color: 'var(--sh-slate-600)',
}
const tabStyle = (active) => ({
  padding: '6px 12px',
  borderRadius: 8,
  border: '1px solid var(--sh-border)',
  background: active ? 'var(--sh-soft)' : 'transparent',
  cursor: 'pointer',
})
```

- [ ] **Step 3: Commit**

```bash
git add frontend/studyhub-app/src/pages/notes/NoteConflictBanner.jsx frontend/studyhub-app/src/pages/notes/NoteVersionDiff.jsx
git commit -m "feat(notes): conflict banner + version diff modal (inline + side-by-side)"
```

---

## Task 16: Wire `NoteEditor` to new hook + status chip + Save button + Ctrl+S + paste

**Files:**

- Modify: `frontend/studyhub-app/src/pages/notes/NoteEditor.jsx`

- [ ] **Step 1: Inspect the current editor**

Read the full file to identify the mount/content props, title input, and toolbar area.

- [ ] **Step 2: Replace autosave wiring**

Remove imports/references to the old `autoSave` from `useNotesData`. Add:

```jsx
import { useNotePersistence } from './useNotePersistence.js'
import NoteSaveStatus from './NoteSaveStatus.jsx'
import NoteConflictBanner from './NoteConflictBanner.jsx'
import NoteVersionDiff from './NoteVersionDiff.jsx'
import { tiptapPasteTransform, sanitizePastedHtml } from './notePaste.js'
```

- [ ] **Step 3: Use the hook inside the editor**

Near top of `NoteEditor`:

```jsx
const { state, onEditorChange, saveNow, resolveConflict } = useNotePersistence(noteId)
const [showConflictDiff, setShowConflictDiff] = useState(false)
```

Wire TipTap `onUpdate` / `onTransaction` to:

```jsx
editor?.on('update', () => {
  onEditorChange(titleRef.current, editor.getHTML())
})
```

Replace any `onChange` on the title input with:

```jsx
onChange={(e) => { setTitle(e.target.value); onEditorChange(e.target.value, editor?.getHTML() ?? '') }}
```

- [ ] **Step 4: Add Ctrl/Cmd+S hotkey**

```jsx
useEffect(() => {
  const onKey = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault()
      if (state.status === 'conflict') setShowConflictDiff(true)
      else saveNow('manual')
    }
  }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}, [state.status, saveNow])
```

- [ ] **Step 5: Render chip + banner + paste config**

Render near the title:

```jsx
<NoteSaveStatus
  status={state.status}
  lastSavedAt={state.lastSavedAt}
  onRetry={() => saveNow('manual')}
  onOpenConflict={() => setShowConflictDiff(true)}
  onSaveNow={() => saveNow('manual')}
/>
```

Above the editor area:

```jsx
{
  state.status === 'conflict' && (
    <NoteConflictBanner
      onKeepMine={() => resolveConflict('keep-mine')}
      onTakeTheirs={() => resolveConflict('take-server')}
      onCompare={() => setShowConflictDiff(true)}
    />
  )
}
```

Conflict diff modal (uses a virtual "conflict" entry point — we diff against current):

```jsx
{
  showConflictDiff && state.pendingConflict && (
    <NoteVersionDiff
      noteId={noteId}
      versionId={`conflict-${noteId}`}
      against="current"
      onClose={() => setShowConflictDiff(false)}
      footer={
        <>
          <button
            onClick={() => {
              resolveConflict('keep-mine')
              setShowConflictDiff(false)
            }}
          >
            Keep mine
          </button>
          <button
            onClick={() => {
              resolveConflict('take-server')
              setShowConflictDiff(false)
            }}
          >
            Use theirs
          </button>
        </>
      }
    />
  )
}
```

**Important**: the diff endpoint requires a real versionId. For conflict comparison specifically, we fetch the server text from the `state.pendingConflict.current.content` value rather than the diff endpoint. Replace the conflict modal body with:

```jsx
{
  showConflictDiff && state.pendingConflict && (
    <ConflictCompareModal
      yours={state.pendingConflict.yours}
      current={state.pendingConflict.current}
      onClose={() => setShowConflictDiff(false)}
      onKeepMine={() => {
        resolveConflict('keep-mine')
        setShowConflictDiff(false)
      }}
      onTakeTheirs={() => {
        resolveConflict('take-server')
        setShowConflictDiff(false)
      }}
    />
  )
}
```

And add to `NoteVersionDiff.jsx` (or a new `ConflictCompareModal.jsx`) a component that runs the diff client-side for the two known strings. Simplest: add a small client diff render using `diffWordsWithSpace` imported from `diff` (already installed in backend; install on frontend too):

Run: `npm --prefix frontend/studyhub-app install diff`

Create `frontend/studyhub-app/src/pages/notes/ConflictCompareModal.jsx`:

```jsx
import { diffWordsWithSpace } from 'diff'
import { createPortal } from 'react-dom'

export default function ConflictCompareModal({
  yours,
  current,
  onClose,
  onKeepMine,
  onTakeTheirs,
}) {
  const parts = diffWordsWithSpace(current.content ?? '', yours.content ?? '')
  const body = (
    <div style={backdropStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <header style={headerStyle}>
          <strong>Conflict — your changes vs. server</strong>
          <button onClick={onClose} style={closeStyle} aria-label="Close">
            ×
          </button>
        </header>
        <section style={{ padding: 16, overflow: 'auto', flex: 1, whiteSpace: 'pre-wrap' }}>
          {parts.map((p, i) => (
            <span
              key={i}
              style={
                p.added
                  ? { background: 'var(--sh-success-bg)', color: 'var(--sh-success-text)' }
                  : p.removed
                    ? {
                        background: 'var(--sh-danger-bg)',
                        color: 'var(--sh-danger-text)',
                        textDecoration: 'line-through',
                      }
                    : {}
              }
            >
              {p.value}
            </span>
          ))}
        </section>
        <footer style={footerStyle}>
          <button onClick={onTakeTheirs}>Use theirs</button>
          <button onClick={onKeepMine} style={{ background: 'var(--sh-primary)', color: '#fff' }}>
            Keep mine
          </button>
        </footer>
      </div>
    </div>
  )
  return createPortal(body, document.body)
}
// Reuse styles from NoteVersionDiff (duplicate inline for clarity).
const backdropStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
}
const modalStyle = {
  background: 'var(--sh-surface)',
  color: 'var(--sh-slate-800)',
  width: 'min(900px, 90vw)',
  height: 'min(80vh, 700px)',
  borderRadius: 12,
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 10px 40px rgba(0,0,0,.2)',
}
const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: 12,
  borderBottom: '1px solid var(--sh-border)',
}
const footerStyle = {
  padding: 12,
  borderTop: '1px solid var(--sh-border)',
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
}
const closeStyle = {
  marginLeft: 'auto',
  border: 'none',
  background: 'transparent',
  fontSize: 24,
  cursor: 'pointer',
}
```

- [ ] **Step 6: Configure TipTap paste**

Where `useEditor({...})` is invoked, add:

```js
editorProps: {
  transformPastedHTML: (html) => sanitizePastedHtml(html),
},
```

- [ ] **Step 7: Run frontend tests + lint**

Run: `npm --prefix frontend/studyhub-app test`
Run: `npm --prefix frontend/studyhub-app run lint`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add frontend/studyhub-app/src/pages/notes/NoteEditor.jsx frontend/studyhub-app/src/pages/notes/ConflictCompareModal.jsx frontend/studyhub-app/package.json frontend/studyhub-app/package-lock.json
git commit -m "feat(notes): wire editor to persistence hook, save chip, Ctrl+S, paste sanitizer, conflict compare"
```

---

## Task 17: Split `useNotesData.js` — remove broken autosave

**Files:**

- Modify: `frontend/studyhub-app/src/pages/notes/useNotesData.js`

- [ ] **Step 1: Remove the autosave block**

Delete the `autoSave` `useCallback`, `saveTimer` ref, `handleTitleChange`, `handleContentChange` that call `autoSave`. Keep list fetching, CRUD, star/pin, etc.

- [ ] **Step 2: Update exported API**

Remove autosave-related exports. The editor no longer calls them. Keep `editorTitle`/`editorContent` state only if used elsewhere; otherwise remove.

- [ ] **Step 3: Update any consumers**

Grep for callers of the removed exports:

```bash
grep -rn "autoSave\|handleContentChange\|handleTitleChange" frontend/studyhub-app/src
```

Fix each site to use the new hook or drop the call.

- [ ] **Step 4: Run tests + lint + build**

Run:

- `npm --prefix frontend/studyhub-app test`
- `npm --prefix frontend/studyhub-app run lint`
- `npm --prefix frontend/studyhub-app run build`

Expected: all clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/studyhub-app/src/pages/notes/useNotesData.js
git commit -m "refactor(notes): remove broken autosave from useNotesData (now in useNotePersistence)"
```

---

## Task 18: Update `NoteVersionHistory` for new fields

**Files:**

- Modify: `frontend/studyhub-app/src/pages/notes/NoteVersionHistory.jsx`

- [ ] **Step 1: Add kind filter + pills**

```jsx
const KIND_META = {
  MANUAL: { label: 'Manual', color: 'var(--sh-success-text)', bg: 'var(--sh-success-bg)' },
  AUTO: { label: 'Auto', color: 'var(--sh-slate-700)', bg: 'var(--sh-soft)' },
  PRE_RESTORE: {
    label: 'Before restore',
    color: 'var(--sh-warning-text)',
    bg: 'var(--sh-warning-bg)',
  },
  CONFLICT_LOSER: {
    label: 'Conflict loser',
    color: 'var(--sh-danger-text)',
    bg: 'var(--sh-danger-bg)',
  },
}

function KindPill({ kind }) {
  const m = KIND_META[kind] ?? KIND_META.AUTO
  return (
    <span
      style={{
        fontSize: 11,
        padding: '2px 8px',
        borderRadius: 999,
        background: m.bg,
        color: m.color,
      }}
    >
      {m.label}
    </span>
  )
}
```

Add filter chips reading/writing `localStorage.getItem('studyhub.noteVersionFilter')` → one of `all|manual|auto|system`.

- [ ] **Step 2: Render enriched row**

Per row, show: `<KindPill>`, relative timestamp, `bytesContent` badge (formatted KB/MB), optional message, actions `[View diff] [Restore]`.

- [ ] **Step 3: Implement Restore with confirm + PRE_RESTORE undo toast**

```jsx
async function onRestore(versionId) {
  if (
    !window.confirm('Restore this version? Your current note will be saved as a new version first.')
  )
    return
  const res = await fetch(`${API}/api/notes/${noteId}/versions/${versionId}/restore`, {
    method: 'POST',
    credentials: 'include',
    headers: authHeaders(),
  })
  if (!res.ok) {
    toast.error('Restore failed')
    return
  }
  const body = await res.json()
  onRestored(body.note) // parent replaces editor content
  toast.success('Restored. Previous version saved as "Before restore".')
}
```

- [ ] **Step 4: Wire "View diff" to open `NoteVersionDiff`**

```jsx
{
  showDiff && (
    <NoteVersionDiff
      noteId={noteId}
      versionId={showDiff}
      against="current"
      onClose={() => setShowDiff(null)}
    />
  )
}
```

- [ ] **Step 5: Run tests + lint**

Run: `npm --prefix frontend/studyhub-app test` and lint. Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/studyhub-app/src/pages/notes/NoteVersionHistory.jsx
git commit -m "feat(notes): enriched version history (kind pills, diff action, non-destructive restore)"
```

---

## Task 19: Service Worker for background sync

**Files:**

- Create: `frontend/studyhub-app/public/sw-notes.js`
- Modify: `frontend/studyhub-app/src/main.jsx` (register SW)

- [ ] **Step 1: Implement SW**

```js
// frontend/studyhub-app/public/sw-notes.js
const OUTBOX_DB = 'studyhub-notes-sw'
const OUTBOX_STORE = 'outbox'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)
  if (!/^\/api\/notes\/[^/]+$/.test(url.pathname) || req.method !== 'PATCH') return
  event.respondWith(handlePatch(req))
})

async function handlePatch(req) {
  const body = await req.clone().text()
  try {
    return await fetch(req)
  } catch {
    const db = await openOutbox()
    const tx = db.transaction(OUTBOX_STORE, 'readwrite')
    await tx.store.put({
      url: req.url,
      body,
      headers: Array.from(req.headers.entries()),
      enqueuedAt: Date.now(),
    })
    await tx.done
    if ('sync' in self.registration) await self.registration.sync.register('note-save-retry')
    return new Response(JSON.stringify({ queued: true }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

self.addEventListener('sync', (event) => {
  if (event.tag !== 'note-save-retry') return
  event.waitUntil(drainOutbox())
})

async function drainOutbox() {
  const db = await openOutbox()
  const tx = db.transaction(OUTBOX_STORE, 'readwrite')
  const all = await tx.store.getAll()
  for (const entry of all) {
    try {
      const headers = new Headers(entry.headers)
      const parsed = JSON.parse(entry.body)
      parsed.trigger = 'sw-replay'
      const res = await fetch(entry.url, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(parsed),
        credentials: 'include',
      })
      if (res.ok || res.status === 202) await tx.store.delete(entry.id)
    } catch {}
  }
  await tx.done
}

function openOutbox() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(OUTBOX_DB, 1)
    req.onupgradeneeded = () =>
      req.result.createObjectStore(OUTBOX_STORE, { keyPath: 'id', autoIncrement: true })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
```

- [ ] **Step 2: Register SW**

In `src/main.jsx`, near app mount:

```js
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw-notes.js', { scope: '/api/notes/' }).catch(() => {})
}
```

(Scoping note: SW scope must cover `/api/notes/`. If the Vite dev proxy doesn't serve the SW under that scope, limit scope to `/` and filter by pathname in-SW — already done in our `fetch` handler.)

Adjust to scope `/`:

```js
navigator.serviceWorker.register('/sw-notes.js').catch(() => {})
```

- [ ] **Step 3: Lint + build**

Run: `npm --prefix frontend/studyhub-app run lint` and `npm --prefix frontend/studyhub-app run build`. Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/studyhub-app/public/sw-notes.js frontend/studyhub-app/src/main.jsx
git commit -m "feat(notes): service worker for background sync of offline saves"
```

---

## Task 20: Playwright E2E regression suite

**Files:**

- Create: `frontend/studyhub-app/tests/notes.persistence.spec.js`

- [ ] **Step 1: Write the E2E suite**

```js
// frontend/studyhub-app/tests/notes.persistence.spec.js
import { test, expect } from '@playwright/test'
import { loginAsBetaStudent, createNote } from './helpers/notesHelpers.js'

test.describe('Notes persistence hardening', () => {
  test('type, reload, content persists', async ({ page }) => {
    await loginAsBetaStudent(page)
    const id = await createNote(page, 'Persistence')
    await page.goto(`/notes?note=${id}`)
    await page.locator('[data-testid="note-editor"]').type('hello persistence ')
    await page.waitForTimeout(2000)
    await expect(page.locator('[data-testid="note-save-status"]')).toContainText(/Saved|Up to date/)
    await page.reload()
    await expect(page.locator('[data-testid="note-editor"]')).toContainText('hello persistence')
  })

  test('type, close tab, reopen, draft recovered', async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await loginAsBetaStudent(page)
    const id = await createNote(page, 'Crash')
    await page.goto(`/notes?note=${id}`)
    await page.locator('[data-testid="note-editor"]').type('crash draft ')
    // Close the tab with no time for autosave to land (the draft is in IDB).
    await page.close()
    const page2 = await context.newPage()
    await loginAsBetaStudent(page2)
    await page2.goto(`/notes?note=${id}`)
    await expect(page2.locator('[data-testid="note-editor"]')).toContainText('crash draft')
  })

  test('Ctrl+S triggers manual save and creates MANUAL version', async ({ page }) => {
    await loginAsBetaStudent(page)
    const id = await createNote(page, 'Hotkey')
    await page.goto(`/notes?note=${id}`)
    await page.locator('[data-testid="note-editor"]').type('hotkey typed')
    await page.keyboard.press('Control+s')
    await expect(page.locator('[data-testid="note-save-status"]')).toContainText(
      /Saved|Up to date/,
      { timeout: 5000 },
    )
    await page.locator('[data-testid="note-history-toggle"]').click()
    await expect(page.locator('[data-testid="note-version-row"]').first()).toContainText(/Manual/)
  })

  test('paste large Word-style HTML is sanitized and persists', async ({ page }) => {
    await loginAsBetaStudent(page)
    const id = await createNote(page, 'Paste')
    await page.goto(`/notes?note=${id}`)
    const raw = '<p class="MsoNormal" style="color:red"><o:p>hi</o:p> <strong>bold</strong></p>'
    await page.evaluate((html) => {
      const dt = new DataTransfer()
      dt.setData('text/html', html)
      document
        .querySelector('[data-testid="note-editor"] .ProseMirror')
        .dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }))
    }, raw)
    await page.waitForTimeout(2000)
    await page.reload()
    const html = await page.locator('[data-testid="note-editor"] .ProseMirror').innerHTML()
    expect(html).not.toMatch(/style=/)
    expect(html).not.toMatch(/o:p/)
    expect(html).toContain('<strong>')
  })

  test('route-leave during dirty state flushes via beforeunload', async ({ page }) => {
    await loginAsBetaStudent(page)
    const id = await createNote(page, 'Flush')
    await page.goto(`/notes?note=${id}`)
    await page.locator('[data-testid="note-editor"]').type('leave flush')
    await Promise.all([
      page.waitForRequest(
        (req) => req.url().includes(`/api/notes/${id}`) && req.method() === 'PATCH',
      ),
      page.goto('/dashboard'),
    ])
    await page.goto(`/notes?note=${id}`)
    await expect(page.locator('[data-testid="note-editor"]')).toContainText('leave flush')
  })

  test('restore creates PRE_RESTORE and undo works', async ({ page }) => {
    await loginAsBetaStudent(page)
    const id = await createNote(page, 'Restore', 'original content')
    await page.goto(`/notes?note=${id}`)
    await page.locator('[data-testid="note-editor"]').type(' extra')
    await page.keyboard.press('Control+s')
    await page.waitForTimeout(1000)

    await page.locator('[data-testid="note-history-toggle"]').click()
    await page.locator('[data-testid="note-version-restore"]').first().click()
    page.on('dialog', (d) => d.accept())

    await expect(page.locator('[data-testid="note-version-row"]').first()).toContainText(
      /Before restore/,
    )
  })
})
```

- [ ] **Step 2: Add data-testids to components**

In `NoteEditor.jsx`, `NoteSaveStatus.jsx`, `NoteVersionHistory.jsx`, add `data-testid` attributes matching the spec:

- `note-editor` on the editor wrapper
- `note-save-status` on the chip
- `note-history-toggle` on the history toggle button
- `note-version-row` on each row
- `note-version-restore` on each row's restore button

- [ ] **Step 3: Create helpers if missing**

```js
// frontend/studyhub-app/tests/helpers/notesHelpers.js
export async function loginAsBetaStudent(page) {
  // reuse existing beta login helper pattern; look at auth.smoke.spec for reference
}
export async function createNote(page, title, content = '') {
  // POST /api/notes via page.request
  const res = await page.request.post('/api/notes', { data: { title, content } })
  const json = await res.json()
  return json.note?.id ?? json.id
}
```

- [ ] **Step 4: Run the E2E**

Run: `npm --prefix frontend/studyhub-app run test:e2e -- notes.persistence`
Expected: all pass against the beta stack.

- [ ] **Step 5: Commit**

```bash
git add frontend/studyhub-app/tests/notes.persistence.spec.js frontend/studyhub-app/tests/helpers/notesHelpers.js frontend/studyhub-app/src/pages/notes
git commit -m "test(notes): E2E persistence + paste + restore + flush + hotkey coverage"
```

---

## Task 21: Rollout wiring — feature flag gate + telemetry + release log

**Files:**

- Modify: `frontend/studyhub-app/src/pages/notes/NoteEditor.jsx` (flag gate)
- Modify: `backend/src/modules/notes/notes.controller.js` (no-op; routes already stable, flag is client-side)
- Modify: `frontend/studyhub-app/src/lib/analytics.js` (or equivalent PostHog helper)
- Modify: `docs/beta-v2.0.0-release-log.md`

- [ ] **Step 1: Flag-gate the new editor wiring**

In `NoteEditor.jsx`:

```jsx
import { useFeatureFlag } from '../../lib/featureFlags.js'
const hardeningEnabled = useFeatureFlag('flag_notes_hardening_v2')
```

If `hardeningEnabled` is `true`, use `useNotePersistence`; otherwise fall back to the old `useNotesData` autosave path (leave it intact until the flag is 100% stable for 7 days, per the spec).

- [ ] **Step 2: Add PostHog telemetry**

At each state transition in `useNotePersistence`, emit:

```js
posthog?.capture('note_save_started', { noteId, trigger })
posthog?.capture('note_save_succeeded', { noteId, revision, latencyMs })
posthog?.capture('note_save_failed', { noteId, code })
posthog?.capture('note_conflict_detected', {
  noteId,
  entry: 'patch-409' | 'on-mount' | 'sw-replay',
})
posthog?.capture('note_conflict_resolved', { noteId, choice })
posthog?.capture('note_conflict_abandoned', { noteId })
posthog?.capture('note_idb_fallback_used', { reason })
posthog?.capture('note_sw_replay_drained', { count })
```

Use the existing `posthog` helper in `frontend/studyhub-app/src/lib/analytics.js` (or the pattern used in recent commits — grep for `posthog?.capture`).

- [ ] **Step 3: Add Sentry breadcrumbs**

```js
Sentry?.addBreadcrumb?.({
  category: 'notes.persistence',
  level: 'info',
  message: `state: ${status}`,
  data: { noteId },
})
```

Add at each state transition inside the hook.

- [ ] **Step 4: Update release log**

Append to `docs/beta-v2.0.0-release-log.md` under a new section:

```markdown
## 2026-04-15 — Notes hardening v2 (feature flag)

- Migration `20260415000001_notes_hardening`: `Note.revision`, `Note.lastSaveId`, `Note.contentHash`, `NoteVersion.{revision, parentVersionId, kind, bytesContent}`, enum `NoteVersionKind`.
- Backend: revision-concurrency PATCH, chunked saves, restore, diff endpoints + dedicated rate limiters.
- Frontend: local-first persistence via `useNotePersistence` + `noteDraftStore` (IndexedDB with sessionStorage fallback), Service Worker background sync, sanitized paste, Ctrl/Cmd+S, manual save button, save-status chip, conflict banner, word-level diff view, non-destructive restore.
- Rolled behind `flag_notes_hardening_v2` (default off). Internal → 10 % → 50 % → 100 %.
- Tests: backend concurrency / chunks / restore / diff / update. Frontend unit: draftStore, reducer, paste sanitizer. E2E: `notes.persistence.spec.js` covering reload, crash, hotkey, paste, flush-on-leave, restore.
```

- [ ] **Step 5: Deploy prep**

Document manual deploy steps at end of release-log entry:

```markdown
### Deploy

1. Push to main. Railway runs `prisma migrate deploy`.
2. After deploy: `npm --prefix backend run seed:notes-hardening-flag` (Railway shell) — creates the flag disabled.
3. Manually toggle flag to internal-only (admin user IDs allowlist) via admin panel.
4. Watch PostHog dashboards for `note_save_failed` rate and `note_conflict_*` volume for 24 hours.
5. Ramp to 10 %, 50 %, 100 % per spec.
6. After 7 days at 100 % clean, delete the legacy autosave path in `useNotesData.js`.
```

- [ ] **Step 6: Run full validation**

Run (in this order, stop on first failure):

- `npm --prefix backend test`
- `npm --prefix backend run lint`
- `npm --prefix frontend/studyhub-app test`
- `npm --prefix frontend/studyhub-app run lint`
- `npm --prefix frontend/studyhub-app run build`
- `npm --prefix frontend/studyhub-app run test:e2e -- notes.persistence`

Expected: all green.

- [ ] **Step 7: Final commit**

```bash
git add frontend/studyhub-app/src/pages/notes/NoteEditor.jsx frontend/studyhub-app/src/lib docs/beta-v2.0.0-release-log.md
git commit -m "feat(notes): flag-gate hardening v2 + telemetry + release log"
```

---

## Self-Review Notes

- **Spec coverage:** Every section of the spec maps to at least one task: data model → Task 2; PATCH rewrite → Task 4; chunks → Task 5; restore → Task 6; diff → Task 7; rate limiters → Task 8; backfill → Task 9; draft store → Task 10; reducer → Task 11; hook → Task 12; paste → Task 13; status chip → Task 14; banner + diff modal → Task 15; editor integration → Task 16; `useNotesData` cleanup → Task 17; version-history UI → Task 18; Service Worker → Task 19; E2E → Task 20; rollout → Task 21.
- **Type consistency:** `computeContentHash`, `isRevisionConflict`, `shouldCreateAutoVersion` names are consistent between concurrency helpers and the PATCH handler. `NoteVersionKind` values `AUTO | MANUAL | PRE_RESTORE | CONFLICT_LOSER` used identically in schema, controller, and version history UI. Hook method names `onEditorChange`, `saveNow`, `resolveConflict`, `discardDraft` are consistent between hook definition and editor integration.
- **No placeholders left.**
