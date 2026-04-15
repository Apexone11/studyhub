# Scholar Plan (Web + Mobile)

A StudyHub page dedicated to discovering, reading, annotating, and studying peer-reviewed articles and preprints. This doc is the single source of truth for both the web `/scholar` route and its mobile equivalent.

Companion docs:

- `docs/roles-and-permissions-plan.md` — role model Scholar must respect.
- `docs/mobile-app-plan.md` — Android product spec.
- `docs/mobile-security.md` — mobile security posture.
- `docs/mobile-build-plan.md` — Android build waves.
- `CLAUDE.md` — repo-wide conventions.

---

## 1. Vision

StudyHub already helps students share and forge study materials. Scholar extends that mission to primary sources: the peer-reviewed and preprint literature those study materials are built on. A student, teacher, or Self-learner should be able to search, read, annotate, cite, and convert a paper into a StudyHub sheet without leaving the product.

Three design goals shape every decision in this plan:

1. **Bring the paper to the student** — never send them to a publisher site when we can present the content inside a branded reader.
2. **Reuse before rebuild** — lean on Library, Notes, Sheets, AI, Hashtags, Library storage, and Provenance rather than building parallel systems.
3. **Respect open access** — only cache and redistribute content when the source license allows. Paywalled content links out; metadata is always free to cite.

---

## 2. What StudyHub already has we can reuse

From the survey of the repo:

| Existing piece                              | Reuse in Scholar                                                                                               |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `library` module (`BookShelf`, `ShelfBook`) | Source-agnostic saved-paper model. Extend `ShelfBook` with `sourceType`, `doi`, `externalUrl`, `abstractText`. |
| `notes` module                              | Notes attached to a paper via new `paperId` field. Reuse editor, versioning, comments.                         |
| `sheets` creation pipeline                  | AI generates a StudyHub sheet from a paper. Existing HTML scan + publish pipeline handles the output.          |
| `ai` module                                 | Claude-backed summarize / Q&A / sheet generation. Extend `ai.context.js` with a `<paper_context>` block.       |
| `r2Storage.js`                              | Cache OA PDFs under a `scholar-papers/` prefix. Signed URLs for short-lived access.                            |
| `search` module                             | Add `papers` result type. Federated query across academic APIs plus our local cache.                           |
| `provenance.js` pattern                     | Model for `ScholarPaperMetadata` (DOI, arXiv id, authors, journal, license, checksum).                         |
| Hashtag / topic system (planned §7.12)      | Topic routing on Scholar: "Show me NLP papers," "Show me Organic Chemistry preprints."                         |
| Study Groups resources                      | Papers attach as group resources; group-wide shared annotations.                                               |
| Messaging share                             | Papers share into DMs / group chats as rich link cards.                                                        |
| Offline cache (mobile-app-plan §14)         | OA PDFs saved offline respecting 100MB LRU budget.                                                             |
| "Ask AI about this" deep link               | Already threaded through feed, sheet, note, profile. Papers are the next surface.                              |

What we do not have yet and must add:

- PDF.js rendering in the SPA.
- An annotation layer (highlight, margin note, comment).
- An academic-API client on the backend with a fallback chain.
- A `ScholarPaper` cache table and `ScholarPaperMetadata` record.
- A citation exporter (BibTeX, APA, MLA, Chicago, IEEE).

---

## 3. Placement

### 3.1 Web

- New top-level route: `/scholar`.
- Sidebar nav entry: `Scholar` with an icon from the existing `Icons.jsx` set. `IconBook` is the first choice; if conflict with Library, switch Library to `IconShelf` (new, to be drawn in the StudyHub DNA style).
- Global search modal adds a `Papers` tab alongside Sheets, Courses, Users, Notes, Groups.
- Route sub-paths:
  - `/scholar` — search and browse landing.
  - `/scholar/paper/:id` — paper detail + reader.
  - `/scholar/saved` — user's saved papers (backed by shelves).
  - `/scholar/shelf/:id` — individual shelf view.
  - `/scholar/topic/:slug` — papers for a topic hashtag.

### 3.2 Mobile

Scholar is not its own bottom-tab — the four-tab layout is locked (Home, Messages, AI, You). Access points:

- Top-bar search on Home → tapping the `Papers` filter chip enters Scholar search mode.
- You tab → `Saved papers` row in the profile card (same section as `Saved sheets`).
- Deep link `studyhub://scholar/paper/:id` opens the mobile paper viewer directly.
- AI sheet generation flow has a `From a paper` source picker that lands the user in Scholar search and returns with a picked paper.

No new Android app-shortcut in v1. Scholar gets promoted to its own tab only if post-beta usage justifies it.

---

## 4. Data sources

### 4.1 API tiers

