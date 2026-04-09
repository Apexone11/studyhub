# Phase 4 — Study Groups Redesign + BookHub Background Art

Hand-off plan for VS Code Claude. Pick up from `local-main` after Phase 2 frontend (Steps 4–10) and Phase 3 land. Two independent tracks — they can ship separately.

---

## Shipped Status

| Item | Commit | Status |
|------|--------|--------|
| Track B: BookHub background art (Winslow Homer painting + attribution) | `fade8a1` | Shipped |
| Track A Chunk 1: Schema + migration (GroupMediaUsage, backgroundUrl, media fields) | `5e42044` | Shipped |
| Track A Chunk 2: Backend media service + upload endpoint + quota enforcement | `5afab54` | Shipped |
| Track A Chunk 3: Backend tests (16/16 passing) | `b28c26f` | Shipped |
| Track A Chunks 4 through 7: Frontend composer, modals, background picker | | In progress (VS Code Claude) |

---

## Track A — Study Groups Discord-inspired redesign + media paywall

### Scope
- Rebuild `Add Resource` and `New Discussion Post` modals with Discord-style composer supporting image/video/file uploads with drag-and-drop, paste, and inline previews.
- Weekly media-upload quota gated by subscription plan (free: 5 media/week, pro: 100 media/week, admin: unlimited).
- Group background customization (owner picks from a curated gallery or uploads a custom banner; displayed behind the group header).

### Backend changes

1. **Migration `YYYYMMDDHHMMSS_add_group_media_and_backgrounds`**
   - `GroupMediaUsage` table: `id`, `userId`, `groupId`, `weekStart` (date, Monday 00:00 UTC), `count` (int), unique `(userId, weekStart)`.
   - `StudyGroup.backgroundUrl` nullable text, `StudyGroup.backgroundCredit` nullable text.
   - `GroupResource.mediaType` enum (`image`, `video`, `file`, `link`), `mediaUrl`, `mediaBytes`, `mediaMime`.
   - `GroupDiscussionPost.attachments` jsonb (array of `{url, mime, bytes, kind}`).
   - Indexes on `GroupMediaUsage(userId, weekStart)` and `GroupResource(groupId, createdAt)`.

2. **`backend/src/modules/studyGroups/studyGroups.media.service.js`** (new)
   - `getWeeklyQuota(plan)` reading from `payments.constants.js` — add `GROUP_MEDIA_WEEKLY_QUOTA = { free: 5, pro_monthly: 100, pro_yearly: 100, admin: Infinity }`.
   - `assertQuotaAvailable(userId, plan)`: compute current week start, upsert `GroupMediaUsage`, compare `count` to quota, throw `sendError(res, 429, 'Weekly media quota reached', ERROR_CODES.RATE_LIMITED, { quota, used, resetsAt })`.
   - `incrementUsage(userId, groupId)` after a successful upload.
   - Graceful-degradation try/catch around any usage read.

3. **`studyGroups.routes.js`**
   - New `POST /api/study-groups/:id/resources/upload` — multer single-file, uses `r2Storage` to push to R2, returns `{ url, mime, bytes }`. Wrap in `groupMediaUploadLimiter` (10/min) — add to `rateLimiters.js`.
   - `POST /api/study-groups/:id/resources` and `POST /api/study-groups/:id/discussions` accept `attachments` array; enforce quota *before* create using `assertQuotaAvailable`, increment *after*.
   - `PATCH /api/study-groups/:id` accepts `backgroundUrl`, `backgroundCredit` (owner/moderator only).
   - `GET /api/study-groups/:id/media-quota` returns `{ plan, quota, used, resetsAt }`.

4. **Tests** (`backend/tests/studyGroups.media.test.js`)
   - quota enforcement per plan, week rollover boundary, upload happy path, 429 when exceeded, owner-only background update, non-owner 403.

### Frontend changes

1. **`pages/studyGroups/composer/MediaComposer.jsx`** (new, shared between Resource and Discussion modals)
   - Drag-drop zone, paste listener, file picker button, inline thumbnails, remove button, progress bar, quota banner `{used}/{quota} media this week` with `resetsAt` relative time.
   - Uses `useMediaQuota(groupId)` hook wrapping `GET /media-quota` via `useFetch` with `swr: 30_000`.
   - If user over quota, composer disables upload buttons and shows upgrade CTA linking `/pricing`.

2. **`pages/studyGroups/modals/AddResourceModal.jsx`** — rewritten around `MediaComposer`. Use `createPortal(..., document.body)` because StudyGroupsPage uses anime.js. All colors via `var(--sh-*)`.

3. **`pages/studyGroups/modals/NewDiscussionPostModal.jsx`** — same composer embedded under title + body fields.

4. **`pages/studyGroups/components/GroupHeader.jsx`**
   - If `group.backgroundUrl`, render as `background-image` with linear-gradient overlay `rgba(0,0,0,0.55) → rgba(0,0,0,0.2)` so existing title/description remain legible. Credit line bottom-right, 11px, `color: var(--sh-muted)`.
   - Owner gear opens `GroupBackgroundPicker.jsx` modal: tab 1 = curated gallery (8 subtle textures shipped as static assets), tab 2 = custom upload (pro only, else upgrade CTA).

