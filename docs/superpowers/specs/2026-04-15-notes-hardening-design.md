# Notes Hardening — Design Spec

**Date:** 2026-04-15
**Owner:** Abdul
**Status:** Approved for planning
**Scope:** B (bug-fix + hardened persistence) — no CRDT/real-time sync
**Feature flag:** `flag_notes_hardening_v2`
**Migration:** `20260415000001_notes_hardening`

---

## 1. Problem Statement

Users report three classes of bugs in the Notes feature:

1. Clicking Save or letting autosave run shows "saved" but the database row is empty or lost.
2. Leaving the notes page and returning results in an empty editor.
3. Version history shows raw old content with no diff against the current note.

There is also no manual save button, no keyboard save shortcut, no beforeunload flush, and no offline tolerance.

### Verified root causes

From exploration on 2026-04-15:

- **Stale-closure autosave.** [`frontend/studyhub-app/src/pages/notes/useNotesData.js`](../../../frontend/studyhub-app/src/pages/notes/useNotesData.js) line 163-188: the debounced `autoSave` callback has an empty dependency array. Change handlers pass a mix of fresh (the field being edited) and stale (every other field) state to the PATCH body. Result: partial/incorrect writes land on the server while UI still says "saved".
- **No editor-state reconciliation on PATCH response.** Server returns the persisted row, but local `editorTitle`/`editorContent` are never reset, so UI and DB silently drift.
- **Mount-race overwrite.** On returning to the page, the initial `GET /api/notes` overwrites state even when a pending autosave timer from the prior mount has not fired.
- **Version snapshots gated on >50-char delta** (`backend/src/modules/notes/notes.controller.js` line 286). Small edits produce no version, creating gaps.
- **Version history renders raw old content**, not a diff. See [`NoteVersionHistory.jsx`](../../../frontend/studyhub-app/src/pages/notes/NoteVersionHistory.jsx).
- **No beforeunload / visibilitychange / route-change flush.**

## 2. Goals and Non-Goals

### Goals

- Autosave writes are correct under all editing orderings. Never "saved but empty."
- Local-first draft cache survives tab crash, browser close, and offline.
- Manual save button and `Ctrl/Cmd+S` hotkey.
- Saved state is visible at a glance (icon + chip + tooltip).
- Version history shows word-level inline diff or side-by-side, user choice.
- Restore is non-destructive — current content is snapshotted before replacement.
- Paste from Word/Docs/web pages produces clean, scanner-safe HTML.
- Conflicts between devices/tabs are detected and resolved without silent data loss.
- Safe on mobile (aligns with Capacitor wave — IndexedDB + Service Worker background sync).

### Non-goals (out of scope)

- Real-time multi-device sync via CRDT/Yjs (scope C, deferred).
- Collaborative cursors / presence.
- Server-side operational-transform merge.
- Attachments inside notes.

## 3. Architecture Overview

The editor becomes **local-first with the server as source of truth for shared state** (history, multi-device, search). Three cooperating layers:

1. **Editor layer** — TipTap. Renders document; emits content changes.
2. **Persistence state machine** — new `useNotePersistence` hook. Owns the only source of truth for the open note. States: `idle | dirty | saving | saved | error | offline | conflict`. All transitions via `useReducer` for traceability and testability.
3. **Transport layer** — new `noteDraftStore.js` (IndexedDB wrapper) and Service Worker (`sw-notes.js`). Wraps `fetch`, owns the offline queue and background sync.

### Data flow on every keystroke

```
keystroke
  → editor emits change
  → state machine marks dirty
  → IndexedDB write (synchronous-ish, ~1ms, fire-and-forget)
  → debounce 800ms OR safety flush at 5s of continuous edits
  → transport enqueues PATCH
  → 200 OK: state machine reconciles with server response, clears IDB draft, emits "saved"
  → network error: state goes to `offline`, SW background-sync replays when online
  → 409: state goes to `conflict`, resolver UI opens
```

### Invariants

- Editor local React state (`editorContent`/`editorTitle`) is **never** the source of truth. The state machine is. This eliminates the stale-closure bug by construction.
- On mount, the hook always checks IndexedDB before trusting server GET. Any mismatch between draft `baseRevision` and server `revision` routes through conflict resolution.
- `beforeunload`, `visibilitychange: hidden`, and route-change all trigger a synchronous `saveNow`.