Scholar queries a fallback chain; the first source with results wins, and a union of sources can be shown when they complement each other.

| Tier | Source                                          | Scope                                      | Cost                                     | Role                                                                           |
| ---- | ----------------------------------------------- | ------------------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------ |
| 1    | Semantic Scholar Graph API                      | 200M+ papers, citation graph, AI summaries | Free, rate-limited; API key raises quota | Primary search + citation graph.                                               |
| 1    | OpenAlex                                        | 250M+ works, author disambiguation         | Free, no key                             | Primary search fallback + backfill for missing fields.                         |
| 2    | CrossRef REST                                   | 150M+ DOI metadata                         | Free, no key; polite pool with email     | DOI resolution and canonical citation metadata.                                |
| 2    | arXiv API                                       | 2M+ STEM preprints, HTML5 and PDF          | Free, no key                             | Primary source for physics, CS, math, stats preprints. HTML5 render is a gift. |
| 3    | CORE                                            | Open-access full text                      | Free API key                             | Full-text search and OA PDF discovery.                                         |
| 3    | Unpaywall                                       | OA PDF links for given DOI                 | Free with email                          | Promotes paywalled metadata results to readable when an OA copy exists.        |
| 4    | PubMed / PMC E-utilities                        | Biomedical full text                       | Free with email                          | Medicine and life-science papers.                                              |
| 5    | Google Books Volumes API (existing integration) | Books, not papers                          | Free                                     | Books tab on Scholar; preserves our Library Google Books coverage.             |

### 4.2 Routing logic

1. User submits a search query.
2. Backend fans out to tier-1 sources in parallel with a 3-second soft timeout.
3. Results are merged and de-duplicated by DOI (primary key), then by normalized title + first-author hash.
4. For each result that lacks an open-access PDF link, we call Unpaywall with the DOI to upgrade it.
5. Final response carries `resultType: 'paper'` objects with a unified schema (§6.2).
6. Tier-3+ sources are used only when tier-1/2 returned nothing relevant or the query looks domain-specific (e.g., PubMed triggers on keywords like "clinical", "trial", "patient").

### 4.3 Why this ordering

Semantic Scholar + OpenAlex cover ~95% of typical student queries with good abstract text. CrossRef is authoritative for citation metadata when a DOI is known. arXiv is a power source for STEM because it serves HTML5 papers that render beautifully without PDF.js. Unpaywall converts "useless paywalled hit" into "readable OA hit" with zero friction.

---

## 5. Backend architecture

### 5.1 New module

`backend/src/modules/scholar/`:

- `scholar.routes.js` — Express routes mounted at `/api/scholar`.
- `scholar.search.controller.js` — orchestrates the fan-out.
- `scholar.paper.controller.js` — paper detail + cache hydration.
- `scholar.save.controller.js` — save to shelf, remove, list.
- `scholar.annotation.controller.js` — CRUD for annotations.
- `scholar.cite.controller.js` — citation exporter.
- `scholar.sources/` — one adapter file per external API (`semanticScholar.js`, `openAlex.js`, `crossref.js`, `arxiv.js`, `core.js`, `unpaywall.js`, `pubmed.js`). Each exports `search(query, opts)` and `fetch(id)` returning the unified schema.
- `scholar.service.js` — fan-out, merge, dedupe, rate-limit shared between controllers.
- `scholar.constants.js` — tier definitions, field mappings, dedupe rules.

### 5.2 Caching strategy

- **Metadata cache.** `ScholarPaper` table in Postgres. Every paper returned from an API is upserted here keyed by canonical id (DOI preferred). TTL for metadata: 30 days; stale rows refresh on next read. Popular papers (views > threshold) refresh daily via a Railway cron.
- **Abstract and citations cache.** Stored on the same `ScholarPaper` row. Abstracts up to 8KB; citations capped at 200 entries per row.
- **PDF cache.** OA PDFs only. First user to open an OA paper triggers a one-off server-side download to R2 under `scholar-papers/<sha256>.pdf`. Future users served via signed URL. Bucket max per paper: 10MB. Papers larger than that link out.
- **License gate.** Before caching we check CC license metadata. If the license forbids redistribution, we do NOT cache the PDF — we only store metadata and a link-out URL.

### 5.3 Rate limits and costs

- `scholarSearchLimiter` — 60 queries / 5 min per user. Strong limit because search fans out to several APIs.
- `scholarFetchLimiter` — 120 paper-detail fetches / 5 min per user.
- `scholarSaveLimiter` — 30 save operations / 5 min per user.
- `scholarAnnotationLimiter` — 120 writes / 5 min per user.
- Per-source circuit breakers. If an API returns 5xx or rate-limit errors 3 times in a minute, that adapter is disabled for 10 minutes and search proceeds with the remaining tier-1 sources.
- Per-API daily quotas are tracked in Redis (or Postgres if Redis unavailable) so we never blow through Semantic Scholar's free-tier daily cap.
- All API keys live in Railway env vars: `SEMANTIC_SCHOLAR_API_KEY`, `CORE_API_KEY`, `UNPAYWALL_EMAIL`, `PUBMED_EMAIL`. CrossRef, arXiv, OpenAlex do not require keys but we still pass a contact email via the polite-pool header.