5. **Lint/build**: `npm --prefix frontend/studyhub-app run lint` and `npm --prefix backend test`.

---

## Track B — BookHub background art (Winslow Homer)

Add Winslow Homer's *Girl Reading Under an Oak Tree* (1879, public domain — artist d. 1910) as the BookHub hero background with visible artist attribution. Thematic fit: a woman reading outdoors pairs naturally with a books discovery page.

### Files touched
- `frontend/studyhub-app/public/art/winslow-homer-girl-reading-under-an-oak-tree.jpg` (new asset)
- `frontend/studyhub-app/src/pages/library/LibraryPage.css` (edit `.library-hero` and add `.library-hero__attribution`)
- `frontend/studyhub-app/src/pages/library/LibraryPage.jsx` (add attribution markup inside `.library-hero`)

### Step 1 — Asset

Download the high-resolution scan from Wikimedia Commons:
`https://commons.wikimedia.org/wiki/File:Winslow_Homer_-_Girl_Reading_Under_an_Oak_Tree.jpg`

Save to `frontend/studyhub-app/public/art/winslow-homer-girl-reading-under-an-oak-tree.jpg`. Resize to max 2000px on the long edge and compress to ~250KB (mozjpeg q78) to keep LCP fast. Keep a `.webp` sibling if trivial.

### Step 2 — CSS (`LibraryPage.css`, `.library-hero` block)

Replace the current gradient-only background with a layered background that keeps the brand gradient as a readability overlay on top of the painting:

```css
.library-hero {
  position: relative;
  background:
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--sh-brand) 72%, transparent),
      color-mix(in srgb, var(--sh-brand-accent) 62%, transparent)
    ),
    url('/art/winslow-homer-girl-reading-under-an-oak-tree.jpg') center 30% / cover no-repeat;
  background-color: var(--sh-brand);
}

.library-hero__content {
  position: relative;
  z-index: 1;
}

.library-hero__attribution {
  position: absolute;
  right: 16px;
  bottom: 10px;
  z-index: 2;
  font-size: 11px;
  line-height: 1.35;
  color: rgba(255, 255, 255, 0.85);
  text-align: right;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.55);
  pointer-events: none;
  max-width: 60%;
}

.library-hero__attribution strong {
  display: block;
  font-weight: 700;
  color: #fff;
}

@media (max-width: 640px) {
  .library-hero__attribution {
    position: static;
    margin-top: 16px;
    text-align: center;
    max-width: none;
  }
}
```

Notes:
- The `color-mix` gradient darkens/tints the painting enough that the existing white title, subtitle, search input, and badge remain WCAG-AA legible without any other edit.
- Background position `center 30%` keeps the reader figure visible across common viewport widths; verify on 1280, 1440, 1920.
- The raw `rgba(255,255,255,.85)` and `#fff` here are intentional exceptions (white text on a darkened image), matching the existing `rgba(255,255,255,0.15)` usage already in the badge — document as "image overlay text" exception alongside the dark-mode-always editor panels exception in CLAUDE.md if the lint/token guard complains.

### Step 3 — JSX (`LibraryPage.jsx`, inside `<section className="library-hero">`)

Immediately before the closing `</section>`, after the existing `.library-hero__content` block, add:

```jsx
<div className="library-hero__attribution" aria-label="Background artwork attribution">
  <strong>Girl Reading Under an Oak Tree</strong>
  Winslow Homer (1836–1910) · Public domain
</div>
```

Keep it inside the hero so it scrolls with the banner, not the page.

### Step 4 — Accessibility

- The painting is decorative; do not add an `<img>` with alt — the CSS background is correct.
- The attribution is a visible, screen-reader-readable `<div>` with `aria-label` for context.
- Run Lighthouse a11y on `/library` after the change; confirm hero title contrast ≥ 4.5:1 against the darkened image (should pass because the 72/62% gradient effectively mattes to the brand colors).

### Step 5 — Validation

- `npm --prefix frontend/studyhub-app run lint`
- `npm --prefix frontend/studyhub-app run build` — confirm the new asset is copied to `dist/art/`.
- Manual: load `/library` at 375, 768, 1280, 1920; confirm title legibility, attribution placement, no horizontal scroll, no layout shift.
- Network: confirm the JPEG is ≤ 300KB and served with a long cache header by Vite's default `public/` handling.

### Step 6 — Docs

Append a line to `docs/beta-v2.0.0-release-log.md` under Phase 4:
`Library: added public-domain Winslow Homer background "Girl Reading Under an Oak Tree" with on-image artist attribution.`

---

## Ordering

Track A and Track B are independent. Recommended order:
1. Track B (small, visible, zero backend risk) — ship first for a quick user-facing win.
2. Track A migration + backend.
3. Track A frontend composer + background picker.
4. E2E: group media upload happy path + quota-exceeded 429.

Commit each step on a fresh branch off `local-main`; do not mix with Phase 2 Steps 4–10 or Phase 3 branches.