## 4. Data Model Changes

Migration: `backend/prisma/migrations/20260415000001_notes_hardening/migration.sql`

```prisma
model Note {
  // existing fields
  revision      Int       @default(0)
  lastSaveId    String?   @db.Uuid
  contentHash   String?
}

model NoteVersion {
  // existing fields
  revision        Int
  parentVersionId String?  @db.Uuid
  kind            NoteVersionKind @default(AUTO)
  bytesContent    Int

  @@index([noteId, createdAt])
}

enum NoteVersionKind {
  AUTO
  MANUAL
  PRE_RESTORE
  CONFLICT_LOSER
}
```

**Rationale:**

- `revision` + `lastSaveId`: server-authoritative optimistic concurrency with idempotent retries.
- `contentHash`: detect no-op saves; no DB write on unchanged content.
- `NoteVersionKind`: enables meaningful filtering and the "nothing ever lost" guarantee via `PRE_RESTORE` / `CONFLICT_LOSER`.
- `bytesContent`: UI badges and chunked-save decisions.

**Version retention rules:**

- Every `MANUAL` save → snapshot.
- Every 5 minutes of sustained activity → one `AUTO` snapshot.
- Every restore → one `PRE_RESTORE` snapshot of the outgoing content.
- Every conflict resolution → one `CONFLICT_LOSER` snapshot.
- Keep last 50 versions per note. `AUTO` pruned first; `MANUAL` / `PRE_RESTORE` / `CONFLICT_LOSER` never pruned.

**Backfill:** `revision` defaults to 0 for existing rows. First post-deploy save goes through cleanly. `bytesContent` backfilled for existing versions via one-time script.

## 5. Backend API

All routes live in `backend/src/modules/notes/`.

### `PATCH /api/notes/:id` — rewritten

**Request:**

```json
{
  "title": "...",
  "content": "...",
  "baseRevision": 12,
  "saveId": "uuid-v4",
  "contentHash": "sha256:...",
  "trigger": "debounce" | "safety-flush" | "manual" | "beforeunload" | "visibility" | "route-change" | "sw-replay"
}
```

**Responses:**

- `200 OK` — write succeeded. Body: `{ note, revision, savedAt, versionCreated }`.
- `200 OK` (no-op) — `contentHash` matches current. No DB write, `revision` unchanged.
- `202 Accepted` — `saveId` matches a recent save. Returns prior result idempotently.
- `409 Conflict` — `baseRevision < current.revision`. Body: `{ code: "REVISION_CONFLICT", current, yours }`.
- `413 Payload Too Large` — >200,000 chars.

### `POST /api/notes/:id/chunks` — new

For payloads >64KB. Client splits into ordered chunks:

```json
{
  "saveId": "uuid",
  "chunkIndex": 0,
  "chunkCount": 3,
  "chunk": "...",
  "baseRevision": 12,
  "contentHash": "...",
  "title": "..."
}
```

Server buffers in Redis with TTL (fallback to in-memory if Redis unavailable). On final chunk, assembles and performs PATCH logic. Out-of-order → `NOTE_CHUNK_OUT_OF_ORDER`.

### `GET /api/notes/:id/versions` — enriched

Returns `{ id, title, message, kind, revision, bytesContent, createdAt, userId }`. No content in list payload.

### `GET /api/notes/:id/versions/:versionId` — unchanged contract

Exposes new fields.

### `POST /api/notes/:id/versions/:versionId/restore` — new

Atomic transaction:

1. Create `PRE_RESTORE` snapshot of current content.
2. Overwrite note with version's title/content.
3. Bump `revision`.
4. Return new note state.

### `GET /api/notes/:id/versions/:versionId/diff?against=current|<otherVersionId>` — new

Server-computed diff via `diff` npm package (`diffWordsWithSpace`). Response:

```json
{
  "chunks": [{ "type": "equal"|"add"|"remove", "text": "..." }],
  "summary": { "added": 42, "removed": 13 }
}
```

60s HTTP cache (content of a specific version pair is immutable).