### 5.4 Endpoints

- `GET /api/scholar/search?q=&type=&domain=&from=&to=&limit=&cursor=` — unified search.
- `GET /api/scholar/paper/:id` — paper detail by canonical id (DOI, arXiv id, Semantic Scholar paper id).
- `GET /api/scholar/paper/:id/citations` — cited-by list (paginated).
- `GET /api/scholar/paper/:id/references` — references list.
- `GET /api/scholar/paper/:id/pdf` — signed URL to cached OA PDF. 403 if not OA. 404 if not cached yet; triggers the one-off fetch.
- `POST /api/scholar/save` — body `{ paperId, shelfId? }`. Adds to default `Saved papers` shelf if shelfId omitted.
- `DELETE /api/scholar/save/:paperId` — remove.
- `POST /api/scholar/annotations` — create annotation.
- `PATCH /api/scholar/annotations/:id` — update.
- `DELETE /api/scholar/annotations/:id` — delete.
- `GET /api/scholar/annotations?paperId=` — list for current user.
- `POST /api/scholar/cite` — body `{ paperId, style }`. Returns formatted citation string and BibTeX.
- `POST /api/scholar/ai/summarize` — body `{ paperId }`. Calls AI with paper context, streams response. Reuses `/api/ai` rate limits.
- `POST /api/scholar/ai/generate-sheet` — body `{ paperId, prompt? }`. Generates a StudyHub sheet from the paper and publishes to the user's drafts.

### 5.5 CSRF and auth

Every write endpoint follows the existing CSRF origin-check pattern used for payments and messaging. Every read endpoint is auth-gated because Scholar usage counts toward per-user analytics and rate limits.

---

## 6. Data model

### 6.1 New tables (single migration: `<timestamp>_add_scholar_tables`)

- `ScholarPaper`
  - `id String @id` — canonical id (prefers `doi:10.1234/abc`, falls back to `arxiv:2401.12345`, falls back to `ss:<semanticScholarId>`).
  - `title String`
  - `abstract String?`
  - `authorsJson Json` — array of `{ name, authorId?, affiliation? }`.
  - `venue String?` — journal or conference name.
  - `publishedAt DateTime?`
  - `doi String? @unique`
  - `arxivId String?`
  - `semanticScholarId String?`
  - `openAlexId String?`
  - `pubmedId String?`
  - `license String?` — spdx id or free-text.
  - `openAccess Boolean @default(false)`
  - `pdfCachedKey String?` — R2 key when we have the file.
  - `pdfExternalUrl String?` — the upstream OA URL if not cached.
  - `citationCount Int @default(0)`
  - `topicsJson Json` — array of topic strings, mapped to Hashtag rows when possible.
  - `fetchedAt DateTime`
  - `staleAt DateTime` — when metadata should refresh.
  - Indexes on `doi`, `arxivId`, `publishedAt`, `venue`.
- `ScholarAnnotation`
  - `id String @id`
  - `paperId String` (FK → `ScholarPaper.id`)
  - `userId String` (FK → `User.id`)
  - `kind String` — `highlight` | `note` | `question`.
  - `anchor Json` — CFI-like selector: `{ page, start, end, quoteText }` for PDFs; `{ cssPath, start, end, quoteText }` for HTML5 papers.
  - `body String?` — free-text note attached to the anchor.
  - `color String?` — token name, e.g. `sh-highlight-yellow`. Never a hex value.
  - `visibility String @default("private")` — `private` | `group:<groupId>` | `public`.
  - `createdAt DateTime`
  - `updatedAt DateTime`
  - Index on `(paperId, userId)`.
- `ScholarReadingProgress`
  - `id String @id`
  - `userId String`
  - `paperId String`
  - `lastPage Int @default(0)`
  - `lastScrollPct Float @default(0)`
  - `completed Boolean @default(false)`
  - `lastOpenedAt DateTime`
  - Unique on `(userId, paperId)`.

### 6.2 Unified paper shape (API response)

Returned from search and fetch endpoints:

