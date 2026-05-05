<!-- markdownlint-disable MD024 MD032 -->

# StudyHub Release Log

This is the public-facing changelog for the StudyHub platform. Every PR
that touches `backend/`, `frontend/`, `scripts/`, `.github/workflows/`,
`docker-compose.yml`, or `package.json` MUST add a one-line entry under
the most recent cycle heading. CI enforces this via the
`Enforce release log update` step in `.github/workflows/ci.yml`.

Detailed internal cycle notes (decisions, security checklists, agent
hand-offs, day-by-day breakdowns) live in `docs/internal/` and are
intentionally not tracked in git. Promote individual entries from the
internal log into this file when they describe user-visible behavior.

## How to add an entry

1. Find the most recent cycle heading below.
2. Add a single bullet under it summarizing the change in <120 chars.
3. Include the PR number if you have it (`(#267)`).
4. If your change is the first entry for a new beta cycle, add a new
   `## v<MAJOR>.<MINOR>.<PATCH>-beta — <date>` heading above the previous
   one and add your bullet there.
5. Keep entries factual and user-visible. Skip purely internal
   refactors and metadata churn — those belong in the private log.

---

## v2.2.0 — public launch ship (2026-04-30)

### Bot-review verification + Scholar sidebar parity (2026-05-04 night)