### Rate limits (`backend/src/lib/rateLimiters.js`)

- `notesPatchLimiter`: 120/min per user (raised from 30).
- `notesChunkLimiter`: 30/min per user.
- `notesRestoreLimiter`: 10/min per user.
- `notesDiffLimiter`: 60/min per user.

### Error codes (`backend/src/middleware/errorEnvelope.js`)

- `NOTE_REVISION_CONFLICT`
- `NOTE_PAYLOAD_TOO_LARGE`
- `NOTE_CHUNK_OUT_OF_ORDER`
- `NOTE_VERSION_NOT_FOUND`

## 6. Frontend Persistence Layer

Three new modules; `useNotesData.js` is split — list/CRUD stays, editor-tab state moves out.

### `frontend/studyhub-app/src/pages/notes/noteDraftStore.js`

Thin wrapper over `idb` (~2KB). One object store `noteDrafts` keyed by `noteId`.

```js
draftStore.put(noteId, { title, content, baseRevision, dirtyAt, saveId })
draftStore.get(noteId) → draft | null
draftStore.delete(noteId)
draftStore.listPending() → draft[]
```

Fallback to `sessionStorage` when IndexedDB unavailable.

### `frontend/studyhub-app/src/pages/notes/useNotePersistence.js`

One hook per open note. `useReducer` state:

```js
{
  status: 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'offline' | 'conflict',
  lastSavedAt: Date | null,
  lastServerRevision: number,
  lastSaveError: { code, message } | null,
  pendingConflict: { current, yours } | null,
  bytesContent: number,
}
```

Exposed API:

```js
{
  ;(state, onEditorChange(title, content), saveNow(reason), resolveConflict(choice), discardDraft())
}
```

**Stale-closure fix:** hook uses `useRef` for the latest editor values. Debounce callback reads from the ref.

**Mount sequence:**

1. Kick off `GET /api/notes/:id`.
2. `draftStore.get(id)` in parallel.
3. Wait for both.
4. No draft → render server content.
5. Draft exists, `draft.baseRevision === server.revision` → render draft, status `dirty`, schedule flush.
6. Draft exists, `draft.baseRevision < server.revision` → conflict banner.

### Service Worker: `frontend/studyhub-app/public/sw-notes.js`

Scope limited to `/api/notes/*`.

- Queue offline PATCH requests; register `sync` tag `note-save-retry`.
- On `sync` event, drain outbox in insertion order, replay with `trigger: "sw-replay"` and original `saveId` (idempotent).
- If SW unsupported, the hook's `online` event does the same replay from IDB in the main thread. SW is an optimization, not a dependency.

### Lifecycle wiring

- `window.beforeunload` → `saveNow` via `navigator.sendBeacon` (synchronous).
- `visibilitychange: hidden` → `saveNow('visibility')` (mobile tab-switch, Capacitor background).
- React Router v7 `useBlocker` → `saveNow('route-change')`.
- Multi-tab: `BroadcastChannel('studyhub-notes')` broadcasts successful saves so sibling tabs bump `baseRevision` without content replacement. 409 path is the fallback if a message is missed.

## 7. Editor UX

### Save-status chip — new component `NoteSaveStatus.jsx`

Lives in editor header. All colors use `var(--sh-*)` tokens.

| State      | Dot                    | Label                                    | Tooltip                 |
| ---------- | ---------------------- | ---------------------------------------- | ----------------------- |
| `idle`     | `--sh-slate-300`       | "Up to date"                             | Last saved relative     |
| `dirty`    | `--sh-warning`         | "Unsaved changes"                        | "Saving in Ns"          |
| `saving`   | `--sh-warning` pulsing | "Saving..."                              | "Sending to server"     |
| `saved`    | `--sh-success`         | "Saved" (fades to "Up to date" after 3s) | ISO timestamp           |
| `error`    | `--sh-danger`          | "Save failed — retry"                    | Error code + message    |
| `offline`  | `--sh-slate-400`       | "Offline — saved locally"                | "Will sync when online" |
| `conflict` | `--sh-danger`          | "Newer version on server"                | "Tap to resolve"        |

`aria-live="polite"` on the chip.

### Manual Save button + hotkey