```
{
  id: string,                  // canonical id
  title: string,
  authors: [{ name, authorId?, affiliation? }],
  venue: string | null,
  publishedAt: string | null,  // ISO-8601 UTC
  abstract: string | null,
  doi: string | null,
  arxivId: string | null,
  openAccess: boolean,
  pdfAvailable: boolean,       // true if we have a PDF url (cached OR external OA)
  pdfCached: boolean,          // true if cached on our R2
  htmlAvailable: boolean,      // true for arXiv HTML5, PMC HTML
  license: string | null,
  citationCount: number,
  topics: string[],            // topic hashtag slugs
  source: 'semantic_scholar' | 'openalex' | 'crossref' | 'arxiv' | 'core' | 'pubmed',
  relevance: number            // 0..1, ranker output
}
```

### 6.3 Shelf extension

Add to existing `ShelfBook` table (migration): `sourceType String @default("googleBooks")` and `doi String?` and `externalUrl String?` and `abstractText String?`. This lets the existing Library UI hold Scholar papers without a parallel table.

---

## 7. Reader system (the gap-filling core)

This is the part the user flagged: many academic APIs return metadata only. Scholar needs its own reading experience so users aren't bounced to publisher websites.

### 7.1 Reader fallback chain

When a user opens a paper, the reader picks the richest mode available:

1. **arXiv HTML5 mode.** If the paper has an arXiv id and the HTML5 version exists, we fetch it server-side, sanitize through the existing HTML scan pipeline with a slightly loosened profile (allow MathJax/KaTeX markers), and render inside the sheet-viewer component. No PDF needed. This is the best reader experience and costs us nothing.
2. **PMC HTML mode.** For biomedical papers with a PMC identifier, PMC serves structured HTML we can render the same way.
3. **Cached PDF mode.** If we have the OA PDF in R2, we serve via signed URL and render in our new PDF.js component (see §7.2).
4. **External OA PDF mode.** If we know the PDF is OA but haven't cached it, render PDF.js pointed at the external URL. We warm the cache in the background for the next user.
5. **Metadata-only mode.** Paywalled or unreadable. We show the full metadata page (title, authors, abstract, topics, citation count, cite button, Ask AI) and a `Read on publisher site` button that opens the external URL in the in-app browser sheet (mobile) or a new tab (web). AI summarize still works from the abstract. Users can still add notes and save to a shelf.

### 7.2 PDF.js component

New component: `frontend/studyhub-app/src/components/scholar/PaperReader.jsx`.

- Depends on `pdfjs-dist` (new package).
- Viewport uses our token-based styling (`--sh-surface`, `--sh-border`, etc.) — no hardcoded colors.
- Virtualized pages: render only the visible page plus 1 above and 1 below for scroll performance.
- Pinch-zoom on mobile, ctrl+scroll on web.
- Selection-to-highlight: selecting text shows a floating toolbar with `Highlight`, `Add note`, `Copy`, `Ask AI`.
- Inline reading-progress bar tied to `ScholarReadingProgress.lastScrollPct`. Autosave every 2 seconds.
- Supports keyboard navigation: arrow keys for page nav, `/` to focus find-in-document, `?` to open shortcuts overlay.
- Accessibility: PDF.js provides a text layer for screen readers; we keep it on by default. Reduced-motion respected. Font scaling honors OS settings.

### 7.3 HTML5 paper viewer

New component: `PaperHtmlReader.jsx`.

- Wraps the existing sheet HTML renderer with two tweaks: math expressions get KaTeX; tables of contents auto-generate from `<h2>` / `<h3>`.
- Shares the same floating selection toolbar so annotations work identically across PDF and HTML modes.

### 7.4 Annotation layer

Same data model for both readers (`ScholarAnnotation`). Two renderers:

- PDF anchors store `{ page, charRangeStart, charRangeEnd, quoteText }` against the PDF.js text layer.
- HTML anchors store `{ cssPath, start, end, quoteText }`.

Persistence:

- Create/update/delete via the `/api/scholar/annotations` endpoints.
- Local cache of the user's annotations for the current paper in memory; optimistic UI.
- Offline support (mobile): queue writes in IndexedDB, flush on reconnect.

Visibility:

- Private by default.
- A user can flip visibility to `group:<id>` when the paper is attached to a Study Group resource. All group members see the annotation; any member can reply in the margin.
- `public` annotations are experimental and gated behind a feature flag.

---

## 8. Search, list, and paper-detail UX

### 8.1 Scholar landing `/scholar`

- Top of page: a big search field with placeholder `Search 250 million papers` and an AI-suggest chip that routes `natural-language queries → keyword extraction → search` via AI.
- Filter row: `Year range`, `Open access only`, `Has full text`, `Topic`, `Venue`, `Author`. Filters are URL params (pattern matches Sheets page).
- Empty state (no query yet): three discovery shelves — `Trending in your topics`, `Classic papers in {top interest}`, `New in {current year}`.
- Self-learner viewer gets topic-first shelves; student/teacher viewers get course-first shelves (papers linked to courses via topic match). Respects `roles-and-permissions-plan.md` §10.2 ranking boost.