- **Scholar runtime surfaces have been disabled in production.** Scholar backend routes and UI entry points have been removed so the feature no longer exposes `/api/scholar` or `/scholar` navigation paths in the live app.
- **Scholar pages now render the AppSidebar.** New `ScholarShell` wrapper applies the standard navbar + 2-col grid + sticky AppSidebar pattern across `/scholar`, `/scholar/search`, `/scholar/saved`, `/scholar/topic/:slug`, `/scholar/paper/:id` so navigating into Scholar no longer drops the left-rail menu that every other authenticated page shows.
- **ScholarPaperPage cache reset on paper change.** `pdfState`, `refsState`, and `citedByState` now reset when `validId` changes — previously the `ready/loading` and `items !== null` guards prevented refetching when the user navigated from paper A to paper B in the same component instance, leaving paper A's PDF link, references, and cited-by list visible under paper B.
- **Feed ranked-mode pagination cap raised.** Candidate window now scales with offset (`Math.min(500, max(200, offset+limit+32))`) instead of a hardcoded 200, so deep infinite-scroll past page 10 (offset ≥ 200) actually returns rows. Recent-mode behavior unchanged.
- **Scholar Filters drawer fully wired end-to-end.** `ScholarSearchPage` now forwards all 11 URL params (`yearFrom`, `yearTo`, `openAccess`, `hasPdf`, `sources`, `domains`, `sort`, `minCitations`, `author`, `venue`) to `GET /api/scholar/search` instead of only `q/from/to` plus client-side `openAccess` filtering. Removed the "forward compatibility" note in the drawer doc-comment now that the backend is the actual filter authority.
- **Unpaywall removed from selectable Scholar sources.** The Unpaywall adapter is enrichment-only on the backend (`search()` is a deliberate no-op), so picking it alone in the Filters drawer used to silently produce zero results. Drawer now shows the four adapters that actually emit search results (Semantic Scholar, OpenAlex, CrossRef, arXiv); enrichment continues to run server-side as part of every fan-out.
- **AI delete-confirm modal lands focus on Cancel, not Delete.** `DeleteConfirmModal` now actually focuses the Cancel button on mount (it claimed to but didn't) so an accidental Enter on a freshly opened "Delete this conversation?" dialog can't wipe data.
- **Comment hygiene in `scholar.service.js`.** "All five known search-result-emitting adapters" updated to match the actual four-entry map; the inconsistency had been flagged by automated review.

### Multi-wave UX + bug sweep — Scholar/AI/Feed/Settings/Library/Groups/Notes (2026-05-04 evening)

- **Scholar PDF viewer fixed.** `ScholarPaperPage` now fetches `/api/scholar/paper/:id/pdf` for the iframe `src` (signed R2 URL, 600s TTL) instead of using the raw `pdfExternalUrl` that the browser was blocking with `(blocked:origin)`. Sandbox stays `allow-scripts allow-popups allow-forms` (never `allow-same-origin` per CLAUDE.md A14). Skeleton during signed-URL fetch; clean "Open original →" empty-state on 404. Backend signed-URL TTL dropped from 3600s to 600s for the inline-view security default.
- **Scholar References + Cited-by tabs wired.** Replaced the literal placeholder text with real fetches against `/api/scholar/paper/:id/references` and `/citations`, idle/loading/error/ready states, cache-on-first-activation, and links to canonical paper pages when a reference has a paper id.
- **Scholar landing stats no longer flicker.** `/api/scholar/stats` response cached in localStorage (`studyhub.scholar.stats.v1`, 1h TTL, Safari-private-mode safe) and hydrated synchronously on mount. Removed misleading hardcoded `212M / 48M / 3.4M` fallbacks; first-visit users see token-styled skeleton numbers instead. Backend `getStats()` rewritten with `Promise.allSettled` + `_lastKnownStats` fallback + `X-Scholar-Stats-Source: last_known` header so a transient DB blip serves the last good snapshot.
- **Scholar Generate Sheet button hover fixed.** Removed `filter: brightness(1.05)` (was washing out the white text on the gradient); replaced with `box-shadow + translateY(-1px)` and an explicit `color: white` lock on `:hover`.
- **Scholar Filters drawer shipped.** Portal-mounted slide-in drawer with 9 filter axes — search query, year range, open access, has-PDF, sources (multi-select chips for the 5 adapters), domains (multi-select chips drawn from POPULAR_TOPICS), sort (relevance / year-desc / citations-desc / recent), min citations, author, venue. Apply navigates to `/scholar/search?...` with all populated params; ESC + backdrop close; focus trap; first input auto-focused; `prefers-reduced-motion` gated.
- **Scholar search backend now consumes 7 new filter params.** `hasPdf`, `sources`, `domains`, `sort`, `minCitations`, `author`, `venue` all validated per A12/A13 with explicit allowlists in `scholar.constants.js` (`SCHOLAR_SOURCE_SLUG_SET`, `SCHOLAR_SORT_SLUG_SET`, `SCHOLAR_DOMAIN_SLUG_SET`, year range `[1700, currentYear+1]`, max citations 1M). Sources restricts the adapter fan-out before requests fire; the rest are post-fetch filters with stable Node 20+ sorts. 13 new tests, plus a fix to a pre-existing test-setup gap (`featureFlag.findUnique` mock missing) that had been blocking the entire scholar test suite with 503 cascades — all 99 scholar tests now pass.
- **Scholar Browse-by-topic expanded 8 → 24.** Medicine, Engineering, Physics, Public Health, Chemistry, Materials Science, Cell Biology, Psychology, Economics, Mathematics, Astrophysics, Sociology, Statistics, Earth Science, Education, Linguistics added; ordered most-populous first.
- **Scholar adapters hardened.** Every `search()` and `fetch()` in `scholar.sources/*` wrapped in try/catch returning the documented shape on any throw — no path can yield an unhandled rejection. New `_adapterLogger.js` rate-limits `info` (429/404/timeout) to once-per-60s-per-source; real anomalies (5xx, network errors, oversized response) still warn immediately. Production logs no longer scream on normal upstream rate limits.
- **SIGTERM in Railway logs verified as normal rolling-deploy lifecycle**, not a real crash. `gracefulShutdown` already handles SIGTERM correctly with 15s drain + Prisma disconnect + exit 0; `unhandledRejection` and `uncaughtException` handlers already log to Sentry without `process.exit`. No code change required for SIGTERM.
- **Hub AI per-conversation delete.** Old conversations now show rename + delete affordances on hover (not just the active row). Trash click opens a `createPortal`-rendered confirm modal (Esc / backdrop / Cancel safe defaults). Optimistic UI compliant with A4: row stays mounted until server confirms 200; toast on failure; the delete handler also strips `?conversation=N` from the URL when the deleted conversation was active so the searchParams effect doesn't re-select it.
- **Hub AI empty-state layout fixed.** The Scholar `paperContext` banner was a flex sibling that inflated into a giant `--sh-brand-soft` strip. Extracted into a slim 44px-min top row inside `ChatArea`; empty-state hero now centers on `var(--sh-surface)` and the suggestion buttons no longer share the screen with an oversized blue panel.
- **Feed video flash eliminated.** `FeedCard` video container is now aspect-ratio-locked (`video.width / video.height` with 16/9 fallback), `IntersectionObserver` lazy-mounts the `<video>` element only within 200px of the viewport, `preload="none"`, video keyed on `video.id` so swaps don't reset state via setState-in-effect. `useFeedData` now fingerprints feed items and reuses object refs across the 30s poll, so `React.memo` short-circuits and FeedCards no longer re-render every poll.
- **Feed ranking algorithm shipped.** Hacker-News-style time decay `(engagement + 1) / (ageHours + 2)^1.5` over a 200-item candidate window. Engagement = `likes + comments*2 + forks*3 + downloads*0.1 - dislikes*0.5`. Multipliers: follow=1.5x, same-school=1.2x (when not followed), course-enrollment=1.3x. Opt-in via `?sort=ranked|recent` (default `ranked`); validated against allowlist; `pinned` announcements still pin to top. 8 new unit tests in `backend/test/feed.ranking.test.js`.
- **Settings tab URL persistence.** `?tab=` now syncs on every switch, not just initial load. Reload restores the tab.
- **Settings → Notifications redesigned.** 12 list rows collapsed to a 2D grid (5 topics × in-app/email cells) with proper `<table>` + `scope="row"`/`scope="col"` semantics, `aria-live="polite"` save status, skeleton load. PrivacyTab + ReferralsTab also got skeleton loaders. `settingsState.save()` now hydrates from the server response (A4 compliance — was leaving local state stale).
- **AccessibilityTab toggle animation now respects reduced motion** — was unconditional, now gated on `prefers-reduced-motion` AND the in-app `data-reducedMotion="on"` flag the same tab sets (so flipping it on doesn't itself animate). WCAG 2.1 SC 2.3.3.
- **NotificationsPage empty state + ARIA fixes.** Added "Browse the feed" CTA on the empty state (skipped on the `unread` filter). Fixed an invalid `role="listitem button"` composite — replaced with `role="button"` rows + dropped the parent `role="list"`. Bell icon now `aria-hidden`.
- **Profile FollowRequestsList disclosure** now exposes `aria-expanded` + `aria-controls` + descriptive label; chevron rotation gated on reduced motion.
- **Library keyboard navigation.** Arrow keys traverse book cards (row/column math derived from `getBoundingClientRect()` so it adapts to any responsive break-point). `:focus-visible` outline + `prefers-reduced-motion` gate on hover transform.
- **Messages typing-indicator fade**, **edit-history hover timestamp**, **link-preview protocol hardening** (rejects `javascript:` / `data:` even if a future regex change admits them).
- **Study Groups scheduled-session reminder banner** for sessions starting within the next hour, re-evaluated every 60s. **Resources tab gets a search input when > 20 entries.** **Discussion replies paginated** (first 5 visible, "Show N more replies" toggle).
- **Study Groups discussion post a11y** — clickable card now has `role="button"`, `tabIndex={0}`, Enter/Space handler, `aria-expanded`. Reply form's Enter still works (only fires on `e.target === e.currentTarget`).
- **Notes viewer + editor** now show "X min read" estimate (220 wpm baseline). Skeleton loader replaces "Loading..." text. Breadcrumb now `<nav aria-label="Breadcrumb">` with `aria-current="page"`.
- **Announcements** — image-remove and video-remove icon buttons now have `aria-label`s and `alt` text on pending image previews. Title and body inputs gained accessible names.
- **My Courses recommendations chip strip.** Surfaces `GET /api/courses/recommendations`, school-scoped, deduped, capped at 5 chips. School/course toggle chips now expose `aria-pressed`. Search inputs upgraded `type="text"` → `type="search"`.
- **Playground a11y.** "Notify Me" CTA gets descriptive `aria-label` + `aria-labelledby` on the lead paragraph; decorative editor mockup wrapped `aria-hidden`.
- **AppSidebar audit.** Confirmed mount on every authenticated route with the exception of 4 deliberately full-bleed pages (`/notes/:id` reading column, `/library` + `/library/:volumeId` (own hero layouts), `/my-courses` (onboarding hero)). Hide preference (`localStorage` key `studyhub.sidebar.hidden`) verified working. `aria-current="page"` and `loading="lazy"` on user avatar already present.
- **CSP `frame-src` for Scholar PDF iframe.** Added `frame-src 'self'${r2OriginList}` to `appSurfaceCsp` in `backend/src/index.js`, derived from the existing `r2CspOrigins()` helper (covers both `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com` and `R2_PUBLIC_URL`). Without this directive the browser was blocking the Scholar OA-PDF iframe at the CSP layer even though the signed URL itself worked. Sandbox attributes on the iframe are unchanged (`allow-scripts allow-popups allow-forms`, never `allow-same-origin` per A14).

### Copilot review follow-up — Scholar oa: namespace, AI upload StrictMode safety, CrossRef UA docs (2026-05-04)

- **Frontend `PAPER_ID_REGEX` now mirrors backend `CANONICAL_ID_RE`.** Adds the `oa:W\d{4,12}` branch in `pages/scholar/scholarConstants.js` so OpenAlex-only paper deep links (`?paperId=oa:W…`) pass `isValidPaperId()` instead of being rejected client-side.
- **`useAiAttachments.addFiles` no longer kicks off XHR uploads inside the `setAttachments` updater.** React 19 StrictMode invokes state updaters twice in dev, which would have fired duplicate uploads per file. Side effects moved out of the updater; the seed array captured in the closure is iterated after the state commit.
- **CrossRef polite User-Agent docs corrected.** `secretValidator.js` description and `backend/.env.example` comment now show the actual default (`StudyHub/2.2 (mailto:support@getstudyhub.org)`), matching `DEFAULT_UA` in the CrossRef adapter.

### Hub AI v2 backend — Week 1 (2026-05-04)

- **Hub AI document upload module shipped.** Adds `POST/GET/DELETE/POST-pin /api/ai/attachments` with multer + magic-byte stage-1 (file-type 19.x ESM) + structural stage-2 (PDF/DOCX/text) + PDF embedded-JS reject + per-plan (free 5MB/40p, verified 15MB/60p, pro 30MB/100p, admin uncapped) caps + atomic storage-quota race defense + Stripe-style `Idempotency-Key` (24h TTL) + opaque-key R2 upload to a NEW `R2_BUCKET_AI_ATTACHMENTS` private bucket + DOCX text via mammoth ≥ 1.11.0 (CVE-2025-11849 patched) wrapped in a 2-concurrency semaphore + 30s wallclock watchdog + NFKC normalize + invisible-Unicode strip + prompt-injection phrase scrubber + audit log with `hashFilename(name)` (never raw fileName per A8). New rate limiters `aiAttachmentUpload/Delete/Pin/ReadLimiter` keyed on `req.user?.userId`.
- **`POST /api/ai/messages` accepts `attachmentIds`.** PDFs forward as Anthropic native `document` blocks with `cache_control: { type: 'ephemeral', ttl: '1h' }` + citations enabled (master plan L1-CRIT-2). DOCX/TXT/MD/code wrap in salted `<document_${conv.slice(0,8)}>` XML delimiters. System prompt also carries `cache_control` ttl=1h to keep prompt-cache hit rate >60%. New `DOCUMENT_TRUST_CLAUSE` appended to system prompt when attachments are present.
- **Daily Anthropic spend ceiling.** New `AiGlobalSpendDay` table with atomic UPDATE-and-compare on every chat call; `AI_DAILY_SPEND_USD_CEILING` env (default 100). Per-user daily token sub-cap (50K free / 200K verified / 500K pro). Admin tier bypasses both — founder-locked 2026-05-04. Refunds the over-estimate after the actual usage lands.
- **Two-phase retention sweeper.** New `aiAttachmentSweeper.js` runs every 6h via `runWithHeartbeat('ai.attachment_sweep', ...)`: phase-1 marks `expiresAt < NOW()` rows soft-deleted in 500-row batches and decrements per-user quota; phase-2 drains soft-deleted rows to R2 at <=10/sec with no DB tx around the round-trip.
- **Library weekly corpus sync.** New `library.weeklySync.js` runs every 7d via `runWithHeartbeat('library.weekly_corpus_sync', ...)` (heartbeat INSIDE the arrow function per L2-CRIT-1). Picks 5 oldest `LibrarySyncState` rows, paginates one page each through `safeFetch(['www.googleapis.com'])`, caps at 80 fetches/day, exponential backoff (60s → 6h) on 403/429, honors `LIBRARY_SYNC_ENABLED=false`. New seed script `seedLibrarySyncQueries.js` (~50 academic query variants).
- **Schema additions (idempotent migration `20260504000001_hub_ai_v2_and_library_sync`).** New tables: `AiAttachment`, `UserAiStorageQuota`, `AiGlobalSpendDay`, `AiUploadIdempotency`, `LibrarySyncState`. Column adds: `AiMessage.attachments Json?`, `AiUsageLog.documentCount/tokensIn/tokensOut/documentTokens/costUsdCents`. Every statement uses `IF NOT EXISTS` or a `DO $$ ... EXCEPTION WHEN duplicate_object` block.
- **New deps:** `mammoth ^1.11.0` (CVE-2025-11849 patch — required), `file-type ^19.0.0` (ESM-only, dynamic-imported once with cache). Logged per CLAUDE.md "v2.1 dependency exception."
- **Test coverage added (59 tests).** `aiAttachments.parsers.test.js` (26), `aiAttachments.security.test.js` (13), `aiAttachments.upload.test.js` (5), `aiAttachments.retention.test.js` (4), `aiSpend.test.js` (6), `librarySync.test.js` (5).

### Scholar v1 backend + reader (Week 4, 2026-05-04)

- **New `/api/scholar` module — scholarly paper search across 5 OA sources.** Adds the Scholar v1 backend per master plan §18: search fan-out across Semantic Scholar, OpenAlex, CrossRef, arXiv, with Unpaywall enrichment for OA-PDF links. Per-source token-buckets (1/s, 8/s, 30/s, 0.33/s, 8/s) defend upstream quotas; results dedupe by DOI primary + normalized title + first-author secondary. Search results cached per-query in `ScholarPaperSearchCache` (1h TTL), paper detail in `ScholarPaper` with `staleAt` freshness. Seven endpoints: `GET /search`, `GET /paper/:id`, `GET /paper/:id/citations`, `GET /paper/:id/references`, `GET /paper/:id/pdf` (signed R2 URL), `POST /save`, `DELETE /save/:paperId`, `POST /cite`, plus AI deep-link endpoints `POST /ai/summarize` and `POST /ai/generate-sheet` that prepare structured prompts for the existing `/api/ai/messages` surface (no AI module changes). All writes carry `originAllowlist` and per-route limiters from `lib/rateLimiters.js`. Citation export supports BibTeX (with LaTeX-active escapes + `\X` strip per L3-HIGH-6), RIS, CSL-JSON, APA, MLA, Chicago, IEEE, Harvard. Canonical paper-id regex tightened to a printable-ASCII allowlist after a null-byte injection test surfaced that `[^\s]` admits `\0`. License gate (CC-\* / public-domain only) runs before any R2 PDF cache write. New env vars `SEMANTIC_SCHOLAR_API_KEY`, `OPENALEX_API_KEY`, `UNPAYWALL_EMAIL`, `R2_BUCKET_SCHOLAR_PAPERS`, `SCHOLAR_PDF_MAX_BYTES_PER_PAPER` documented in `.env.example` + `secretValidator.js`. `safeFetch` switched from the `undici` package to the Node 20 global `fetch` so no new dep ships. Test coverage: 85 tests across `scholar.search.test.js`, `scholar.adapters.test.js`, `scholar.cite.test.js`, `scholar.security.test.js`, `scholar.rateBucket.test.js`.

### Hub AI v2 frontend — Week 2 redesign (2026-05-04)

- **Hub AI page composer rebuilt.** New `AiComposer.jsx` card with attachment chips strip, slash-command popover (`/summarize`, `/quiz`, `/explain`, `/outline`, `/cite`, `/translate`, `/define`), `@`-mention popover (My sheets / My notes / My courses), recency toggle, model badge, and Send/Stop button states. Slash + mention menus implement the WCAG ARIA combobox pattern (`role="combobox"` + `aria-controls` + `aria-activedescendant`) so screen readers and keyboard users can navigate options with Arrow / Tab / Enter / Esc. Quota-reached banner above composer links to `/pricing`. Drag-drop overlay uses the dragenter / dragleave counter pattern so child transitions don't flicker. Multi-format upload (PDF / DOCX / images / text / code) goes through `XMLHttpRequest` so we surface real upload progress + 60s stall guard, and every upload carries an `Idempotency-Key` header so retries don't duplicate. Density toggle (Comfortable / Compact) persists to `localStorage` and is rendered as an ARIA radiogroup.
- **AiBubble mini-chat — accessibility + mobile fixes.** Mini-chat panel now has `role="dialog" aria-modal="true"` with focus trapped via the shared `useFocusTrap` hook; Esc closes and returns focus to the bubble button. Below 768px viewport the bubble redirects to `/ai` full page instead of rendering a cramped mini-chat. Streaming pulse moved from inline animation to a CSS class (`.sh-ai-bubble-streaming`) wrapped in `@media (prefers-reduced-motion: no-preference)` so OS + in-app reduced-motion preferences are both honored.
- **Streaming announcer + Save-as-note action.** New page-level `role="status" aria-live="polite"` region announces only state transitions ("Hub AI is responding" / "Response complete" / "Streaming stopped") instead of every streamed token. Each AI message gets a "Save as note" button that opens a 480px focus-trapped modal with title + course picker that POSTs to `/api/ai/save-to-notes`. Citation footnote + side-panel components (`AiCitationFootnote.jsx`, `AiCitationSidePanel.jsx`) render Anthropic-emitted `cited_text` as inline `<sup>` markers that open a 480px slide-in dialog with focus trap + Esc-to-close.
- **Contrast + forced-colors fixes.** Important content text on the Hub AI surfaces now uses `var(--sh-subtext)` instead of `var(--sh-muted)` so it meets WCAG AA on white. Mention chips and active rows use `var(--sh-pill-text)` (#1d4ed8) on `var(--sh-brand-soft)` for 6.5:1 contrast. Gradient-text headlines fall back to `LinkText` under `@media (forced-colors: active)` so Windows High Contrast users keep readability.

### Launch-readiness sweep — sheet preview, GIF proxy, library pagination, scanner relaxation, subscription + notification gaps (2026-05-03 evening)

- **Sheet preview now feels like a real interactive sheet.** Added a third "Sandbox ↗" toggle next to Safe / Interactive on `SheetContentPanel.jsx` that opens the dedicated `/sheets/preview/html/:id` page in a new tab; the link carries `?interactive=1` so the dedicated page initializes in interactive mode when the in-page view was already there. Sharpened the help text under the toggle so users know they CAN click/type/run scripts inside the iframe ("Click, type, and run scripts inside the sheet — the sandbox keeps it isolated from your account and network"). The dedicated preview page now surfaces 403/runtime errors instead of silently snapping the toggle back.
- **Tier 2 (HIGH_RISK) PUBLISHED sheets are now interactive for any authenticated viewer.** Policy change: when an admin transitions a Tier 2 sheet to PUBLISHED, that publish IS the safety review — the sandbox isolation (allow-scripts + allow-forms only, no allow-same-origin, CSP `connect-src 'none'`, `form-action 'none'`, `frame-src 'none'`) keeps the parent app safe regardless of tier. Tier 2 unpublished (draft / pending-review / rejected) still owner+admin only. Tier 3 still blocked everywhere. Updates in `sheets.html.controller.js` and `preview.routes.js`; tests at `interactive-preview.test.js` updated to match.
- **HTML scanner relaxation — fewer false positives, AI-first review.** `redirect` (window.location) and `external form action` are now Tier 1 informational instead of Tier 2 because the sandbox already neutralizes both (top-nav blocked, `form-action 'none'` blocks submission). `scanInlineJsRisk` split into severity buckets: network primitives (fetch/XHR/WebSocket/sendBeacon) and document.cookie/domain are Tier 1 informational (CSP `connect-src 'none'` blocks them at runtime); only eval/Function/string-arg-timers/atob remain as Tier 2. Practice tests that call `fetch()` to a public API and save progress to `localStorage` no longer get queued for human review.
- **Tier 3 (QUARANTINED) is now auto-rejected.** Sheets that hit critical findings (credential capture), 3+ distinct high-risk categories, or coordinated miner+obfuscation are auto-rejected at submit time with a clear reason — no admin queue. The user gets a `sheet_rejected` notification (essential, bypasses block filters) explaining why. Tier 2 still goes to admin review BUT only escalations the AI reviewer couldn't resolve land in the human queue ("special cases only"). `htmlDraftWorkflow.js` updated; `reviewReason` persisted on the sheet row.
- **GIF picker rewired to a backend proxy.** New `backend/src/modules/gifs/` (mounted at `/api/gifs/search`) calls Tenor server-side so the API key never ships to clients. Returns 503 with a clear message when `TENOR_API_KEY` is unset. Tenor URLs are validated against an allowlist (`media{,1,2,3}.tenor.com`, `c.tenor.com`, https only) so a shape change or upstream cache-poisoning can't relay `javascript:` / `data:` URLs to the frontend `<img>`. `originAllowlist()` + `requireAuth` + `gifSearchLimiter` (60/min/user, IPv6-safe keyGenerator) on the route. Errors emit `Cache-Control: no-store` so a 503 isn't cached for 60s in the browser. Frontend (`GifSearchPanel.jsx`) calls the proxy with `credentials: 'include'`; `unavailable` state is reset on each new search so a key rotation is visible without reload. `TENOR_API_KEY` added to `secretValidator.js` RECOMMENDED so prod boot warns when missing. Removed `VITE_TENOR_API_KEY` from frontend env example + config.
- **Library pagination no longer caps at page 10.** Google Books soft-caps deep pagination around startIndex 200-400 for category-only queries even when `totalItems` reports 50,000+. Backend now records the empirically-discovered cap per `(query, filters)` after TWO consecutive empty pages (avoids transient-empty false positives), bounded to 5,000 entries with LRU eviction (DoS hardening — the route was previously unrate-limited), 15-minute TTL. New `libraryReadLimiter` (120/min/IP) on `GET /search` + `GET /books/:id`. `pageNum` clamped to 200. Filter cache key is now canonicalized (sorted Object.keys) so `?cat=X&sort=Y` and `?sort=Y&cat=X` hit the same memo. Frontend auto-bounces the user to the last reachable page with an explanation toast instead of showing a permanent "No books found." Prefetch skips next-page when `endOfResults`.
- **Subscription + paywall hardening.**
  - **Gift subscriptions now expire.** `getUserPlan` checks `currentPeriodEnd` against `now` for any `active`/`trialing` subscription. Without this, a 30-day Pro gift conferred Pro forever because no Stripe webhook flips status to `canceled` afterwards.
  - **`past_due` no longer grants Pro.** Removed from `ACTIVE_STATUSES`. Previously a payment failure granted up to 3 weeks of free Pro while Stripe's smart retry chain ran. Now treated as a hard cutoff — UI banner unchanged but quotas drop to free until the card is fixed.
  - **Pricing page bullets pruned.** Removed claims with no backend implementation: Playground projects (no module), PDF/code uploads to AI (whitelist is image-only), Custom themes (flag is dead), 5 GB storage cap (never enforced on uploads). The Pricing page now only advertises features that have server-side gates.
- **Notifications coverage closed.**
  - **User-initiated cancel now creates a `subscription_will_cancel` notification** immediately on `POST /api/payments/subscription/cancel`. Previously the user's only signal was a JSON success message that didn't survive a tab close — they had no inbox proof of their cancel until Stripe's eventual `customer.subscription.deleted` fired weeks later, which fueled refund disputes.
  - **Sheet upload monthly quota now creates an `upload_quota_reached` notification** (deduped per calendar month) when a free user hits their cap, with a `/pricing` upsell link. The 403 is unchanged for the API client.
  - **`subscription_will_cancel`, `upload_quota_reached`, `plagiarism_flagged`** added to `ESSENTIAL_NOTIFICATION_TYPES` so they bypass block filters. Frontend `notificationIcons.js` filter chips updated.
- **Group discussion deep-links work.** `GroupDetailView` reads `?tab=discussions&post=<id>` from the URL and expands the right thread on mount. Notification linkPaths from `studyGroups.discussions.controller.js` and `studyGroups.discussions.routes.js` now point to those deep-links instead of dropping users on Overview.
- **Sheet discussion `replyCount` no longer wiped on edit/resolve.** PATCH and resolve endpoints now `include: { _count: { replies: true } }` and return the real count + status + upvote state, so the frontend hook's whole-row replacement no longer clears the badges.
- **NotificationsPage filter chips include "Sheets".**
- **AiPage conversation row action buttons now hide via `display: none` instead of `opacity: 0`** so keyboard users don't focus invisible controls.
- **HIBP breach check on the Google-OAuth password setup path.** Mirrors the existing `/register` and `/reset-password` flows — every bcrypt site checks against the HIBP k-anonymity API before hashing.
- **`requireTrustedOrigin` applied to `/api/auth/forgot-password` and `/api/auth/reset-password`** for defense in depth on top of the global Origin gate.

### Bug-bash punch list — full execution (2026-05-03 evening)

Continuation of the morning sweep. All seven items the founder flagged as "deferred" were executed in this pass.

- **Study Groups discussions 400 fixed.** The frontend was calling the `createPost` hook with a single object as the first arg, but the hook signature is `createPost(groupId, postData)`. The whole bag was being interpolated as `groupId` so the URL became `/api/study-groups/[object Object]/discussions` and the backend's `parseId()` correctly rejected it with 400 "Invalid group ID." `GroupDiscussionsTab.jsx` now passes the two args positionally and short-circuits when `groupId` is missing.
- **Video pipeline ClamAV moved to background.** The synchronous AV scan inside `/api/video/upload/complete` was the actual root cause of "stuck on processing" — every upload waited the full 12s socket timeout when ClamAV was unreachable on Railway, and concurrent uploads stacked the wait. The scan now runs inside `processVideo()` after R2 download, alongside the hash + transcode chain. The HTTP request returns immediately. Fail-CLOSED in production is preserved: an infected scan flips status → `failed` and deletes R2; a scanner-error in prod also flips → `failed` with a `security_scan_unavailable` step so the frontend's poll surfaces the failure.
- **Accessibility settings tab.** New `Settings → Accessibility` tab with two togglable preferences: focus-ring outline (default ON for WCAG 2.1 AA — keyboard users need it; toggle off if it visually distracts you while clicking) and reduce motion (default OFF — disables animations, transitions, and slide-ins for users sensitive to motion). Persisted to localStorage and applied via `<html data-focus-ring>` + `<html data-reduced-motion>` attributes that gate the global `*:focus-visible` rule and an `animation/transition-duration: 0.01ms` reset. Bootstrap reads localStorage in `main.jsx` BEFORE first paint so the user never sees a flash of the unwanted style.
- **OAuth password + username setup in onboarding.** `/signup/role` now lets Google signups (a) pick their own username (with live availability check via `GET /api/auth/check-username`) and (b) set a password during onboarding. Password is hashed with bcrypt cost 12 and stored on the user row. Picking a custom username 409s back on collision so the user can pick another instead of getting a silent numeric-suffix retry. Username is optional — omitting it falls back to the legacy auto-derive + retry loop. Password is also optional via the "Set a password (recommended)" checkbox; users who skip it get the legacy 32-byte random hash and can set a real password later from Settings → Account. Backend at `auth.google.controller.js` validates both fields the same way the local-signup flow does. Cancel/Continue buttons in the role picker now use token-based primary/secondary button styles instead of the missing `sh-button` class that was rendering as default browser gray boxes.
- **Multi-goal widget on the profile.** New `LearningGoal` collection endpoints (`GET/POST /api/users/me/goals`, `DELETE /api/users/me/goals/:goalId`) on top of the existing single-goal table (which already had no `@unique` on userId, so no schema migration). The Profile Overview tab renders a `<GoalsCard>` with up to 10 goals; add/remove inline; per-user limit enforced server-side. The legacy `/me/learning-goal` single-goal feed widget is kept for back-compat — both endpoints write to the same table.
- **Group attachment preview window.** New reusable `<AttachmentPreview>` component in `frontend/studyhub-app/src/components/`. Renders images, PDFs, videos, audio, and other files in a centered modal with a fullscreen button (Fullscreen API) and a download fallback. PDF iframes use `sandbox="allow-same-origin"` + `referrerPolicy="no-referrer"` (same pattern as the admin `ContentPreviewModal`). ESC + click-outside dismiss; focus moves to the close button on open. Wired into `GroupResourcesTab` so clicking a resource thumbnail or attached file opens the modal — discussions integration ready for the next pass.
- **Topic picker with canonical catalog.** New migration `20260503000001_add_canonical_topics` adds `isCanonical / category / displayName` columns to the existing `Hashtag` table (idempotent, additive). Boot-time `seedCanonicalTopics.js` upserts ~110 curated topics across 14 categories (Computer Science, Math, Biology, Chemistry, Physics, Engineering, Business, Humanities, Languages & Literature, Social Sciences, Health, Law, Arts, Test Prep, General). New public-readable `GET /api/hashtags/catalog?q=&category=` endpoint returns matching topics + the available categories. Frontend `<TopicPickerModal>` opens from the feed's "+ Add topic" button: searchable, category-chip filtered, click-to-follow / click-to-unfollow, with a "Custom topic" escape hatch at the bottom for power users who need a tag the catalog doesn't have. The free-text inline-input UX is gone.
- **Bot review feedback applied where correct, rejected where it conflicted with file style.** `useSheetViewer` now resets `htmlWarningAcked` on sheet change (prevents Tier-1 ack carrying between sheets). `UsersTab` ⋯ menu dropped `role="menu"` / `role="menuitem"` ARIA semantics (partial Menu pattern was worse than no pattern). Sourcery's "use object destructuring" + "simplify ternary" suggestions on the Google controller applied where they didn't break readability.

### Bug-bash sweep — auth, signup, video, recommendations, A11y nits (2026-05-03)

- **Google sign-up no longer surfaces a "must accept Terms" error before the user has done anything.** The legal-acceptance modal was firing on the `/register` page when a Google session was already active, and dismissing it set the red error banner on first paint. The legal acceptance step lives at `/signup/role` (the OAuth role picker) and is enforced server-side at `POST /api/auth/google/complete` (line 184 of `auth.google.controller.js`); pre-flighting it on `/register` was redundant and visibly broken. The Google button now forwards directly to the picker page, where the existing "I've reviewed and agree to..." checkbox carries the legal gate.
- **Pricing page: removed the redundant "Save $10 with yearly" pill** — duplicated the in-button "Save 17%" copy and looked like double-discount marketing.
- **People-to-Follow now returns an empty list for cold-start accounts.** Previously, a brand-new account that followed nobody and had no enrolled courses got recommended the platform's most-followed users at random — feels broken on Day 1. New gate: if the caller has 0 follows AND 0 enrollments AND 0 hashtag follows, return `[]`. The frontend already handles an empty list gracefully (renders nothing).
- **Video DELETE: blocked clones are now unblocked when the original is deleted.** Without this, a user who uploaded a video, regretted it, and deleted it would still leave behind a permanent "this is a duplicate of a video that no longer exists" block on every subsequent re-upload. The DELETE handler now `prisma.video.updateMany({ where: { contentHash, status: 'blocked' }, data: { status: 'failed' } })` before deleting the original row, so the dedup quarantine doesn't outlive the original.
- **A12 fixes on `video.routes.js` DELETE + appeal routes** — both used `parseInt` + `isNaN` instead of the canonical `Number.parseInt` + `Number.isInteger` guard.
- **New `GET /api/auth/check-username?username=...` endpoint** — public, read-tier rate limited, case-insensitive lookup, reserved-words list (admin/support/staff/system/etc.). Returns `{available, reason}` with reasons `invalid` / `reserved` / `taken`. Available for the onboarding flow to wire a real-time uniqueness badge so Google signups don't get a derived username collision after the user has committed to the flow.
- **`useSheetViewer` now resets `htmlWarningAcked` on `sheet?.id` change.** Without this, ack'ing the Tier-1 HTML warning on sheet A and then navigating to sheet B (without unmounting) would carry the ack into B's render and let the user bypass B's warning gate. Per-sheet localStorage-ack effect re-promotes the flag if B was previously ack'd, so behavior on truly-acked sheets is unchanged.
- **Admin `UsersTab` ⋯ menu: dropped `role="menu"` / `role="menuitem"` ARIA semantics.** A partial Menu pattern (no roving tabindex, no arrow-key nav, no first-item focus on open) is worse than no pattern — assistive tech announces "menu" but the keyboard contract isn't there. Each item is already a `<button>`, so the popover-of-buttons fallback is fully accessible without claiming Menu semantics.
- **Documented the rest of the founder's punch list** in `docs/internal/audits/2026-05-03-bug-bash-followups.md` — video processing-pipeline ClamAV-sync stall, canonical Topic catalog + picker, multi-goal profile widget, OAuth password setup in onboarding, group attachment preview window with fullscreen, Study Groups "Invalid group ID" 400, Accessibility settings tab. Each is scoped with files-to-touch + acceptance criteria so the next session can pick one and ship it.

### Dependency changes (2026-05-02)

Accepted 9 of the 10 bumps in the Dependabot `backend-minor-patch` group. All are minor or patch within the existing major line:

- `@aws-sdk/client-kms` 3.1036.0 → 3.1041.0 (5-patch within 3.10x)
- `@aws-sdk/client-s3` 3.1036.0 → 3.1041.0
- `@aws-sdk/s3-request-presigner` 3.1036.0 → 3.1041.0
- `@sentry/node` 10.50.0 → 10.51.0
- `express-rate-limit` 8.4.0 → 8.4.1
- `nodemailer` 8.0.5 → 8.0.7
- `posthog-node` 5.30.1 → 5.33.0
- `eslint` 10.2.1 → 10.3.0 (devDep)
- `globals` 17.5.0 → 17.6.0 (devDep)

Rollback plan if any of these regress in prod: `npm --prefix backend install <pkg>@<prior>` for the offending package only, commit `package.json` + `package-lock.json` together, redeploy. Backend lint clean and 59/59 messaging + interactive-preview tests pass after the install.

**Deferred:** `@anthropic-ai/sdk` 0.39.0 → 0.92.0 — that's a 53-version jump on a 0.x SDK and effectively a major bump. In 0.x semver every minor is a potential break, and the Hub AI surface relies on streaming, tool use, and SSE event shapes that have all churned across that range. Will be done in a dedicated migration cycle with `claude-api` skill + smoke-test pass on `/ai`.

### 11-loop sweep — security hardening + UI polish (2026-05-02)

After the live-bug sweep below, ran 6 broader review loops (Feed, Sheets/Notes/Library, Messaging/Groups/AI, Profile/Settings/Onboarding, Auth/Pricing/Public, Admin/Misc) and applied the high-confidence findings:

- **A11 critical:** `backend/src/modules/admin/admin.content.controller.js` was the last admin write router missing `originAllowlist()` defense in depth (announcement create/pin/delete + HTML-uploads kill switch). Added at the router level — `originAllowlist` short-circuits GETs so applying broadly is safe.
- **A12 input validation:** added `Number.isInteger + < 1` guards on `feed.social.controller.js` PATCH `/posts/:id/comments/:commentId` (was using bare `Number()`), `admin.users.controller.js` PATCH `/users/:id/staff-verified`, and replaced `Number.isFinite` with `Number.isInteger` on the moderation-log CSV export. Frontend: `LibraryPage` page param (was producing `NaN` totalPages on malformed `?page=abc`), `MessagesPage` DM `targetId`, `AiPage` conversation id (was missing radix).
- **Bug:** `MessageBubble.canEdit` previously stayed truthy forever because `Boolean(... || createdAt)` always passed — every persisted message has a createdAt. Now derives the cutoff from `editableUntil` or `createdAt + 15min` and compares to mount time.
- **A16:** two `console.error` calls in `admin.users.controller.js` (moderation log + CSV export error paths) replaced with `log.error({event, ...}, message)` so log-aggregator alerts can fire.
- **A4:** `PrivacyTab.handleToggle` now hydrates `isPrivate` from the server response body's `isPrivate` field (falling back to the requested value) instead of writing the requested value blindly into session state.
- **A15:** `MessageThread.jsx` "Report" menu item was calling `window.open('/support', '_blank')` without the `noopener,noreferrer` window-features string. Fixed.
- **Token consistency:** `SheetsTab.jsx` Delete pill button was using hardcoded `#fef2f2` / `#dc2626` / `#fecaca` hex values instead of `var(--sh-danger-*)` tokens (CLAUDE.md CSS conventions). Switched to tokens — now respects dark mode.
- **UI polish (one per cluster):** "Fresh" chip on Sheet Grid cards updated within the last 24h (`SheetGridCard.jsx`); `<time>` element with native title-tooltip on FeedCard timestamps for hover-reveal absolute date; "Save $10 with yearly" pill above the PricingPage subscribe buttons; brand-color left-border accent on AnnouncementsPage cards posted within the last 24h.

### Live-bug sweep + 5-loop review pass (2026-05-02)

- **Video playback fixed.** The frontend Cloudflare Pages CSP at `frontend/studyhub-app/public/_headers` was missing a `media-src` directive entirely, so `<video>` elements loading from R2 fell back to `default-src 'self'` and were blocked. Added `media-src 'self' blob: https://*.r2.cloudflarestorage.com https://api.getstudyhub.org`. The browser-level "Video playback failed." banner on `/feed?filter=videos` is gone after this lands.
- **Google signups un-paused.** `GET /api/flags/evaluate/:name` required auth, but anonymous users on `/register` need to evaluate the OAuth picker flag BEFORE they have a session. Switched the eval route to `optionalAuth` + `readLimiter`, kept all 4 admin write routes on `requireAuth + requireAdmin + adminLimiter`. Fail-closed semantics preserved: `evaluateFlag()` returns `NO_USER_FOR_ROLLOUT` for `<100%` rollouts when called anonymously.
- **Sheet Grid card description fallback.** `SheetGridCard.jsx` now falls back to `sheet.description` when the server-extracted `previewText` is null (older sheets pre-backfill, AI sheets where visible text is mostly SVG-icon labels). Sheets without either field still render no preview block — same as before — but the common case where `description` exists now renders.
- **Admin user table density.** Three stacked action pills (Make admin / Grant badge / Delete) collapsed into a single `⋯` dropdown menu so each row stays one line tall. Click-outside + Escape dismissal, ARIA roles wired.
- **Interactive sheet preview surfaces silent errors.** `useSheetViewer.js` now sets `runtimeError` and shows it in `SheetContentPanel.jsx` when the runtime fetch fails or returns no `runtimeUrl`, instead of silently flipping `viewerInteractive` back off with no UI feedback. Outdated "owner/admin only" comment corrected — Tier 0 + Tier 1 are open to all authenticated viewers per the publish-with-warning policy.
- **Iframe sandbox tightening (sweep findings).** `AiSheetSetupPage.jsx` `data:`-URI preview iframe changed from `sandbox="allow-same-origin"` to `sandbox=""` (CLAUDE.md A14: a no-op today on opaque-origin URIs but re-introduces the escape vector under a future refactor). Admin `ContentPreviewModal.jsx` PDF iframe gained `sandbox="allow-same-origin"` + `referrerPolicy="no-referrer"`. Admin `SheetReviewDetails.jsx` interactive-preview sandbox gained `allow-popups`.
- **A12 input-validation sweep:** four `parseInt(req.params.messageId, 10)` call sites in `messaging.reactions.routes.js` now have explicit `Number.isInteger(id) && id >= 1` guards. `ai.routes.js` pagination `parseInt` calls gained the missing radix. `announcements.routes.js` switched four `isNaN()` guards to the canonical `!Number.isInteger || < 1` shape and the lone raw `res.status(400).json({error})` was migrated to `sendError(...)`.
- **A10/A16 observability:** `htmlArchiveScheduler.js` 6-hour interval is now wrapped in `runWithHeartbeat('html.archive_expired_versions', …, { slaMs: 5*60_000 })` and the `console.error` swallow was replaced — failures now emit `job.failure` events to pino + Sentry.
- **DOMPurify call-site consistency:** the two `DOMPurify.sanitize()` calls in `NoteEditor.jsx` (markdown-to-HTML render + print/export) now pass `{ USE_PROFILES: { html: true } }` explicitly, matching the convention used in `notesComponents.jsx`, `SheetContentPanel.jsx`, and `BookDetailPage.jsx`. Default behavior is unchanged today, but the explicit profile survives a future DOMPurify default change.

### Feed video player rewritten + click-to-play overlay + keyboard shortcuts (2026-05-02)

- **Feed videos now actually play.** The previous player kept the `<video>` element at `opacity: 0` until `onLoadedData` fired, but with `preload="metadata"` that event only fires AFTER the user clicks play — and the user couldn't click play because the controls were invisible behind the thumbnail. Restructured around the standard `<video poster=…>` pattern: the video element is always at full opacity, controls are always reachable, and a custom click-to-play overlay (big white play button on a slight scrim) sits on top of the poster only while the user hasn't started yet. The stall spinner only appears when the user has actually started AND playback stalls mid-stream — never on initial idle.
- **New small features:** mute preference persists across sessions (single boolean in localStorage at `studyhub.feed.video.muted`, fail-silent on private mode); keyboard shortcuts when the video has focus — Space/K (play/pause), M (mute), F (fullscreen), ←/→ (±5s seek). Comment composers and other inputs are not stolen from (early-return on `INPUT`/`TEXTAREA`/`contentEditable`).
- **Two parallel security loops caught four bugs before commit:** (1) `started` state never reset when `video.id` changed — fixed by resetting all video-tied state in the fetch effect, so a parent that swaps the prop on the same mounted instance still gets a fresh overlay; (2) F-key fullscreen shortcut bypassed `controlsList="nofullscreen"` when the creator disabled downloads — gated; (3) Safari fullscreen API not handled (`webkitRequestFullscreen` / `webkitFullscreenElement`) — added the prefixed fallbacks; (4) `stalled` could stick at `true` forever on mid-play network drop because `onWaiting` fires but `onCanPlay` never does — added `onError` to clear the spinner and surface the failure. All ship-ready.

### Security-loop fixes on the 2026-05-01 work (2026-05-02)

- **Structured `clamav.scan_*` pino events now emitted from `lib/clamav.js`** so the alerting guidance in `RUNBOOK_CLAMAV.md` has something to alert on. Three event keys (`clamav.scan_clean` info, `clamav.scan_infected` warn, `clamav.scan_failed` warn) carry `engine` + `bytes` + threat / message context. Logger loaded lazily so a require-time failure can never block scans.
- **`R2_ACCOUNT_ID` is now slug-validated** (`/^[a-f0-9]{8,64}$/i`) before being interpolated into the CSP `media-src` / `img-src` directives in `backend/src/index.js`. `R2_PUBLIC_URL` is now also restricted to http(s) origins. Defense in depth on the Railway secret pipeline — a stray `;` or quote in an env value can no longer corrupt the CSP header.
- **`RUNBOOK_CLAMAV.md` corrected** from "`CLAMAV_HOST` is RECOMMENDED" to the actual `OPTIONAL` classification in `secretValidator.js`.

### Video playback, interactive preview clicks, and player flash fixed (2026-05-01)

- **Videos now actually play.** The `appSurfaceCsp` `media-src` directive was `'self'` only, but the stream endpoint returns signed R2 URLs pointing at `https://<account>.r2.cloudflarestorage.com/...` — a different origin. Browsers blocked every `<video src=…>` against the signed URL with a CSP violation that does NOT show up in the Network tab as a failed request, so "video doesn't play" had no obvious diagnostic. Fixed by deriving R2 origins from `R2_ACCOUNT_ID` and (optional) `R2_PUBLIC_URL` and adding them to both `media-src` and `img-src` in `backend/src/index.js`. Matches Cloudflare's documented CSP guidance for self-hosted players.
- **Interactive Preview clicks now register on Tier 1 sheets.** `backend/src/modules/preview/preview.routes.js:168` always sent `SAFE_PREVIEW_DIRECTIVES` (with `script-src 'none'`) for Tier 1 sheets, even on the runtime endpoint that's specifically meant to allow interactivity. So the iframe loaded an interactive HTML doc with `<script>` tags but the CSP header silently blocked their execution — clicks did nothing. Fixed to switch to `RUNTIME_DIRECTIVES` when `isRuntime=true`. Three new regression tests in `backend/test/preview.routes.test.js` lock the Tier 1 runtime CSP, the Tier 1 preview CSP, and the Tier 2 always-safe CSP in place.
- **Play-button flash removed.** `FeedVideoPlayer` in `frontend/studyhub-app/src/pages/feed/FeedCard.jsx` was unmounting the poster `<img>` the moment `buffering` flipped to false, which left the `<video>` element to paint its default (transparent/white) backdrop for one frame before its first decoded frame appeared. Now both layers stay mounted and cross-fade over 180ms; the `<video>` element gets `background:#000` so transitions never pass through a brighter color, and the poster `<img>` is `pointer-events:none` so it can't swallow native-control clicks during the fade. Pattern mirrors video.js / Mux Player / YouTube Embed.
- **CLAUDE.md A-rule sweep on the video module:** swapped two `console.warn`/`console.error` calls in `video.service.js` for structured `log.warn`/`log.error` with stable `event` keys (A16); wrapped the fire-and-forget `processVideo` and `deleteVideoAssets` background jobs in `runWithHeartbeat('video.process')` / `runWithHeartbeat('video.delete_assets')` with explicit SLA budgets so silent stalls now produce `job.failure` events in pino + Sentry instead of disappearing (A10); added an explicit allowlist enum-validator on the `?quality=` query param in `GET /api/video/:id/stream` so only `360p|720p|1080p|original` reach the `variants` lookup (A13). Backend lint clean; preview / interactive-preview / clamav suites green (39/39).

### ClamAV antivirus wired to production (2026-05-01)

- **ClamAV sidecar is now live on Railway.** The `clamav/clamav:stable` image runs as a private service at `clamav.railway.internal:3310`; backend `CLAMAV_HOST`/`CLAMAV_PORT`/`CLAMAV_DISABLED` are wired so video uploads now fail-CLOSED in production per CLAUDE.md, and HTML sheet submissions get a real "antivirus clean" signal instead of the soft "scanner unavailable" warning.
- **Wire-protocol fix in `backend/src/lib/clamav.js`.** The streaming command was `INSTREAM\0` (legacy format); clamd 1.x+ rejects that with `UNKNOWN COMMAND`, which surfaced in the UI as "Antivirus scanner unavailable — Details: UNKNOWN COMMAND" on every sheet upload and "Security scanner unavailable. Please retry." in the feed composer. Command is now `zINSTREAM\0` (NUL-terminated mode prefix). New regression test under `backend/test/clamav.adapter.test.js` spins up a mock TCP server and asserts the wire bytes — the protocol cannot silently regress again.
- **New runbook** at `docs/internal/security/RUNBOOK_CLAMAV.md` documents the Railway sidecar setup, smoke test, failure modes (incl. emergency `CLAMAV_DISABLED=true` bypass with a 1-hour window), and the wire-protocol gotcha so future operators don't re-hit it.

### Fork gate + Tier-1 interactive preview opened to all viewers (2026-05-01)

- **Fork is now gated on `allowEditing`.** When a sheet creator turns OFF "Allow others to edit," the Fork button disappears for non-owners on the sheet viewer, sheet browse cards, and the mobile detail view; the backend `POST /api/sheets/:id/fork` returns 403 `FORK_DISABLED` for the same case (CLAUDE.md A6 defense in depth — frontend hide + backend reject). Owners never saw Fork on their own sheets to begin with (backend already 400'd self-forks).
- **Interactive Preview now works for non-owner viewers on Tier 1 (FLAGGED) sheets.** Previously, AI-generated study tools that include `<script>` (flashcards, quiz, match game, etc.) tripped Tier 1 and the runtime token endpoint was owner-only — meaning the creator saw the working interactive UI but every other viewer got Safe Preview only. The HTML risk policy already documents Tier 1 as "publish with warning, viewable by all" — gate is now `tier <= RISK_TIER.FLAGGED` on `canInteract`, and the runtime route requires owner/admin only at Tier 2 (HIGH_RISK). Sandbox stays `allow-scripts allow-forms` (never combined with `allow-same-origin` per A14), so the parent app stays isolated regardless of tier. New regression tests in `backend/test/interactive-preview.test.js` lock the `<= FLAGGED` gate and the new HIGH_RISK 403 message in place.

### Post-deploy polish + Google signups deploy-safe (2026-05-01)

- **Admin tab pills** get more breathing room — pill row now has `padding: 14px 18px`, `gap: 12`, `rowGap: 10`, and `flexWrap: wrap` so the tab cluster doesn't look cramped at narrower widths.
- **Public Navbar logo** swapped from the static `LogoMark` to the `AnimatedLogoMark` for the landing/auth/marketing routes (where `isLanding || !user`). Authenticated app chrome keeps the static mark.
- **Google signups deploy-safe.** `scripts/seedRolesV2Flags.js` now supports `forceEnabled: true` per flag — `flag_roles_v2_oauth_picker` is now force-enabled at every Railway boot, so an accidental admin-UI flip-off self-heals on the next deploy. Operators can opt out for incident-response kill-switching by setting `ROLES_V2_HONOR_ADMIN_TOGGLES=true`. New env-var documented in `backend/.env.example`.
- **Creator Audit Consent Log empty state** rewritten with a proper subtitle ("Read-only audit trail of CreatorAuditConsent rows for legal disputes…") and a polished "No consent rows yet / No revoked consents" body that explains _why_ the table is empty and how rows get populated.
- **Achievements page chrome fixed.** `/achievements` and `/achievements/:slug` now use the canonical authenticated-app layout (`Navbar` + `AppSidebar` + `app-two-col-grid` + `pageShell('app')`) — previously they rendered the sidebar without the top Navbar, producing a cut-off avatar header and no visible Hide button.
- **`docs/internal/security/RUNBOOK_CLAMAV.md`** added — Railway sidecar setup procedure for the ClamAV daemon (resolves the "Security scanner unavailable" 503 on prod video uploads + HTML drafts), with the `CLAMAV_DISABLED=true` emergency-bypass path documented as the founder-approved exception.

### 2FA recovery codes + Admin MFA enforcement scaffolding (2026-05-01)

- **2FA recovery codes** (NIST 800-63B AAL2 alt-factor pattern). Generates 10 single-use 64-bit codes (`xxxxx-xxxxx` hex), stores bcrypt hashes, exposes plaintext once at generation. Endpoints: `POST /api/settings/2fa/recovery-codes/regenerate`, `GET /api/settings/2fa/recovery-codes/status`, `POST /api/auth/login/recovery-code`. Behind `flag_2fa_recovery_codes` (ships disabled, founder flips on after testing).
- **Admin MFA enforcement (L2.14).** `User.mfaRequired` column + login flow gate. When `flag_admin_mfa_required` is on AND user is admin with mfaRequired: forces challenge band on every login. Fail-CLOSED on flag-read errors so the founder cannot self-lock.
- **Migrations:** `20260501000004_add_2fa_recovery_codes`, `20260501000005_add_admin_mfa`. Both use `IF NOT EXISTS` for redeploy safety.
- **Copilot review fixes** from PR #289: `/api/*` `Cache-Control` + `X-Robots-Tag` middleware moved before webhook mounts (now applies to every API response); DSAR audit log redacted (no requesterName/Email/IP — 8-char SHA-256 prefix only); `LegalRequest` + `AiMessage flag` migrations made idempotent; `loadEnv.js` adopted by `index.js`.
- **`lib/useFocusTrap.js` consolidated** to use the same `focus-trap` engine as `FocusTrappedDialog`. One trap engine across the app instead of two.

### Modal focus traps + accessible dialog primitive (2026-05-01)

- **`components/Modal/FocusTrappedDialog.jsx`** — single accessible dialog primitive that wraps `focus-trap-react`. Tab/Shift+Tab cycle stays inside, Escape closes (configurable), backdrop click closes (configurable), focus restores to the trigger on close, body siblings receive `inert` + `aria-hidden` while open. Industry-standard implementation per W3C ARIA Authoring Practices §3.9 (Modal Dialog Pattern).
- **9 modals migrated:** `HtmlDownloadWarningModal`, `RoleTile` Modal, `LegalAcceptanceModal` (signup blocker), `CreatorAuditConsentModal` (publish-flow), `KeyboardShortcuts`, `ConfirmLossyConversionModal`, `AvatarCropModal`, `CoverCropModal`, `VideoThumbnailEditor`, `AchievementUnlockModal`.
- **Dependency add:** `focus-trap-react@^11.0.6` (~3 KB gzipped) under v2.1 dependency exception. Founder-approved.
- **New Playwright smoke test:** `tests/modal-focus-trap.smoke.spec.js` verifies Tab focus stays inside the dialog through 5 forward + 5 backward Tab presses on the legal-acceptance modal.

### TypeScript adoption reverted (founder-locked)

- **TypeScript removed from the project.** The brief TS adoption shipped earlier on 2026-04-30 was reverted the same day. Backend has no transpiler step (runtime is plain Node 20 CommonJS via `nodemon src/index.js`), so `.ts` files cannot run in production without adding ts-node or a build step neither of which the founder approved. Removed: `typescript` + `@types/*` devDependencies from both workspaces, `tsconfig.json` files (truncated to 0 bytes, safe to delete locally), `npm run typecheck` scripts, `--ext .ts` flag on backend lint script, `shared/types/` references in docs. The repo is JavaScript-only going forward; new files are `.js` / `.jsx`. JSDoc carries the type-hint role. CLAUDE.md "Language policy" section is the canonical rule.

### Achievements V2 — full system overhaul

- **54-badge catalog across 10 categories.** Authoring, Forking & Contribution, Reviewing, Notes, Study Groups, Social, Hub AI, Streaks & Consistency, Special (secret), and Founder/Community. Five visible rarity tiers (bronze / silver / gold / platinum / diamond) plus a secret tier hidden until earned.
- **XP + Level system** layered over the catalog. Each tier carries a fixed XP value (25 / 75 / 200 / 500 / 1500); user level is a function of total XP. New `LevelChip` component renders the user's level next to their username with a colour matching their highest-tier badge.
- **Hexagon SVG visual** replaces the legacy circular FontAwesome coins. New `AchievementHexagon` component supports 4 states (unlocked, locked-progress, locked-secret, recent) with reduced-motion-aware glow animation. All tier colours come from new `--sh-bronze/silver/gold/platinum/diamond/secret` tokens in `index.css` (light + dark mode).
- **Event-driven award engine.** New `backend/src/modules/achievements/` module: `achievements.engine.js` exports `emitAchievementEvent(prisma, userId, kind, metadata)` which routes events to typed criteria evaluators (count, sum, distinct_count, streak, event_match, timed, plan_active, created_before). Replaces the v1 polling check; engine is fire-and-forget, never throws back to the caller. Legacy `lib/badges.js` is now a thin shim that delegates to the new engine for back-compat with the 5 existing trigger sites.
- **Full read API.** `GET /api/achievements` (catalog), `GET /api/achievements/stats` (own level/xp), `GET /api/achievements/users/:username` (user gallery, block-aware), `GET /api/achievements/users/:username/pinned` (compact strip), `GET /api/achievements/:slug` (detail page with global stats + recent unlockers). All public endpoints use optionalAuth.
- **Pin / unpin / privacy writes.** `POST /api/achievements/pin`, `DELETE /api/achievements/pin/:slug` (max-6 enforced server-side), `PATCH /api/achievements/visibility` (toggles `achievementsHidden` flag). All require auth + originAllowlist + writeLimiter.
- **Profile integration.** `UserProfilePage` Achievements tab rebuilt with the new `AchievementGallery` (filter chips per category, sort dropdown, full locked + unlocked + secret rendering, owner pin controls). New `PinnedBadgesCard` shows the user's pinned-6 strip on the Overview tab for both own and other profiles.
- **Dedicated `/achievements` and `/achievements/:slug` routes.** Full-page own gallery and a public detail page (badge art, criteria, holderCount + percent of users, top-10 most-recent unlockers with block-filter, pin/unpin CTA when held).
- **Unlock celebration modal** mounted globally at the App root. Driven by `?celebrate=:slug` query param; localStorage tracks already-celebrated slugs to suppress duplicates. Hexagon scale-in animation respects `prefers-reduced-motion`.
- **Schema migration `20260501000001_achievements_v2`.** Additive only (`IF NOT EXISTS`-guarded). Extends `Badge` with xp / isSecret / displayOrder / iconSlug / criteria / updatedAt; extends `UserBadge` with pinned / pinOrder / sharedAt; adds `AchievementEvent` (per-event log for time-windowed criteria) and `UserAchievementStats` (denormalized XP cache). Two new indexes on Badge, one on UserBadge.
- **Trigger sites wired across the product.** `sheets.create.controller` now emits `sheet.publish` with `{hour, courseId}` so early-bird / night-owl / multi-course criteria match. New `note.create`, `group.create`, `group.join`, `ai.message` triggers in their respective controllers. Existing 5 trigger sites continue to work via the back-compat shim.
- **Seed updates.** `seedBetaUsers.js` now seeds the full 54-badge catalog and unlocks ~15 badges (including 3 secrets, 6 pinned) on `beta_student1` so a fresh `npm run seed:beta` produces a usable demo state per CLAUDE.md §11.

### Static-headers test path-anchored

- **`staticHeaders.test.js` now resolves its file paths from `import.meta.url` instead of `process.cwd()`** so the test passes regardless of where vitest is launched from (root, workspace dir, monorepo runner). Renamed from `.ts` to `.js` to match the JavaScript-only language policy adopted on 2026-04-30.

### Pre-deploy hardening pass (post-screenshot bug review)

- **HTML preview iframe blank-page bug fixed.** When `FRONTEND_URL` env was missing in production, `allowedOrigins` collapsed to `['https://localhost']` and `frame-ancestors` blocked the real `getstudyhub.org` parent. Added `PROD_FRONTEND_FALLBACKS = ['https://getstudyhub.org', 'https://www.getstudyhub.org']` so the frame-ancestors directive always permits the canonical production frontends. Also: Tier 0 safe preview now sets the CSP header explicitly instead of relying on the global preview-surface middleware, so a future route-ordering change can't reintroduce the same blank-iframe failure mode.
- **`resolvePreviewOrigin` Host fallback hardened.** When no `HTML_PREVIEW_ORIGIN` is configured and the Host header doesn't match the trusted preview allowlist, the fallback now uses `https://api.getstudyhub.org` in production instead of `localhost:4000`.
- **Notifications routes use the strict write-rate limiter and the `sendError` envelope.** `PATCH /read-all`, `PATCH /:id/read`, `DELETE /read`, `DELETE /:id` now hit `writeLimiter` (60/min) instead of `readLimiter` (200/min), and every error response carries an `ERROR_CODES.*` code so the frontend can branch consistently.
- **6 latent bugs caught by post-pass review:**
  - `useSocket` cleanup now removes manager-level listeners and nulls `socketRef` so duplicate listeners can't accumulate across login cycles.
  - `NotificationsPage` shows a staleness banner when a refresh fails on a non-empty inbox, instead of silently displaying cached data.
  - `NavbarNotifications.refreshNotifications` guards against missing `startTransition` so a future direct invocation can't crash with a TypeError.
  - `creatorAudit.acceptConsent` idempotent re-POST no longer crashes when `acceptedAt` is null on a backfilled row.
  - `notify._maybeSendNotificationEmail` now falls back to `type` for the dedup key when none is provided, closing the email-spam path for social events (`star`, `fork`, `follow`).
  - `getForkLineageIds` BFS now hard-stops at `MAX_VISITED` inside the inner loop so a wide fork tree can't blow past 500 IDs and trip PostgreSQL's bind-parameter limit on the resulting `notIn:` query.
- **Modal backdrop guard.** `CreatorAuditConsentModal` no longer dismisses on backdrop click when an error banner is visible — the user has to use the Cancel button so they don't lose the error context.
- **`UploadSheetPage` consent-gate stability.** `handleGatedSubmit` destructures stable primitives from the `useCreatorConsent` hook return rather than capturing the whole `consent` object, eliminating the per-keystroke nav-action re-render.
- **Backfill script logs progress every 100 users** so an operator running it on a large production user table sees the script is alive.

### Creator Audit promotion + gap closures + version bump

- **Public README now points to the canonical `.org` domain.** GitHub-facing resources now use `https://www.getstudyhub.org`, with `.net` documented only as the backup domain.
- **HTML sheet previews render on the `.org` production frontend again.** The static frontend CSP now allows preview iframes from `https://api.getstudyhub.org` and the future `https://sheets.getstudyhub.org` isolated preview host instead of only Railway's raw `*.up.railway.app` host.
- **Creator Audit flag promoted to SHIPPED.** `design_v2_creator_audit` is now in `SHIPPED_DESIGN_V2_FLAGS`. Prod deploy order is documented in code: deploy → `prisma migrate deploy` → `backfill:creator-consent --prod-confirm` → `seed:flags`. Skipping the backfill step shows the consent modal to existing users on next publish — disruptive, not destructive, and recoverable by running the backfill afterward.
- **CreatorAuditConsent gets soft-delete + provenance.** New migration `20260430000001_add_consent_provenance_and_soft_delete` adds `acceptanceMethod` (`'user'` / `'backfill'` / `'seed'`) and `revokedAt` columns. Revocation now soft-deletes (preserves the audit trail), and the controller treats a revoked row as "not accepted" while still allowing seamless re-acceptance.
- **Notification fan-out dedup keyed on (recipient, type, actor, sheet).** A user starring 50 different sheets by the same author still produces 50 notifications; the same user starring the same sheet twice in an hour produces one. Critical types (mention, reply, contribution, moderation) are never deduped.
- **EU IP-detection is fail-closed.** When a request reaches the backend without a trusted geo header (Cloudflare or Vercel) in production, `persistedIp` now hashes the IP rather than storing plaintext — protects against direct-to-Railway requests, edge changes, and header spoofing without the right country code.
- **Backfill script gets a `--prod-confirm` guard.** Running `backfill:creator-consent` against a production-shaped `DATABASE_URL` without the explicit flag now refuses, preventing accidental writes when a developer has the wrong env exported.
- **Versions bumped to 2.2.0** across `backend/package.json`, `frontend/studyhub-app/package.json`, the in-app About page Roadmap section, and CLAUDE.md auth note. AboutPage replaces V2.0.0 with V2.2.0 + the new "what's shipped since V2.0.0" features.
- **ROADMAP.md** refreshed with the V2.2.0 feature summary, V2.5 next-up (browser push, notification grouping, cloud import, Creator Audit follow-ups), and V3.0 future (Scholar tier).
- **PUBLIC-LAUNCH-PLAN.md** added at the repo root with the actual current state of the codebase (LICENSE/CONTRIBUTING/CODE_OF_CONDUCT/SECURITY/PRIVACY all already present, TypeScript wired, OWASP headers in place) so the next session doesn't redo work.
- **payments.test.js** assertion updated from `aiMessagesPerDay: 10` to `30` (with `aiMessagesPerDayVerified: 60`) — the test was drifting behind the pricing-page change shipped earlier in the cycle. **Backend test suite now: 1985/1985 passing.**
- **RUNBOOK_SWEEPERS.md** added to `docs/internal/security/` documenting how to enable orphan-video and inactive-session sweepers via Railway Cron (not always-on, to avoid thundering herd across replicas).
- **Master plan §4.2 refreshed** to document that Phase 1 actually shipped against `FeedPage.jsx` + `UserProfilePage.jsx`, not the deleted `DashboardPage.jsx` referenced in earlier drafts.
- **AI streaming + HTML preview origin hardening.** Hub AI now streams safe redacted deltas again, and preview URLs reject untrusted Host-header fallbacks unless `HTML_PREVIEW_ORIGIN` is configured.
- **Review follow-ups for Creator Audit, notifications, and multi-school profiles.** Creator Consent requests now send auth headers correctly, socket notification pushes include actor data immediately, notification fan-out dedup has a matching DB index, and `/api/users/me` chooses stable sorted school fields for dual-enrolled users.

## v2.0.0-beta — in progress

### Public-launch prep + TypeScript adoption + Creator Audit ship

- **Plagiarism on legitimate forks is fixed.** A user forking a sheet and making a small edit no longer trips the plagiarism notification. A shared `getForkLineageIds` helper walks the entire fork tree (ancestors + descendants + siblings) and excludes those IDs from every similarity scan path (`findSimilarSheets`, `findSimilarContent`, the deep AI scan). The notification copy is also softer: instead of "your sheet may contain plagiarism," users now get an actionable "review the report — if this is intentional reuse, add a citation or fork the original."
- **Notifications now push in real time.** A new `notification:new` Socket.io event is emitted from `notify.js` when a notification is persisted, and `NavbarNotifications` listens on the user's personal socket room so the bell updates without waiting for the 30s polling cycle. Polling stays as a fallback. Notification rows now render a type-coloured icon (light/dark token-driven) instead of a flat plus-mark, and a new full-screen `/notifications` page adds filter chips (Social, Content, Groups, System) and bulk actions.
- **TypeScript is now the project language going forward.** Both workspaces have `tsconfig.json` with `allowJs: true`, a `typecheck` script, and the `shared/types/` directory holds API request/response shapes for cross-workspace import. `CLAUDE.md` §13 documents the conventions: all new files are `.ts`/`.tsx`, no new `.js`/`.jsx`, never `any`, explicit return types on exports. Existing JavaScript continues to work; migration is incremental.
- **Creator Audit is shipped.** The backend foundation already merged in a prior cycle; this cycle adds the frontend consent modal (`CreatorAuditConsentModal` + `useCreatorConsent`), wires it into `UploadSheetPage` so publish is gated behind consent when the flag is on, seeds beta-user consent rows so `seed:beta` produces a usable local state, adds a `backfill:creator-consent` script for production migration, and promotes `design_v2_creator_audit` from in-flight to shipped in `seedFeatureFlags.js`.
- **Security gap closures.** `FIELD_ENCRYPTION_KEY` is now hard-required at production startup (a missing key would previously have caused PII columns to silently store plaintext). A new `ssrfGuard.js` allowlist + private-IP block is in place ahead of Scholar tier and Hub AI v2 citation fetching (decision #15). Frontend `.env.example` now documents every `VITE_*` variable used in the codebase. New public `PRIVACY.md` at the repo root.
- **Quality-control sweep.** Explicit `requireAuth` on the feed `POST /posts/:id/react` route closes the inheritance gap flagged by code review.

### Dependency changes

- **Added** `typescript@~5.6.3`, `@types/node`, `@types/express`, `@types/cors`, `@types/jsonwebtoken`, `@types/multer`, `@types/sanitize-html`, `@types/compression`, `@types/bcryptjs` (backend `devDependencies`); `typescript@~5.6.3`, `@types/react@~19.2.0`, `@types/react-dom@~19.2.0` (frontend `devDependencies`). Reason: project-wide TypeScript adoption per the public-launch plan; founder-approved 2026-04-30. No existing dep solves the need (we cannot statically check JavaScript without a TypeScript compiler). Rollback plan: remove devDependencies and the two `tsconfig.json` files; nothing in production runtime depends on them.

### Subscription-tier alignment fixes (post-merge audit pass)

- **Video duration cap was flat 10 minutes for every plan**, contradicting the pricing page's Free=30/Donor=45/Pro=60-minute claims. `VIDEO_DURATION_LIMITS` and `VIDEO_SIZE_LIMITS` in `backend/src/modules/video/video.constants.js` now derive from the canonical `PLANS` spec in `payments.constants.js` so the two files can't drift again. Admin uploads (used for announcements) keep a separate 90-minute cap. Test pin added so a future regression that re-flattens the durations fails CI.
- **Pricing page now matches the actual AI quotas** — Free tier reads "30 AI messages per day (60 once you verify your email)" instead of "10 AI messages per day". Backend `DAILY_LIMITS` (default=30, verified=60) was already enforcing the higher numbers; this aligns the UI claim with reality and surfaces the email-verification perk as a sales lever. `payments.constants.js:PLANS.free` records both `aiMessagesPerDay: 30` and `aiMessagesPerDayVerified: 60` for documentation parity.
- **TestTakerPage hardcoded slate hex colors** (background / borders / heading / muted / link) are now `var(--sh-*)` tokens so the "planned for v2" holding page themes correctly in dark mode.

### Expanded security hardening sweep

- **A deeper 10-loop security sweep closed privacy, upload, HTML, socket, and enrollment edge cases.** Hub AI now redacts PII before and after model calls, socket leave events only broadcast for rooms the caller actually joined, multi-school users keep their full enrollment set in `/api/users/me`, video uploads honor the tiered plan caps from `PLANS`, uploads validate magic bytes instead of MIME alone, direct HTML sheet create/update paths persist risk-tier scans and quarantine Tier 3 content, and note HTML word counts now use inert parsing instead of an `innerHTML` sink.

### Creator Audit backend foundation

- **Creator Audit now has backend audit primitives behind a fail-closed in-flight flag.** Added consent storage, audit-grade columns, five audit checks, owner-checked `/api/creator-audit` endpoints, centralized rate limits, and regression tests for PII redaction, ReDoS resistance, malformed asset URLs, report caps, consent privacy, and route auth/CSRF behavior.

### Profile media + HTML preview hotfix

- **Profile photos, cover images, school logos, and HTML sheet previews no longer break from mixed-origin URLs.** Shared image URL normalization now prefixes slash-relative paths through the API origin, rejects unsafe image sources, upgrades public `http:` images to `https:`, and the sheet preview origin now honors forwarded HTTPS headers so sandbox iframes do not get mixed-content blocked in production.
- **Editor uploads and moderation attachment previews now use the same safe media URL rules.** Uploaded editor images go through shared URL normalization, and moderation previews recover image/PDF attachments from MIME types while keeping PDF iframes restricted to backend-relative URLs.
- **Creator Audit persistence and consent metadata are hardened.** Audit reports no longer save onto content that changed mid-run, consent IP/user-agent metadata is validated before persistence, accessibility parsing is bounded, and truncated reports now keep severity counts.
- **Creator Audit schema indexing was cleaned up.** The consent table now relies on its existing unique `userId` index without creating a duplicate non-unique index.
- **Roles v2 feature flags now fail closed.** Missing rows, network errors, malformed responses, and non-200 flag responses keep Roles v2 surfaces disabled unless the backend returns `enabled: true`.
- **GIF search no longer ships a hardcoded Tenor key.** Tenor is now configured through `VITE_TENOR_API_KEY` / runtime config, and the GIF picker stays disabled without making external requests when no key is configured.

### Review follow-ups (round 3)

- **Cookie consent banner no longer silently dismisses on storage failure.** Codex + Copilot flagged that Safari Private mode (and other no-localStorage contexts) caused `writeConsent` to return null, but the click handler still set `dismissed=true` — analytics never loaded and the user couldn't retry. Banner now keeps itself visible on persistence failure, renders an inline `role="alert"` warning with a "Dismiss anyway" escape hatch, and fires a non-persistent `studyhub:consent-changed` event (with `persisted: false`) so this-session analytics still load at the user's request. Two new component tests pin the failure-path behavior using a mocked `Storage.prototype.setItem`.
- **`CourseSelect` resolvedValue can no longer be undefined.** Sourcery flagged that `value ?? (allowEmpty ? emptyValue : '')` becomes undefined when a consumer passes `value=undefined` AND `emptyValue=undefined` AND `allowEmpty=true` — flipping the `<select>` from controlled to uncontrolled. Trailing `?? ''` guard added.
- **`handleSignOut` declaration hoisted above `renderTab`** in `SettingsPage.jsx`. Previous textual order (declaration AFTER the function that closes over it) was a closure-resolves-at-call-time accident that worked but would break if `renderTab` got refactored to an inline arrow or IIFE. Sourcery flagged the textual TDZ; defensive hoist is the right move.
- **Release log Sign-out capitalization** standardized to match the actual UI label ("Sign out").

### Self-hosted cookie consent banner (Task #70 — Option A locked)

- **Termly resource-blocker replaced with a self-hosted React banner.** Termly's third-party cookies were being aggressively stripped by Chrome incognito / Brave / Safari / Firefox-strict, so the consent prompt re-appeared on every page load and the user's choice never persisted. The new flow lives entirely in our origin: `lib/cookieConsent.js` (read/write + `studyhub:consent-changed` event), `components/CookieConsentBanner.jsx` (bottom-anchored non-modal bar, mounted once at the app root, native shell short-circuits via `window.__SH_NATIVE__`), and a two-phase loader in `index.html` (in-session event listener + returning-visitor immediate-fire).
- **Microsoft Clarity + Google Ads only fire after explicit "Accept all"** per the founder-locked Option A. Idempotent loader so duplicate consent events can't double-load. Essential-only consent persists the choice without firing analytics.
- **`*.termly.io` stays in the CSP** because the legal-document embed (Terms / Privacy / Cookie Policy) still loads from app.termly.io. Documented inline in `_headers`.
- **5 Playwright specs updated** to pre-seed `studyhub.cookieConsent = essential` via `addInitScript` so the new banner short-circuits in tests (route aborts kept as defense in depth).
- **12 new tests:** 7 component (first-visit render / repeat-visit suppression for both choices / Accept-all + dispatched event / Essential-only / Cookie-settings link to /cookies / native-shell skip), 5 helper (read null on empty / read parsed value / read null on malformed JSON / write all + event / hasAnalyticsConsent gate). Plus a defensive bonus test rejecting unknown choice strings.

### Hub AI prompt hand-off — Copilot R2 follow-ups

- **AiPage now resets ChatArea via a `key` prop when a new `?prompt=` arrives.** Replaces the previous in-component setState-during-render dance with React's documented "reset state via key" pattern. Eliminates the focus-effect-leak case where a user-typed message could have its caret moved when a new prompt was consumed-but-not-applied.
- **Strip-effect deps simplified** to `[promptParam, setSearchParams]` using the functional `setSearchParams(prev => …)` form — drops the redundant `searchParams` dep so the effect only re-runs when the prompt itself changes.
- **CourseSelect's `emptyValue` contract honored.** Previous `value ?? ''` shortcut broke when a consumer set `emptyValue="__none__"` (etc.) — the select had no matching option and rendered a phantom selection. Now falls back to `emptyValue` when value is undefined and the placeholder is enabled. Test updated + new test pinning the undefined-value-with-custom-emptyValue branch.

### Settings page polish (S1 from the bug-sweep handoff)

- **Sign out moved out of the top header into the Account tab.** The button was wedged next to the Search bar in the navbar — visually it read as a search peer, not a destructive nav action. Now lives as a dedicated "Sign out" SectionCard right above Danger Zone, with a right-aligned secondary button.
- **Settings card sections breathe.** Bumped `SectionCard` `marginBottom` 18→24 and `<h3>` `marginBottom` 6→12 so the right-panel spacing doesn't read as cramped between Email Address / Sign out / Danger Zone.
- **"Change role" + "Revert to" + "Save Privacy Preferences" buttons are right-aligned now.** All three were rendering as full-width inside their cards; wrapping in `flex justify-content: flex-end` puts them at the card edge as natural-width buttons.

### Avatar / AI hand-off / metadata-toast / dropdown-sizing fixes

- **Six surfaces silently rendered the wrong avatar.** `UserAvatar` only accepted `username` + `avatarUrl` as separate props, but six call sites (admin Analytics, admin Reviews, NoteCommentSection x2, NoteViewerPage, PlagiarismReportPage) all passed `user={...}`. The shortcut prop was being ignored, so every comment / row in those surfaces fell back to the `?` initials placeholder. Extended `UserAvatar` to accept a `user` shortcut (destructured internally with explicit-prop precedence) — all six surfaces start showing real avatars without touching call sites.
- **AI Suggestion card "Start Practice" CTA was a dead-end.** The `open_chat` action navigated to `/ai` with no context, so the user landed on an empty Hub AI chat and lost the suggestion text. The CTA now forwards the suggestion text as `?prompt=` (URL-encoded, capped at 1000 chars); `AiPage` reads it via lazy-init on the `ChatArea` input so the textarea is pre-filled and focused with the caret at the end. The query param is stripped from the URL after read so refresh doesn't re-prefill.
- **"Failed to update note settings" toast now surfaces the server error.** The catch block silently dropped the server's error message, so users saw a generic toast for everything from CSRF failures to course-enrollment 403s. Now reads `errBody.error` and includes it in the toast (`Failed to update note settings: <message>`).
- **"No course" dropdown on the notes editor was unreadable.** 6×10px padding + no min-width left the placeholder rendering as a tiny pill. Bumped padding to 8×14, set min/max width 160/240, fontSize 13, fontWeight 600, and shifted color from `--sh-muted` to `--sh-heading` so the selected course code is legible.

### Selected-chip CSS fix + register role picker

- **`.sh-chip--active` was silently broken everywhere.** A duplicate `.sh-chip` baseline block in `styles/motion.css` (loaded after `index.css`) overrode the active rule's background at equal specificity, so every chip in the app — sheets filters, feed filters, the register "I am a..." picker — was applying the active class but rendering with the inactive background. Removed the duplicate; bumped the active selector to `.sh-chip.sh-chip--active` so any future source-order accident can't reproduce the bug.
- **Register role picker has unmistakable selected feedback now.** New `.sh-chip--role-pick` modifier paints the selected role with solid brand fill + white text + a brief 220ms scale-bounce. Reduced-motion users get only the color change. Added `role="radiogroup"` / `role="radio"` / `aria-checked` so screen readers announce selection correctly.
- **Homepage link audit.** Verified all 10 homepage CTA / footer links (`/register`, `/sheets`, `/supporters`, `/pricing`, `/about`, `/docs`, `/terms`, `/privacy`, `/cookies`, `/guidelines`) resolve to mounted routes — no broken targets.

### Study group uploads + reviewer follow-ups (round 2)

- **Group banner / discussion / resource uploads no longer 403.** `uploadGroupMedia` was a raw XHR that bypassed the `window.fetch` shim that auto-injects `X-CSRF-Token`, so file POSTs hit the server with no CSRF header and got rejected. Helper now resolves the cached CSRF token (bootstrapping via `/api/auth/me` if absent), sets `X-Requested-With`, and on Capacitor adds `X-Client: mobile` + `Authorization: Bearer <native>`. Repairs **all** study-group uploads, not just backgrounds.
- **`/uploads/group-media` and `/uploads/note-images` now have static handlers.** Files were being uploaded successfully but the served URLs would 404 in the browser because no `express.static` mount existed at those paths. Added with `nosniff`, `Cache-Control`, and `default-src 'none'; img-src 'self'` CSP per the existing avatar/cover pattern.
- **Background picker UX expanded.** Drag-and-drop onto the preview pane, client-side image-mime + 10 MB size validation (fast friendly errors before the upload fires), confirm-on-clear when there's a saved background, inline upload progress bar, and quota-aware copy on 429. Char counter on the attribution field.
- **Late-response race fixed in `persistMetadataChange`.** Switching notes mid-PATCH no longer leaks the original note's revert (or success-side `setEditorAllowDownloads`) into the newly-selected note's editor state. Gated the editor-level side effects on an `activeNoteIdRef` check; list-row patches stay keyed by id.
- **Sandbox regression test now asserts safe-preview is exactly `allow-same-origin`.** Earlier version accepted any string containing the token, which would have allowed silent privilege widening (`allow-same-origin allow-popups`, etc.). Captures the safe-branch literal and asserts equality.
- **Course dropdown helper migration completed for study-groups list.** `useGroupList.js` was still doing the naive flatMap the shared helper was meant to replace, producing visible course-code duplicates for multi-enrolled users. Migrated to `flattenSchoolsToCourses` and extended the helper to expose `schoolId`/`schoolShort` (additive — required by `GroupListFilters` school filter).
- **PATCH /api/notes/:id/metadata test coverage added.** 17 tests covering id validation, field-type validation, owner-only auth + admin override, private→allowDownloads server-side normalization, individual field persistence, and course-enrollment 403 (with admin bypass).

### Reviewer follow-ups (Copilot + security pass)

- **Sheet viewer iframe also got the cross-subdomain fix.** `SheetContentPanel.jsx` had the same `sandbox=''` bug in its safe-preview branch as the standalone preview page; both now grant `allow-same-origin` only on the script-stripped path so production Chrome no longer renders the embedded sheet as `(blocked:origin)`.
- **Sandbox regression test now asserts the safe-preview branch HAS allow-same-origin** (and is parameterized over both iframe-bearing files), so a future revert to an empty sandbox attribute fails CI instead of silently shipping the placeholder bug again.
- **Rollback path in notes-metadata persist no longer corrupts courseId.** A security scan caught a tautological `!value === false ? !value : !value` (always `!value`) in the optimistic-update revert that flipped numeric `courseId` rows into booleans on save failure. Now snapshots the prior list-row value before the optimistic patch and restores it verbatim.
- Reworded a stale "screenshot 1" comment in `SheetHtmlPreviewPage.jsx` to describe the Chrome behavior directly.

### Notes metadata persistence

- **Private/Shared toggle, course picker, and Downloads checkbox now actually save.** New `PATCH /api/notes/:id/metadata` endpoint (parallels `/star`/`/pin`/`/tags`) accepts `{private, courseId, allowDownloads}` with owner-only auth and an enrollment check on `courseId`. Frontend handlers in `useNotesData` now optimistically apply the change, hit the endpoint, sync the sidebar list row, and revert on failure with a toast. Lives outside the hardened content-save path so toggling Private doesn't trigger a version snapshot or get suppressed by content-hash no-op detection.

### Course dropdown dedup

- **Course pickers no longer show duplicate course codes.** The `/api/courses/schools` response groups courses by school; if a user is enrolled at multiple schools that share a code (CHEM101 / BIOL101 / etc.), the naive flatMap in five different pages produced visible duplicates. New shared `lib/courses.js` helper dedupes by course id and disambiguates collisions by appending the school name. Applied to Notes, Sheet Upload, and AI Sheet Setup pages.

### Reviewer follow-ups (Sourcery + Codex)

- **SSE compression bypass actually works.** Filter now gates on URL path (`/api/ai/messages`) instead of `Content-Type`, since the response Content-Type isn't set yet when `compression()` evaluates its filter on first write.
- **`?fresh=1` no longer overwrites the previously-open draft.** The fresh-draft branch now resets `draftId`, title, course, description, attachment, and `saved` flag so the first autosave creates a new StudySheet row instead of patching the prior one.
- **My-drafts switch flushes pending edits.** `DraftsPickerModal` accepts an `onBeforeNavigate` callback wired to `saveDraftNow`; without it the unsaved-changes blocker (pathname-only diff) didn't catch query-string-only navigations between drafts.

### Hub AI, drafts, preview, notes, video

- **Hub AI streaming no longer feels frozen.** Skipped gzip compression for `text/event-stream` responses and added `flushHeaders()` + per-delta `res.flush()` so the bubble shows tokens as they arrive instead of buffering for 5–20 s.
- **Hub AI Stop button now actually stops the stream.** `aiService.sendMessage` returns a real `AbortController`; `stopStreaming` aborts the fetch, which trips `req.on('close')` on the backend and aborts Claude immediately.
- **Sheet preview no longer shows "This content is blocked".** Safe-preview iframe stops emitting `sandbox=""` (which Chrome rendered as a hard block) and CSP-protected previews now allow https/http URLs in href/src/srcset.
- **AI sheet reviewer is less trigger-happy.** Reworded reviewer system prompt + narrowed the scanner's keylogging detector so practice tests using `localStorage` for progress + `addEventListener('keydown', …)` for shortcuts no longer auto-escalate to Tier 2.
- **Multiple sheet drafts.** New `GET /api/sheets/drafts` + `DELETE /api/sheets/drafts/:id` and a "My drafts" picker modal in the upload page; `?fresh=1` opens a clean editor without overwriting an existing draft.
- **My Notes sidebar/search/title now stay in sync.** Introduced a single `noteHtml.js` helper consumed by `NotesList`, `useNotesData`, and `NoteEditor` so HTML-stripping rules can no longer drift between the three surfaces.
- **Video pipeline hardening.** Added `BLOCKED` to `VIDEO_STATUS` constants, replaced string literals in feed-post gating, added `writeStream.on('error')` handlers to `processVideo` + `regenerateThumbnailFromFrame`, mapped multer thumbnail upload errors to 4xx, removed the 3-second cap that prevented the editor from picking later frames.
- **Orphan-video sweeper safer + faster.** `sweepStalledProcessing` now requires `feedPosts: { none: {} }`, `announcementMedia: { none: {} }` and folds the pending-appeal check into one query (no more N+1).
- **Operations docs.** Documented `SWEEP_ORPHAN_VIDEOS_ON_START` in `backend/.env.example`.

### CI / infrastructure

- **CI branch coverage hotfix.** StudyHub CI and CodeQL now run for
  `approved-branch` pull requests and pushes in addition to `main`.
- **CI hotfix (Day 2.5).** Pin `github/codeql-action` init + analyze to
  `@v3` to restore CodeQL Advanced runs, and switch the release-log gate
  to track this public file at `docs/release-log.md` instead of the
  gitignored internal log so PRs can satisfy it.
- **Railway preDeploy now provisions SHIPPED design_v2 flags.** Chained
  `npm run seed:flags` between `prisma migrate deploy` and the geoip
  refresh in `backend/railway.toml`. Closes the activation gap where
  fail-closed flag evaluation rendered Phase 1/2/3 features invisible
  in production whenever a deploy preceded the manual seed step. Seed
  failure aborts the deploy by design (no `||` fallback).
- **Boot-time FeatureFlag auto-provisioning.** `backend/scripts/start.js`
  now runs `seedFeatureFlags`, `seedRolesV2Flags`, and
  `seedNotesHardeningFlag` after `prisma migrate deploy` on every Railway
  boot, so shipped features self-activate without an operator running
  `seed:flags` from a Railway shell. Idempotent (upsert-only); a seed
  failure logs loudly but does not block API startup. Gated by
  `SEED_FEATURE_FLAGS_ON_START` (defaults on when Railway env vars are
  detected). `railway.toml` `preDeployCommand` slimmed to just the
  best-effort GeoIP refresh; the two flag-seed scripts that previously
  only had a CLI now also export reusable helpers.
- **CORS hardening — drop `public: true` from CDN-cached endpoints.**
  `/api/courses/schools`, `/api/courses/popular`, `/api/feed/trending`,
  and `/api/platform-stats` no longer mark themselves `public` for
  shared-CDN caching. Cloudflare ignores `Vary: Origin` on non-
  Enterprise plans, so a shared cache could replay one origin's CORS
  headers to every other origin. Browser cache (per-user, honors Vary)
  keeps the same user-perceived speedup. Also drops `/tests` from the
  sidebar hover-prefetch map since that page has no backend route yet.
- **Backend test-isolation fix (Task #56 — backend half).** Removed
  the per-test `vi.resetModules()` + `await import(...)` dance from
  `cacheControl.unit.test.js` (replaced with a single static ESM import;
  `cacheControl.js` has zero module-level state) and hoisted the
  repeated `await import('express')` / `node:path` / `node:fs` /
  `node:os` calls in `security.headers.test.js` to top-of-file ESM
  imports. Both files passed in isolation but flaked under the full
  parallel backend suite on Windows due to the heavy per-test dynamic
  imports timing out worker IO. 29 tests now stable; both files lint-
  clean. Frontend Playwright smoke flakes (auth.smoke, app.responsive,
  feed.preview-and-delete, sheets.html-security-tiers, tracks-1-3,
  tracks-4-6, teach-materials, navigation.regression) are NOT covered
  by this fix — they share the `mockAuthenticatedApp` catch-all
  `**/api/**` → `{ status: 200, json: {} }` pattern in
  `tests/helpers/mockStudyHubApi.js` which crashes any component that
  does `data.slice()` after a truthy guard on an unmocked endpoint
  (same root cause as the FollowSuggestions fix in Phase 2 Day 4). That
  half needs a Playwright run + per-spec mock additions; tracked
  separately.
- **Onboarding step 2 silent-failure fix (Task #65).** Removed dead
  `prisma.enrollment.create({ data: { userId, schoolId } })` call at
  `onboarding.service.js:188` that has been silently throwing on every
  step-2 submission since it was written — `Enrollment` is course-level
  (no `schoolId` column; see `schema.prisma`). Error was caught + logged
  as a warning, so monitoring + tests never surfaced it. School
  membership continues to be derived from enrolled courses; a proper
  `UserSchoolEnrollment` table is Phase R1 / Task #64. 6 new unit tests
  pin the post-fix invariant + the missing/invalid/unknown payload paths.
- **Same-site backend domain — incognito sign-in unblocked (Task #73).**
  Frontend `RAILWAY_BACKEND_URL` swapped from the raw Railway hostname
  (`studyhub-production-c655.up.railway.app`) to the same-site
  subdomain `api.getstudyhub.org` (CNAME → `fl8bi234.up.railway.app`,
  DNS-only, not proxied). The session cookie was previously third-
  party from the frontend's perspective and silently dropped by Chrome
  incognito, Brave, Safari, and Firefox strict mode — blocking sign-in
  entirely for any user with strict privacy settings. Cookies now flow
  as first-party. Single-line change in `frontend/studyhub-app/src/config.js`.
- **Upload + chunked-notes "Invalid request payload" hotfix.** The
  global `inputSanitizer` middleware was rejecting any single string
  field longer than 10 KB with a generic "Invalid request payload"
  error before the route ever ran — silently blocking imported HTML
  sheets, AI-generated sheets, 32 KB note save chunks, and large Hub AI
  prompts. Bumped `MAX_FIELD_LENGTH` to 5 MB to match the body parser
  limit and raised `express.json()` to `{ limit: '5mb' }` (was the
  Express 100 KB default, which would have surfaced as a 413 once the
  field cap was lifted). Null-byte and control-char rejection still
  runs on every string regardless of length.
- **Notes M6 — sidebar refreshes on every autosave.** `useNotesData`
  exposes a new `patchNoteLocally(noteId, partial)` that `NoteEditor`
  calls on each fresh `saved` transition with the latest title,
  content, and `updatedAt`. Previously the sidebar list stayed stale
  until the 60-second background poll, which made autosave look broken
  even though `useNotePersistence` was working. Pinned/starred state
  is preserved through partial patches.
- **Notes M2 — auto-derive title from first heading / first line.**
  When a freshly created "Untitled Note" gets content, the editor now
  pulls a title candidate from the first `<h1>` (then `<h2>`, then the
  first sentence of plain text), capped at 80 chars. A
  `titleManuallyEditedRef` flag stops auto-derive the moment the user
  edits the title input. Behavior matches Google Docs / Notion's "use
  the first line" convention.
- **Notes M4 — title input polish.** Larger 20px font, friendlier
  "Add a title — or just start writing" placeholder, focus-only
  bottom border, and autofocus on freshly opened untitled notes (not
  on phone, to avoid an unwanted keyboard pop).
- **Video pipeline V1 — feed gating, R2 cleanup, orphan sweep,
  thumbnail editor.** Five fixes in one cycle:
  1. Backend `POST /api/feed-posts` with `videoId` now returns 409 if
     the video is still `processing`/`failed`/`blocked`, with a
     specific message for each — composer surfaces the right copy
     instead of dropping a broken card into followers' feeds.
  2. `video.service.processVideo` now calls `deleteVideoAssetRefs`
     whenever a video transitions to FAILED (duration cap or
     pipeline error). Previously the raw upload + any partial
     variants stayed in R2 forever, bleeding storage cost on every
     failed upload.
  3. `video.routes.js` chunk-buffer sweep was destructively wiping
     ALL in-flight uploads when 100+ buffers existed. Replaced with
     per-buffer `lastTouched` TTL eviction every 5 min — only idle
     > 30 min buffers are evicted, active uploads are never
     > interrupted.
  4. New `scripts/sweepOrphanVideos.js` — reclaims R2 bytes from
     stalled processing (>6h in `processing`/`failed`/`blocked`,
     skipping rows with a pending `VideoAppeal`) and ready-but-never-
     attached uploads (>24h with no FeedPost or AnnouncementMedia).
     Logs MB freed per run. Wired into `scripts/start.js` behind
     `SWEEP_ORPHAN_VIDEOS_ON_START` (off by default — flip on
     exactly one Railway worker), runs on boot then every 6h. Also
     exposed as `npm --prefix backend run sweep:orphan-videos` for
     manual one-off runs.
  5. New `PATCH /api/video/:id/thumbnail` — owner can pick a frame
     timestamp (re-runs ffmpeg server-side) or upload a custom JPG/
     PNG (≤2 MB, magic-byte validated, rate-limited 15/min). Same
     R2 key is overwritten so existing public URLs stay valid; client
     gets a `?v=<timestamp>` cache-buster so the new image renders
     immediately. New `VideoThumbnailEditor.jsx` modal + entry-point
     button in `VideoUploader.jsx` post-processing state. Also
     surfaces three quick-pick frames (start / middle / end) and a
     full scrubber via the existing stream URL.
  6. FeedComposer Post button is now state-aware: gray "Waiting for
     video…" while processing, red "Remove video to post" on failure,
     green "Post video ✓" when ready. Backend 409 still enforces; the
     button is the fast-feedback layer.
- **Phase R1 — `UserSchoolEnrollment` additive schema (Task #11/#64).**
  New table + Prisma model + relations on `User.schoolEnrollments` and
  `School.enrollments` to give school membership its own first-class
  row. Today school membership is inferred from
  `Enrollment -> Course -> School`, which can't represent dual-enrolled
  or self-learner users. This deploy is additive only — no backfill,
  no read cutover. R2 backfills, R3 switches reads. Migration
  `20260428000004_add_user_school_enrollment` is `IF NOT EXISTS`-guarded
  and safe to redeploy. Full backend test suite green (1869 pass / 1
  skip / 118 files).
- **Defensive Playwright catch-all + widget mocks (Task #56 second
  half).** `tests/helpers/mockStudyHubApi.js` catch-all now returns
  `[]` for collection-shaped GET paths (`/popular`, `/trending`,
  `/recent`, `/leaderboard`, `/me/courses`, etc.) and `{}` for single-
  resource paths, so components doing `data.X.slice()` after a truthy
  guard no longer crash on unmocked endpoints — same root cause as
  the Phase 2 Day 4 FollowSuggestions fix. Added explicit mocks for
  `/api/users/me/follow-suggestions`, `/api/exams/upcoming`,
  `/api/ai/suggestions`, `/api/feed/trending`, `/api/announcements`,
  `/api/study-groups`, `/api/messages/conversations`,
  `/api/library/popular`, and `/api/platform-stats` so the Phase 1/2/3
  v2 widgets that load on every authenticated page don't trip the
  smoke specs that exercise navigation regression / app responsive /
  feed preview / sheets html security tiers / tracks-1-3 / tracks-4-6
  / teach-materials / auth.smoke.

### Sheets

- **`StudySheet.previewText` column + extractor + backfill (#267).**
  Sheet create/update now persists a server-extracted plain-text preview
  (≤240 chars, emoji-safe truncation). Existing rows are populated by
  `npm --prefix backend run backfill:previewText`. Powers the Sheets
  Grid card preview without re-rendering sanitized HTML on the client.
- **`SheetContribution.reviewComment` migration (#267).** Idempotent
  `ADD COLUMN IF NOT EXISTS` migration to heal production schema drift
  that was causing reviewer-comment writes to fail.
- **Sheet Lab history deep-linking (#267).** History tab now reads
  `?tab=history&commit=<id>` and expands the matching commit on load,
  and the commit toggle keeps the URL in sync so links can be shared.
- **`previewText` consistency hotfix (Task #72).** Centralized sheet
  content writes through a new `withPreviewText(content)` helper at
  `backend/src/lib/sheets/applyContentUpdate.js`. Threaded it through
  contribution-merge accept (`sheets.contributions.controller`),
  Sheet Lab sync-upstream + restore-to-commit (`sheetLab.operations
.controller`), and fork creation (`sheets.fork.controller`). Before
  this fix, those four write paths overwrote `StudySheet.content`
  without re-extracting `previewText`, so the Sheets Grid card
  preview went stale after a contribution merged or a Lab restore
  ran. 10 new unit tests pin the helper contract.

### Phase 4 — Sheets browse refresh (2026-04-27)

- Sheets page now offers a Grid/List view toggle (List default; choice
  persists in localStorage; URL `?view=grid` or `?view=list` overrides).
- New "Search across StudyHub" toggle on Sheets bypasses the school filter
  for cross-school discovery.
- Filter pills now show an active selected state when applied.
- Sheet cards in Grid view show a 3-line preview extracted from the sheet
  body (new `previewText` column, backfilled for existing sheets).
- Behind `design_v2_sheets_grid` feature flag (now SHIPPED in production).

### Phase 3 — Inline Hub AI suggestion card (2026-04-28)

- New `AiSuggestion` model with daily quota shared with Hub AI's
  `AiUsageLog`. Three endpoints under `/api/ai/suggestions`
  (`GET /`, `POST /refresh`, `POST /:id/dismiss`).
- Frontend `AiSuggestionCard` mounted on the own-profile Overview tab
  below the Phase 2 Upcoming Exams card. 5-state matrix (loading /
  happy / empty / quota_exhausted / error). Refresh disables itself
  after a 429; dismiss is optimistic with reconciliation on 5xx.
- Email + phone PII redacted from both the AI input and the AI output
  before persistence.
- Gated behind the `design_v2_ai_card` feature flag.

### Phase 2 Day 4 — Upcoming Exams write-path UI (2026-04-24)

- Author-side create / edit / delete UI for `UpcomingExam` rows on the
  own-profile Overview, fed by the existing `/api/exams` CRUD endpoints
  and the `preparednessPercent` column added in Phase 2.
- Gated behind the `design_v2_upcoming_exams` flag.

### Phase 2 — Upcoming Exams (2026-04-24)

- New `UpcomingExam` schema + migration with `preparednessPercent`
  column. New `/api/exams` CRUD module with full security baseline
  (`requireAuth`, `originAllowlist` on writes, per-endpoint rate
  limiters, owner check on update/delete).
- Component-kit foundation (`Card`, `Button`, `Chip`, `Skeleton`)
  introduced for use across v2 phases.

### Phase 1 — UserProfilePage widgets + AppSidebar refresh (2026-04-23)

- Personal overview widgets on `UserProfilePage` (Overview / Study /
  Sheets / Posts / Achievements tabs) replace the legacy `/dashboard`
  page; `/dashboard` now redirects to `/users/:me`.
- `AppSidebar` v2 chrome refresh: token-driven colors, refined nav
  spacing, and role-label helper for self-learner / student / teacher.

### Phase 0 — Design refresh foundation (2026-04-19 → 2026-04-23)

- Plus Jakarta Sans + warm-paper (`#f6f5f2`) "Campus Lab" identity.
  CSS custom-property tokens (`--sh-*`) become the source of truth for
  colors, spacing, and surfaces.
- Emoji policy locked: emoji are permitted only inside user-generated
  content (feed posts, messages, notes, comments, group discussions,
  profile bios) and never in UI chrome.
- Feature-flag evaluation switched to fail-closed in all environments
  with centralized seeding via `scripts/seedFeatureFlags.js`.

---

## v1.x — pre-v2 highlights

Selected user-visible changes from the v1 line are summarized here for
historical context. Full v1 detail lives in the internal log.

### Messaging & social

- Real-time DM and group chat (`/messages`) with Socket.io, soft delete
  on messages, 15-minute edit window, per-conversation unread counts,
  and a `/messages?dm=<userId>` profile auto-start flow.
- Bidirectional block / one-directional mute system across feed,
  search, and messaging.

### Study Groups

- `/study-groups` with member roles, group resources, scheduled study
  sessions (`GroupSession` + RSVPs), and a Q&A discussion board.

### Hub AI assistant

- Streaming Claude integration