Primary button next to chip. Enabled in `dirty` / `error` / `offline`. Click → `saveNow('manual')` → forces immediate PATCH, skips debounce, always produces a `MANUAL` version.

`Ctrl/Cmd+S` global listener on the editor page: `preventDefault()` + `saveNow('manual')`. Brief "Saved" toast on success.

### Paste sanitization (P2)

TipTap `editorProps.transformPastedHTML` runs pasted HTML through `sanitize-html` with a whitelist:

- **Tags allowed:** `p, br, h1, h2, h3, ul, ol, li, strong, em, s, u, code, pre, blockquote, a, img, table, thead, tbody, tr, th, td, hr`.
- **Attrs allowed:** `href, target, rel` on `<a>`; `src, alt` on `<img>`.
- **Dropped:** `style`, `class`, all `data-*`, Office namespaces (`o:*`, `w:*`, `v:*`), `<meta>`, `<script>`, `<style>`, `<link>`.

TipTap converts styled spans to semantic marks (e.g., `<span style="font-weight:bold">` → `<strong>`).

Fallback: if sanitized HTML ends up empty, fall back to `clipboardData.getData('text/plain')` wrapped in `<p>`.

### Size limits (L2)

- Soft warn at 100,000 chars — non-blocking banner "Large note — saves may take a moment."
- Hard cap at 200,000 chars — paste truncated with toast.
- Chunked save when `bytesContent > 64KB`. Chip reads "Saving (2 of 4)..." during chunked PATCH.

### Conflict banner

Sticky banner above the editor when state is `conflict`:
_"Someone (or another device) updated this note. [Keep mine] [Use theirs] [Compare side-by-side]"_
Compare opens the diff view (Section 8) with conflict-specific CTAs.

### Ctrl+Z

Undo remains TipTap-local. Autosaves don't touch editor state; restore and conflict-resolve snapshot before replacing wholesale.

## 8. Version History and Diff View

Updates to [`NoteVersionHistory.jsx`](../../../frontend/studyhub-app/src/pages/notes/NoteVersionHistory.jsx); new sibling `NoteVersionDiff.jsx`.

### Version list

Each row renders:

- Colored pill by `kind` — `MANUAL` green, `AUTO` slate, `PRE_RESTORE` amber, `CONFLICT_LOSER` red.
- Relative timestamp (hover = absolute).
- `bytesContent` badge ("12.4 KB").
- Optional message (manual saves only).
- Actions: **View diff** and **Restore**.
- "Current" pinned at top as a virtual row.

Filter chips: `All · Manual · Auto · System`. Default "All"; remembers last pick in `localStorage`.

### Diff view modal

Header: `<version-ts> → Current` or `<v1-ts> → <v2-ts>` with pair-picker.

Toggle in top-right (R3): **Inline** (default) or **Side-by-side**.

**Inline mode:**

- Single scrollable pane, word-level granularity.
- Removed: struck-through, `var(--sh-danger-bg)` / `var(--sh-danger-text)`.
- Added: highlighted, `var(--sh-success-bg)` / `var(--sh-success-text)`.
- Header: "+42 words, −13 words".

**Side-by-side mode:**

- Two panes with synchronized scroll.
- Left: older version. Right: newer (or current).
- Gutter color highlights; hover-link changed blocks across panes.

Both modes fetch from `GET /api/notes/:id/versions/:versionId/diff?against=current`.

### Restore behavior (S2)

"Restore" → confirm dialog: _"Restore this version? Your current note will be saved as a new version first, so nothing is lost."_ → `POST /api/notes/:id/versions/:versionId/restore`.

On success:

- Editor replaced with restored content.
- `PRE_RESTORE` row appears at top of version history.
- Toast: _"Restored. Previous version saved as 'Before restore <time>'."_ with "Undo" action that restores the `PRE_RESTORE` snapshot.
- State machine transitions to `saved` with new `revision`.

### Conflict variant of the diff modal

Footer swaps to:

- **Keep mine** — PATCH with `baseRevision = current.revision`, body = `yours`. Server snapshots current as `CONFLICT_LOSER` first.
- **Use theirs** — discard local draft (saved as `CONFLICT_LOSER`), load server version.
- **Merge manually** — editor content replaced with `<h2>Mine</h2>...<h2>Server</h2>...`. Both originals saved as `CONFLICT_LOSER`. State → `dirty`.