### 8.2 Results list

- Card per result: title, authors, venue, year, badge row (`Open access`, `Cached`, `Cited {N}`, topic chips), short abstract snippet (truncated 240 chars), CTA row: `Read`, `Save`, `Cite`, `Ask AI`.
- Long-press / overflow menu: `Share`, `Add to shelf`, `Add to study group`, `Hide this source`.
- Infinite scroll with cursor pagination.

### 8.3 Paper detail `/scholar/paper/:id`

Sections in order:

1. **Header** — title, author links (each opens author page if Semantic Scholar provides one), venue, year, cited-by count.
2. **Badges** — OA status, license, topics (clickable to topic feed).
3. **Abstract** — full abstract with `Expand` if truncated upstream.
4. **Actions row** — `Read`, `Save`, `Ask AI`, `Generate study sheet`, `Cite`, `Share`, `Add to group`.
5. **Reader** — inline when the user taps Read; otherwise collapsed.
6. **AI pane (right rail on web)** — preloaded `Summarize`, `Explain methodology`, `What are the limitations?` shortcut prompts.
7. **Citation graph** — tabs for `References` (papers this cites) and `Cited by` (papers that cite this). Each entry is a mini result card.
8. **Notes and annotations** — user's private notes for this paper. Group annotations visible when relevant.

### 8.4 Saved papers `/scholar/saved`

- Default `Saved papers` shelf plus any user-created shelves that contain papers.
- Reading-progress indicator per row.
- Filters: `Unread`, `In progress`, `Finished`, `By shelf`, `By topic`.
- Bulk actions: `Move to shelf`, `Export citations`, `Delete`.

---

## 9. AI integration

Scholar is the AI module's second big surface after the AI tab. Every AI entry point reuses `/api/ai` endpoints and the existing streaming / rate-limit plumbing.

### 9.1 Context injection

Extend `ai.context.js` with a `buildPaperContext(paper)` helper that injects:

```
<paper_context>
  <title>...</title>
  <authors>...</authors>
  <venue>...</venue>
  <year>...</year>
  <abstract>...</abstract>
  <full_text_excerpt optional>...</full_text_excerpt>  <!-- only if OA and within token budget -->
  <license>...</license>
</paper_context>
```

Full text excerpt is included only when we have it and the total context budget is respected. Always truncated with a visible note so the model knows it is seeing a subset.

### 9.2 Preset prompts

Shown as one-tap chips on the paper detail page:

- `Summarize in plain language`
- `Explain the methodology`
- `What are the limitations?`
- `List the key findings`
- `Translate the abstract to {my language}`
- `Generate a study sheet`
- `Turn into flashcards`
- `Compare to another paper` (prompts the user to pick a second saved paper)

### 9.3 Academic integrity guard

The existing AI system prompt (`ai.constants.js`) already forbids writing complete graded assignments. We extend the system prompt when in Scholar context with:

- Never fabricate a citation. If you do not know whether a claim is in this paper, say so.
- Do not produce a draft paper "in the style of" a real author.
- Always mark quoted text with quotation marks and cite the paper id.
- If the user asks for a critique, offer questions that lead them to evaluate the paper themselves rather than a finished critique.

### 9.4 Study sheet generation from paper

Endpoint `POST /api/scholar/ai/generate-sheet`:

1. Reads paper metadata + cached full text (if any) from `ScholarPaper`.
2. Calls Claude with the Scholar-extended system prompt plus a `Generate a StudyHub sheet` instruction.
3. Streams the sheet HTML (same format the AI module already produces for standalone sheet gen).
4. Pipes through the existing HTML scan pipeline.
5. Creates a draft sheet linked to the paper via new field `StudySheet.sourcePaperId`.
6. Opens the draft in the sheet editor for the user to review before publishing.

### 9.5 Claim verification (stretch)

Feature flag `flag_scholar_claim_check`. User can tap `Verify claims` inside a sheet that was generated from a paper. AI extracts claims, matches them back to spans of the source paper, and marks each claim `supported` | `partial` | `not found`. Results render as a side panel on the sheet editor.

---

## 10. Feature brainstorm — Scholar-native tools

Beyond the baseline reader and save, here is the larger brainstorm. Each item is tagged for wave inclusion; none are locked until we approve the final plan.

### 10.1 v1 (ship with the feature)

- **Citation exporter** — BibTeX, APA, MLA, Chicago, IEEE. Generates on demand via `/api/scholar/cite`. Copy-to-clipboard + download `.bib`.
- **Cite-to-note** — pick a note, insert a formatted citation with one tap. Updates the note's `citations` array so the same paper isn't duplicated.
- **Reading progress bar** — persisted via `ScholarReadingProgress`, shown on cards, on the detail page, and in saved lists.
- **Save to shelf** — reuses Library shelves. Default shelf `Saved papers` auto-created on first save.
- **Ask AI about this paper** — reuses the deep link pattern from the mobile plan.
- **Generate study sheet from paper** — §9.4.
- **Share to DM or group chat** — the `@capacitor/share` sheet on mobile, `navigator.share` or copy-link on web. Link is `/scholar/paper/:id`.
- **Topic tags** — papers inherit topic hashtags that feed Self-learner and course-student ranking.

### 10.2 v1.1 (first polish cycle)

- **Collaborative annotations** — Study Groups can co-annotate a paper. Each member sees others' highlights in that group's color.
- **Reading list** — personal Kanban-style list: `To read`, `Reading`, `Read`. Cards can be reordered.
- **Paper-to-flashcards** — AI produces spaced-repetition cards. First SRS UI in the product; we borrow from the existing Notes system for storage.
- **Side-by-side compare** — pick two saved papers, render metadata and abstracts side-by-side, prompt AI for a diff.
- **Offline reading** — mark a paper `Save offline` to force PDF cache and annotation pre-sync. Counts against the 100MB mobile budget.
- **Spoken mode (TTS)** — Web Speech API on web, `@capacitor-community/text-to-speech` on mobile. Reads abstract, intro, or full text; respects reduced-motion but not reduced-sound.

### 10.3 v1.2+ (post-beta, prioritized by telemetry)

- **Citation-graph exploration** — interactive graph canvas showing references and cited-by relationships; tap a node to jump to that paper.
- **Author pages** — aggregated view of one author's papers, co-authors, topics.
- **"New in my topic" digest email** — weekly, one-click unsubscribe.
- **Venue subscription** — follow a journal or conference; new papers surface in the Scholar landing page.
- **Paper comparison tables** — multi-paper table view (method, dataset, accuracy) extracted by AI.
- **In-line formula explainer** — tap a LaTeX formula in a paper; AI explains in plain language.
- **Recommendation engine** — "Because you saved X, try Y" — trained on user's saved set and reading progress.
- **Claim verification** — §9.5.
- **Quote extractor** — find me a defensible quote from this paper to support claim X.
- **Teacher mode: assign a paper** — teachers can attach a paper to a course with a reading prompt. Students see the reading in their course section and can submit annotated responses.

---

## 11. Integration with existing features

| Feature         | Scholar hook                                                                                                                 |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Library shelves | `ShelfBook` extended with `sourceType: 'scholar_paper'`. Existing shelf UI holds papers mixed with books.                    |
| Notes           | New optional `paperId` on `Note`. Citation auto-inserted when attaching.                                                     |
| Sheets          | New optional `sourcePaperId` on `StudySheet`. Lineage badge on the sheet reads `Generated from {paper title}`.               |
| AI              | Context injection §9.1; preset prompts §9.2; sheet gen §9.4.                                                                 |
| Study Groups    | `GroupResource` extended with `scholarPaperId`. Group annotations live on that paper visible to members.                     |
| Messaging       | Paper link cards render rich preview when pasted in DM or group chat.                                                        |
| Feed            | A user can create a feed post with a paper attached; card renders as a Scholar preview.                                      |
| Search          | Global search adds `Papers` tab. Results cap at 10 in the modal; `See all` opens `/scholar?q=...`.                           |
| Hashtags        | Paper topics mapped to Hashtag rows. Topic feed at `/tag/:slug` includes matching papers in a separate shelf.                |
| Role boost      | `getBoostedIdsForUser` already drives course-boost for students and topic-boost for Self-learners. Scholar ranker reuses it. |
| Provenance      | Sheet generated from a paper carries a `sourcePaperId` in its provenance manifest. Contributors can see the source.          |
| Notifications   | New digest email and push event `scholar.newInTopic` (opt-in, default off).                                                  |

---

## 12. Mobile parity and deltas

All Scholar functionality is available on mobile. Deltas from web:

- **Entry points** — not a bottom-tab in v1. Reached via top-bar search filter chip, the `Saved papers` row on the You tab, and deep links.
- **Reader** — same React components. PDF.js works inside the Capacitor WebView. Performance target: 60fps scroll on Pixel 6 for a 10MB PDF.
- **Annotations** — same UI. Selection handles tuned for touch (24dp).
- **Offline** — `Save offline` forces the OA PDF into the IndexedDB cache. Respects the 100MB LRU (mobile-app-plan §14.5). Papers marked `keep offline` get a star indicator and are exempt from LRU eviction until 95% capacity.
- **Share** — native share sheet via `@capacitor/share`.
- **Data saver** — when active (mobile-app-plan §14.6), PDFs load on-demand per page instead of prefetching.
- **External link-outs** — paywalled papers open in the in-app browser sheet (§15.1), not external Chrome. Only Stripe and pricing flows force external browser.
- **Deep link** — `studyhub.app/scholar/paper/:id` is added to the Android App Links allowlist; app intercepts and opens the native reader.