Invariant: every conflict resolution produces at least one `CONFLICT_LOSER` version. Nothing disappears silently.

### Dependencies

- Backend: add `diff` to `backend/package.json` if not present.
- Frontend: no diff library needed; renders server's structured chunks.

## 9. Conflict Resolution

Three entry points, one resolver.

1. **PATCH 409** — server already at higher revision. State `saving → conflict`. Editor content untouched.
2. **On-mount mismatch** — IDB draft `baseRevision < server.revision`. State `conflict` before first render. Editor shows draft.
3. **SW replay conflict** — SW posts `MessageEvent` to active tab. If no tab open, draft gets `conflict=true` flag; surfaced on next open.

Resolver UI is Section 8's conflict variant.

### While `conflict` is active

- Autosave suspended. Debounce doesn't fire. IDB still receives keystrokes (typing not lost).
- Save button replaced by red "Resolve conflict" button that reopens resolver.
- `Ctrl/Cmd+S` opens resolver.
- Route-leave warns: _"You have an unresolved conflict. Leave anyway? Your draft stays saved locally."_

### Telemetry (PostHog)

- `note_conflict_detected` (entry point)
- `note_conflict_resolved` (choice)
- `note_conflict_abandoned`

## 10. Testing

### Backend (Vitest + Supertest)

- PATCH happy path with revision bump.
- PATCH 409 on stale baseRevision; body shape.
- PATCH idempotent on repeated saveId.
- PATCH no-op on matching contentHash (no write, no version).
- Chunked save: ordered OK; out-of-order errors; TTL cleanup.
- Restore creates `PRE_RESTORE`, bumps revision.
- Diff returns chunks for content / metadata-only / empty-to-full / full-to-empty.
- Version pruning keeps `MANUAL` / `PRE_RESTORE` / `CONFLICT_LOSER`; prunes `AUTO` past 50.
- Rate limiters enforce new caps.

### Frontend unit (Vitest)

- `useNotePersistence` reducer: every transition.
- `noteDraftStore`: put/get/delete; sessionStorage fallback.
- Paste sanitization fixtures: Word HTML, Google Docs HTML, plain text, mixed.
- Chunker: >64KB splits correctly; single chunk when smaller.

### Frontend E2E (Playwright)

- Type → wait 2s → reload → content persists (primary regression test).
- Type → close tab → reopen → IDB draft recovered.
- Type → offline → type more → online → all saved (SW replay).
- Two-tab conflict: resolver appears, each branch preserves work.
- Restore creates `PRE_RESTORE` and Undo toast works.
- Ctrl+S triggers manual save + version snapshot.
- Paste large Word doc → sanitized, saves successfully.
- Route-leave during dirty state flushes via beforeunload.

## 11. Rollout

Behind `flag_notes_hardening_v2`:

1. **Internal** (admin accounts) — 1 day soak. Watch `note_conflict_*` + `note_save_error_*` telemetry.
2. **10%** — 2 days. Track save-success-rate, p95 save latency, IDB failures.
3. **50%** — 2 days.
4. **100%**.

Old broken autosave stays live when flag is off. Removed once 100% stable for 7 days.

### Observability

- Sentry breadcrumbs on every state transition (tagged noteId + state).
- PostHog events: `note_save_started`, `note_save_succeeded`, `note_save_failed`, all `note_conflict_*`, `note_idb_fallback_used`, `note_sw_replay_drained`.
- Dashboard tile: save success rate, p50/p95 latency, conflict rate.

### Rollback

Flag off → old path active. IDB drafts are orphaned but harmless. Schema additions are additive; no drops needed.

## 12. Out of Scope (explicitly deferred)

- Real-time multi-device sync via CRDT/Yjs.
- Collaborative cursors / presence.
- Server-side OT merge (we pick `CONFLICT_LOSER` instead).
- Image/file attachments inside notes.

## 13. Open Questions

None remaining at spec time. Any emerging during implementation should surface as plan-time questions via the writing-plans handoff.