---

## 13. Privacy, copyright, and licensing

This is the area that can kill the feature if handled badly. Rules:

- **Metadata.** Always free to display. Titles, abstracts, DOIs, author names, venue, year, topics are facts and are displayed widely.
- **OA full text.** We cache and redistribute only when the license allows it (CC-BY, CC-BY-SA, CC0, public domain, or the source explicitly permits mirroring). The license field is stored on `ScholarPaper` and checked before R2 upload.
- **Paywalled full text.** Never cached. The `pdfExternalUrl` is a link-out; we do not proxy the stream.
- **User annotations.** Private by default. Making them visible to a group or public requires explicit opt-in.
- **Attribution.** Every paper page shows a visible `Source: {API name}` chip. Every AI-generated sheet made from a paper carries a `Source: {title}, {authors}, {year}, {doi}` line at the top.
- **DMCA and takedowns.** Add a `Report copyright issue` link on every paper page. On report, the paper PDF cache is evicted and a review task goes to moderation.
- **Robots and ToS.** We respect each API's terms: polite-pool headers for CrossRef, contact email for Unpaywall and PubMed, rate limits everywhere, and we do not scrape publisher websites.
- **User privacy.** Scholar search queries are treated as personal data. They are not sold, shared, or used to train models. A user can clear Scholar history in Settings.

### 13.1 Security notes

- All external API responses are treated as untrusted. HTML from arXiv and PMC goes through the same sanitizer used for sheets, with the math-friendly profile.
- PDFs from external URLs are fetched server-side with a 20MB hard cap and 10-second timeout. No redirects to non-http(s). No file:// or data:// URIs.
- `pdfjs-dist` is configured with `disableAutoFetch: true`, `disableStream: false`, `enableScripting: false` — JavaScript inside the PDF never executes.
- Signed URLs to R2 expire after 10 minutes; user must come back through our backend to refresh.

---

## 14. Analytics and feature flags

Flags:

- `flag_scholar` — gates the whole feature.
- `flag_scholar_arxiv_html` — gates the HTML5 reader fallback (chunky to test with).
- `flag_scholar_annotations` — gates the annotation layer.
- `flag_scholar_ai_sheet_gen` — gates paper-to-sheet AI flow.
- `flag_scholar_claim_check` — gates §9.5.

PostHog events (all include `accountType`):

- `scholar_searched` — query, filter state, result count, top source.
- `scholar_paper_opened` — paperId, source, reader mode (arxiv_html | pmc_html | cached_pdf | external_pdf | metadata_only).
- `scholar_paper_saved` — paperId, shelfId.
- `scholar_ai_prompted` — preset name.
- `scholar_sheet_generated` — paperId, resulting sheetId, duration.
- `scholar_annotation_created` — paperId, kind, visibility.
- `scholar_cite_exported` — style.

---

## 15. Test plan

### 15.1 Unit (backend, Vitest)

- Each adapter in `scholar.sources/` has unit tests with recorded fixtures (no live network in CI).
- `scholar.service.dedupe.test.js` — confirms DOI + title+author dedupe logic.
- `scholar.service.fanout.test.js` — one source slow, one source error, one source fast; response returns what is available within the timeout budget.
- `scholar.cache.test.js` — OA PDFs with license=`cc-by` get cached; license=`all-rights-reserved` do not.
- `scholar.annotation.test.js` — anchor validation, visibility rules, rate limits.
- `scholar.cite.test.js` — BibTeX string is valid for an open-access sample, APA for an arXiv preprint, MLA for a CrossRef journal article.

### 15.2 Unit (frontend, Vitest)

- `PaperReader.test.jsx` — renders PDF.js pages; page-turn keyboard events; selection emits anchor with `quoteText`.
- `PaperHtmlReader.test.jsx` — KaTeX renders correctly; ToC auto-generates.
- `AnnotationLayer.test.jsx` — highlight creation, edit, delete; private-by-default.
- `scholarSearchHooks.test.js` — URL-param reflection; debounced fetch; cancellation on nav.
- Label scan test adds Scholar surfaces to the existing `Other`-as-role-label regression.

### 15.3 Integration (Supertest)

- End-to-end search flow hitting recorded fixtures for each tier-1 source.
- Full paper-open flow with metadata-only → Ask AI → save → annotate → cite export.
- OA PDF cache warming: first request is a cache miss (returns external URL); second request returns a signed R2 URL.

### 15.4 E2E (Playwright)

- `scholar.search.spec.js` — search, filter by year, open result, save.
- `scholar.reader.spec.js` — open an OA PDF, highlight a span, add a note, reload, highlight persists.
- `scholar.ai.spec.js` — Ask AI on a paper with only an abstract available; verify the context includes `<paper_context>` and the response streams.
- `scholar.cite.spec.js` — export BibTeX and copy to clipboard.
- `scholar.mobile.spec.js` — the Capacitor build opens a paper via deep link, reads, saves offline.
- `scholar.license.spec.js` — attempting to cache a non-OA paper fails gracefully and falls back to link-out.

### 15.5 Manual QA

- Open one arXiv paper, one PMC paper, one OA CrossRef paper, one paywalled CrossRef paper, and one Google Books item. Each renders correctly or falls back cleanly.
- Offline mode on mobile: save a paper offline, toggle airplane, reopen, confirm reader still works, add annotations, reconnect, confirm sync.
- Accessibility sweep with screen reader on the reader: every button has a label, text layer is navigable.

---

## 16. Build waves

Adapted to the existing mobile build plan naming.

### Wave A — Foundation (2 weeks)

- Scholar module scaffold, routes, and DB tables (migration `add_scholar_tables`).
- Adapters for Semantic Scholar, OpenAlex, CrossRef, arXiv, Unpaywall. No UI yet.
- Basic `/api/scholar/search` and `/api/scholar/paper/:id`.
- Landing page with search field, list view, detail page (metadata-only mode).
- Cite endpoint + UI (BibTeX + APA + MLA).
- Save flow via extended `ShelfBook`.
- Feature flag `flag_scholar` defaults off.

### Wave B — Reader and AI (2 weeks)

- Add `pdfjs-dist` dependency; build `PaperReader` + `PaperHtmlReader`.
- arXiv HTML5 fallback path. PMC HTML path.
- AI preset prompts + sheet-generation endpoint.
- `flag_scholar` to 10% internal cohort.

### Wave C — Annotations and shelves polish (2 weeks)

- Annotation table + endpoints + UI overlay for both readers.
- Saved-papers page and filters.
- Global search `Papers` tab integration.
- Topic-hashtag mapping for papers.
- Beta rollout to 100% Self-learners first.

### Wave D — Mobile parity (1 week)

- Scholar works inside the Capacitor WebView, deep links wired, offline cache integrated.
- Push opt-in flag `scholar.newInTopic`.
- Data-saver respected.

### Wave E — v1.1 polish (post-beta)

- Collaborative annotations (group scope).
- Reading list UI.
- Paper-to-flashcards.
- Compare-two-papers.

---

## 17. Open questions

- **Do we need a dedicated "Scholar" tab on mobile, or is hide-inside-search-and-You enough?** Current plan: no new tab in v1. Revisit based on telemetry.
- **What is the cache size budget on R2 for OA PDFs?** Current plan: no hard cap; evict by LRU once R2 usage passes a threshold we set in ops.
- **Claim verification accuracy bar.** We should evaluate whether `supported` / `not found` labels are trustworthy enough to ship broadly. Start flag-gated.
- **Teacher assignments.** Is there appetite for "assign a paper to a course" in v1.2 or later? Out of scope for v1.
- **Books vs papers.** Google Books already lives in Library. Do we unify under one "Research" tab, or keep Library (books) separate from Scholar (papers)? Current plan: keep separate; cross-link from both directions.

---

## 18. Acceptance criteria

The Scholar feature is considered shipped when:

- [ ] `/scholar` landing page searches Semantic Scholar, OpenAlex, CrossRef, arXiv with de-duplicated results under 2 seconds (warm) and 4 seconds (cold).
- [ ] Every result tells the user whether the full text is readable inside StudyHub.
- [ ] arXiv HTML5 papers render in the HTML reader with math intact.
- [ ] OA PDFs render in the PDF reader with the text layer available for selection and screen readers.
- [ ] Paywalled papers present full metadata, abstract, cite, Ask AI, and a link-out button.
- [ ] Save to shelf, Ask AI, Generate study sheet, and Export citation work on every result type.
- [ ] Annotations persist across sessions and sync across devices.
- [ ] Mobile parity: same features reachable via the You tab `Saved papers` row and the Home search `Papers` chip.
- [ ] No hardcoded colors; every surface uses `--sh-*` tokens.
- [ ] No emoji used as icon; every icon comes from `Icons.jsx` (new icons added in the same style).
- [ ] Scholar respects the role plan: Self-learner feed boosts use topics, school badges are hidden, OAuth role picker covers Scholar first-time users.
- [ ] Rate limits and circuit breakers protect the backend from academic API outages.
- [ ] All tests in §15 pass. Label-scan test still green.
- [ ] Privacy and licensing checks in §13 are signed off.
