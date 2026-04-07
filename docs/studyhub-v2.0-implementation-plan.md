<!-- markdownlint-disable MD031 MD032 MD040 MD060 -->

# StudyHub v2.0 Implementation Plan

**Author:** Hub AI / Abdul Fornah
**Date:** April 1, 2026
**Status:** PENDING APPROVAL -- No coding until this plan is reviewed and approved.

---

## Table of Contents

1. Executive Summary
2. Feature 1: Public Domain Library (BookHub)
3. Feature 2: Subscription and Pricing Placeholder
4. Feature 3: Code Playground Placeholder
5. Feature 4: Admin Panel Analytics Upgrade
6. Feature 5: Security Hardening
7. AI Rate Limit Adjustment
8. Database Migrations Required
9. Railway Configuration
10. Frontend Routing and Navigation Changes
11. Future Feature Brainstorming (Monetization)
12. Implementation Order and Session Estimates
13. Risk Assessment

---

## 1. Executive Summary

This plan covers six major workstreams that transform StudyHub from a study-sheet platform into a comprehensive knowledge hub. The largest effort is the Public Domain Library ("BookHub"), which gives users access to 70,000+ free books via Project Gutenberg with an in-browser reader, AI-assisted reading, and social annotations. Supporting features include subscription groundwork, a code playground concept, admin analytics charts, and a full security hardening pass.

Historical note (2026-04-07): the shipped library now uses Google Books metadata plus the embedded Google Books reader. Shelves, bookmarks, and reading progress remain active. The Gutendex, epub.js, and highlight details below are preserved as archival planning context rather than the current product contract.

**Key technical decisions made during research:**

- **Book data source:** Gutendex API (gutendex.com/books) for Project Gutenberg metadata and download links, Open Library Covers API for high-quality cover images.
- **In-browser reader:** epub.js (open source, MIT license) for EPUB rendering with built-in highlighting, bookmarks, and pagination.
- **Admin charts:** Recharts (already in project dependencies via React ecosystem) -- free, no API key, React-native.
- **Security:** AES-256-GCM envelope encryption for sensitive fields, Prisma middleware for automatic encrypt/decrypt, bcrypt already in place for passwords.

---

## 2. Feature 1: Public Domain Library (BookHub)

Superseded implementation note: the production-facing library is Google Books-based and does not ship the epub.js highlight workflow described in this planning document.

### 2.1 Overview

A new top-level page at `/library` where users can browse, search, and read public domain books. The experience has three layers: (1) a browsable/searchable catalog, (2) a book detail page with rich metadata, and (3) an immersive in-browser reader.

### 2.2 API Strategy

**Primary API -- Gutendex (gutendex.com/books):**

- Free, no API key required, no strict rate limits documented.
- Returns paginated results (32 per page) with metadata: title, authors, subjects, bookshelves, languages, download count, and format URLs.
- Format URLs include: `text/html`, `application/epub+zip`, `text/plain`, `application/pdf`, `image/jpeg` (cover).
- Search: `GET /books?search=<term>` (full-text across title + author).
- Filters: `topic=<subject>`, `languages=en`, `author_year_start`, `author_year_end`, `sort=popular` or `sort=ascending`.
- Individual book: `GET /books/<id>` returns full metadata for one book.

**Secondary API -- Open Library (openlibrary.org):**

- Covers API: `https://covers.openlibrary.org/b/id/<cover_id>-L.jpg` (S/M/L sizes).
- Books API: `https://openlibrary.org/works/<id>.json` for extended descriptions and subjects.
- Rate limit: 100 requests per 5 minutes per IP. We must implement server-side caching.

**Backend proxy strategy:** All external API calls go through our backend to (a) cache responses in Redis or memory, (b) avoid CORS issues, (c) control rate limiting, and (d) enrich metadata by merging Gutendex + Open Library data.

### 2.3 Pages and Components

#### 2.3.1 Library Main Page (`/library`)

**Layout:**

- Hero section with search bar and category quick-filters (Fiction, Science, History, Philosophy, etc.).
- Three tabbed sections: "Discover" (trending/popular), "My Bookshelf" (saved/bookmarked/downloaded), "Recently Read."
- Book grid with cover image, title, author, and download count.
- Infinite scroll or "Load More" pagination.
- Sidebar filters: language, subject, author, year range, sort by (popular, newest, title A-Z).

**What makes it unique:**

- "Study Shelf" concept -- users can organize books into custom shelves (e.g., "HIST 101 Reading List," "Philosophy Electives").
- Course-linked recommendations: if a user is enrolled in a History course, suggest relevant public domain history texts.
- Community reading stats: "247 StudyHub students are reading this book" social proof badges.
- Reading progress indicators on book cards (percentage bar for books they have started).

#### 2.3.2 Book Detail Page (`/library/:gutenbergId`)

**Layout:**

- Large, high-quality cover image (Open Library L-size or Gutendex JPEG).
- Full metadata panel: title, author(s) with birth/death years, subjects, bookshelves, language, download count, Project Gutenberg ID, copyright status.
- Book summary section (pulled from Open Library description field, or Gutendex subjects as fallback).
- Download options panel showing all available formats with file size estimates: EPUB, PDF, Plain Text, HTML. Each format gets a download button.
- "Read Online" primary CTA button that opens the in-browser reader.
- "Save to Bookshelf" button with shelf picker dropdown.
- AI section: "Ask Hub AI about this book" -- opens a contextual AI chat pre-loaded with the book's metadata so the AI knows what book the user is reading.
- Reviews/ratings from other StudyHub users (future -- placeholder for now).
- "Other books by this author" carousel at the bottom.

**What makes it unique:**
- The metadata presentation should feel like a premium bookstore product page, not a bare data dump.
- The AI integration is contextual -- Hub AI knows the book title, author, and subject area without the user having to explain.
- Course relevance tags: if the book appears in a course's suggested reading, show the course badge.

#### 2.3.3 In-Browser Reader (`/library/:gutenbergId/read`)

**Core technology:** epub.js (futurepress/epub.js on GitHub).

epub.js provides:
- EPUB parsing and rendering in a browser container.
- Built-in pagination (swipe/click to turn pages).
- CFI-based (Canonical Fragment Identifier) location tracking for bookmarks.
- Text selection API for highlighting.
- Theming (inject CSS into the EPUB renderer).
- Search within the book.

**Reader modes (user picks on entry):**
1. **Paginated mode** -- book-like experience, one or two pages at a time, page-turn animations.
2. **Scroll mode** -- continuous vertical scroll like a web article, better for note-taking.

**Reader features:**

| Feature | Implementation | Priority |
|---------|---------------|----------|
| Dark mode | CSS injection into epub.js renderer: dark background, light text, inverted images | P0 |
| Sepia mode | Warm background (#f4ecd8), dark brown text | P0 |
| Custom background colors | Color picker with 8 presets + custom hex input | P1 |
| Font size zoom (in/out) | epub.js `rendition.themes.fontSize()` API | P0 |
| Font family picker | Serif, sans-serif, monospace, dyslexia-friendly (OpenDyslexic) | P1 |
| Bookmarks | Save CFI location + page snippet to database, list in sidebar panel | P0 |
| Highlighting | epub.js text selection + `rendition.annotations.highlight()`, save color + CFI to database | P0 |
| Annotations/Comments | Attach a text note to a highlight, visible to the user and optionally shared with other readers | P1 |
| Social comments | Other users can see shared annotations on the same book (opt-in per annotation) | P2 |
| Table of Contents | epub.js `book.navigation.toc` rendered in a slide-out sidebar | P0 |
| Search in book | epub.js `book.spine` search, highlight results in text | P1 |
| Reading progress | Track current CFI, compute percentage, persist to database | P0 |
| Keyboard navigation | Left/Right arrows for page turn, Escape to close panels | P0 |
| AI reading assistant | Floating button that opens AI chat pre-loaded with current page text/location context | P1 |

**AI Reading Assistant (detail):**

When the user clicks "Ask AI" from the reader:
- The frontend captures the current visible text (epub.js provides access to rendered content).
- Opens a dedicated AI conversation tagged with the book ID and current CFI location.
- The AI system prompt is augmented with: book title, author, the current page/chapter text (up to 4000 chars), and the user's question.
- Use cases: "What does this word mean?", "Summarize this chapter," "Explain the historical context of this passage," "Quiz me on what I just read."
- This uses the existing Hub AI infrastructure (same conversation model, same streaming SSE). The only new piece is the context injection from the reader.

### 2.4 Backend Architecture

**New module:** `backend/src/modules/library/`

**Files:**
- `library.routes.js` -- API endpoints (see below).
- `library.service.js` -- Business logic, external API calls, caching.
- `library.cache.js` -- In-memory cache (TTL-based Map) for Gutendex/Open Library responses.
- `library.constants.js` -- Cache TTLs, API URLs, default page sizes.
- `index.js` -- Module barrel.

**API Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/library/books` | Search/browse books (proxies to Gutendex with caching) |
| GET | `/api/library/books/:id` | Get single book detail (merged Gutendex + Open Library data) |
| GET | `/api/library/books/:id/cover` | Proxy cover image (cached, avoids CORS) |
| GET | `/api/library/shelves` | List user's custom shelves |
| POST | `/api/library/shelves` | Create a new shelf |
| PATCH | `/api/library/shelves/:id` | Rename/update shelf |
| DELETE | `/api/library/shelves/:id` | Delete shelf |
| POST | `/api/library/shelves/:shelfId/books` | Add book to shelf |
| DELETE | `/api/library/shelves/:shelfId/books/:gutenbergId` | Remove book from shelf |
| GET | `/api/library/reading-progress` | Get all reading progress for user |
| PUT | `/api/library/reading-progress/:gutenbergId` | Upsert reading progress (CFI, percentage) |
| GET | `/api/library/bookmarks/:gutenbergId` | Get bookmarks for a book |
| POST | `/api/library/bookmarks` | Create bookmark |
| DELETE | `/api/library/bookmarks/:id` | Delete bookmark |
| GET | `/api/library/highlights/:gutenbergId` | Get highlights for a book |
| POST | `/api/library/highlights` | Create highlight |
| PATCH | `/api/library/highlights/:id` | Update highlight (note, color, shared flag) |
| DELETE | `/api/library/highlights/:id` | Delete highlight |
| GET | `/api/library/highlights/:gutenbergId/social` | Get shared highlights from other users |

**Caching strategy:**
- Book search results: cache for 1 hour (popular books don't change often).
- Individual book metadata: cache for 24 hours.
- Cover images: cache for 7 days (they never change).
- User data (shelves, progress, bookmarks): no cache, always fresh from database.

### 2.5 Frontend Architecture

**New directory:** `frontend/studyhub-app/src/pages/library/`

**Files:**
- `LibraryPage.jsx` -- Main catalog page (thin orchestrator).
- `BookDetailPage.jsx` -- Book detail/metadata page.
- `BookReaderPage.jsx` -- In-browser EPUB reader.
- `useLibraryData.js` -- Data hook for catalog browsing.
- `useBookDetail.js` -- Data hook for single book detail + shelves.
- `useBookReader.js` -- Data hook for reader state (progress, bookmarks, highlights).
- `libraryConstants.js` -- Subjects, sort options, reader themes.
- `libraryHelpers.js` -- Format file sizes, parse Gutendex responses.
- `components/BookCard.jsx` -- Reusable book card for grid display.
- `components/BookGrid.jsx` -- Responsive grid layout.
- `components/ShelfPicker.jsx` -- Dropdown for adding books to shelves.
- `components/ReaderToolbar.jsx` -- Reader top bar (back, TOC, settings, AI).
- `components/ReaderSettingsPanel.jsx` -- Theme, font, layout options.
- `components/ReaderSidebar.jsx` -- TOC, bookmarks, highlights list.
- `components/HighlightPopover.jsx` -- Appears on text selection with color + note options.

**New npm dependency:** `epubjs` (epub.js, ~180KB gzipped). Install: `npm install epubjs`.

### 2.6 Database Models

```
model BookShelf {
  id           Int      @id @default(autoincrement())
  userId       Int
  name         String
  description  String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  user  User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  books ShelfBook[]

  @@unique([userId, name])
  @@index([userId])
}

model ShelfBook {
  id           Int      @id @default(autoincrement())
  shelfId      Int
  gutenbergId  Int
  title        String
  author       String
  coverUrl     String?
  addedAt      DateTime @default(now())

  shelf BookShelf @relation(fields: [shelfId], references: [id], onDelete: Cascade)

  @@unique([shelfId, gutenbergId])
  @@index([shelfId])
}

model ReadingProgress {
  id           Int      @id @default(autoincrement())
  userId       Int
  gutenbergId  Int
  cfi          String?
  percentage   Float    @default(0)
  lastReadAt   DateTime @default(now())
  updatedAt    DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, gutenbergId])
  @@index([userId])
}

model BookBookmark {
  id           Int      @id @default(autoincrement())
  userId       Int
  gutenbergId  Int
  cfi          String
  label        String?
  pageSnippet  String?
  createdAt    DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, gutenbergId])
}

model BookHighlight {
  id           Int      @id @default(autoincrement())
  userId       Int
  gutenbergId  Int
  cfi          String
  text         String
  color        String   @default("#FFEB3B")
  note         String?
  shared       Boolean  @default(false)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, gutenbergId])
  @@index([gutenbergId, shared])
}
```

---

## 3. Feature 2: Subscription and Pricing Placeholder

### 3.1 Overview

A placeholder page at `/pricing` that communicates the future subscription model. No payment processing -- just marketing and a waitlist email collector.

### 3.2 Page Design (`/pricing`)

**Layout:**
- Clean pricing table with three tiers: Free, Pro, and Institution.
- Each tier card lists included features with checkmarks.
- Pro and Institution have a "Coming Soon" badge and a "Join Waitlist" button.
- The Free tier shows current limits.

**Tier breakdown (draft for marketing):**

| Feature | Free | Pro (Coming Soon) | Institution (Coming Soon) |
|---------|------|-------------------|--------------------------|
| Study sheets | Unlimited browse | Unlimited browse | Unlimited browse |
| Sheet uploads | 10/month | Unlimited | Unlimited |
| Hub AI conversations | 20/day | 100/day | 200/day |
| AI document upload (PDF, code) | -- | Up to 10MB files | Up to 50MB files |
| Library bookmarks | 50 | Unlimited | Unlimited |
| Private study groups | 2 | 10 | Unlimited |
| Code Playground projects | 3 | 25 | Unlimited |
| Custom themes | -- | Yes | Yes |
| Priority support | -- | Yes | Dedicated |
| Analytics dashboard | -- | Personal | Org-wide |
| Price | $0 | $4.99/mo | Contact us |

**What makes it unique:**
- Animated comparison slider that lets users visually see the difference between tiers.
- Testimonials section with student quotes (placeholder content for now).
- FAQ accordion at the bottom addressing common questions.

### 3.3 Waitlist Collection

- Simple email input + submit button under Pro/Institution tiers.
- Backend endpoint: `POST /api/waitlist` stores email + tier interest in a new `Waitlist` table.
- No email sending -- just data collection for launch day.

### 3.4 Navigation Placement

- Add "Pricing" link to the landing page (HomePage) top navigation bar.
- Add "Pricing" link to the authenticated sidebar (bottom section, near Settings).
- Add "Pro" badge/link to all top navigation bars.

### 3.5 Database Model

```
model Waitlist {
  id        Int      @id @default(autoincrement())
  email     String
  tier      String
  createdAt DateTime @default(now())

  @@index([email])
  @@index([tier])
}
```

---

## 4. Feature 3: Code Playground Placeholder

### 4.1 Overview

A placeholder page at `/playground` that previews the future sandboxed coding environment. No actual code execution yet -- just the concept, UI wireframe, and feature list.

### 4.2 Page Design (`/playground`)

**Layout:**
- Split-pane mockup: code editor on the left (syntax-highlighted static example), output/preview on the right.
- "Coming Soon" overlay with feature list.
- Email signup for early access.

**Planned features to display:**

- Browser-based code editor (Monaco Editor / CodeMirror).
- Language support: JavaScript, Python, HTML/CSS, TypeScript, SQL.
- Live preview for HTML/CSS/JS projects.
- Sandboxed execution via Web Workers + iframe sandbox (no server access, no network calls, no filesystem access outside the sandbox).
- Publish and share: users can publish their projects with a unique URL.
- Fork other users' projects (similar to study sheet forking).
- Download project files.
- Collaboration: optional real-time co-editing (future).
- Version history with diffs.

### 4.3 Security Architecture (Pre-planned)

These security measures will be implemented when the playground goes live:

- **Execution sandbox:** All code runs in a sandboxed iframe with `sandbox="allow-scripts"` (no `allow-same-origin`, no `allow-top-navigation`, no `allow-forms`). The iframe has a null origin and cannot access the parent page's DOM, cookies, or storage.
- **Web Worker isolation:** Heavy computation runs in a Web Worker with a strict CSP that blocks all network requests.
- **Output sanitization:** Any HTML output is rendered in the sandboxed iframe only. No raw HTML injection into the main app DOM.
- **Time limits:** Code execution is killed after 10 seconds via `setTimeout` + Worker termination.
- **Memory limits:** Use the `performance.measureUserAgentSpecificMemory()` API where available, or kill workers that exceed a threshold.
- **No server-side execution:** All code runs client-side only. This eliminates the entire class of server-side code injection attacks.
- **CSP headers:** The playground page gets a strict Content-Security-Policy that prevents script injection outside the designated sandbox areas.
- **Storage isolation:** Published code projects are stored as plain text in the database. They are never executed server-side. Rendering happens only in the user's browser sandbox.
- **XSS prevention:** All project titles, descriptions, and comments are sanitized with DOMPurify before rendering.

### 4.4 Suggestions for Expansion (Future Sessions)

1. **Snippet library:** Pre-built code snippets organized by language and concept (sorting algorithms, API patterns, data structures) that users can fork and modify.
2. **Course-linked exercises:** Professors can create coding exercises linked to their courses. Students submit solutions, get automated test feedback.
3. **AI code review:** Hub AI can review a user's code and suggest improvements, explain bugs, or optimize performance.
4. **Competitive coding:** Timed coding challenges with leaderboards. Weekly challenges tied to CS course topics.
5. **Portfolio builder:** Students can showcase their best playground projects on their profile as a coding portfolio.
6. **Export to GitHub:** One-click push to a user's GitHub repository.
7. **Terminal emulator:** A simulated terminal for practicing command-line skills (sandboxed, no real system access).
8. **Database sandbox:** A temporary SQLite instance per user for practicing SQL queries.

---

## 5. Feature 4: Admin Panel Analytics Upgrade

### 5.1 Overview

Replace the current number-only StatsGrid and ModerationOverview widgets with interactive charts and graphs. Use Recharts (already available in the React ecosystem, no API key needed).

### 5.2 Library Choice: Recharts

- **Why Recharts:** React-native (components, not imperative API), free, MIT license, no API key, lightweight (~50KB gzipped), already compatible with our React 19 setup. Supports: line, bar, area, pie, radar, scatter, and composed charts. Responsive containers built in.
- **Alternative considered:** Chart.js (canvas-based, more configuration, less React-native), ECharts (heavier, better for very complex dashboards), ApexCharts (also heavier). Recharts wins on simplicity and React integration.

### 5.3 New Admin Charts

**Install:** `npm install recharts` in the frontend package.

**New component:** `frontend/studyhub-app/src/pages/admin/components/AdminCharts.jsx`

**Charts to build:**

| Chart | Type | Data Source | Description |
|-------|------|------------|-------------|
| User Growth | Area chart | Users by createdAt (daily/weekly/monthly) | Shows signup trend over time |
| Sheet Uploads | Bar chart | Sheets by createdAt (daily) | Upload volume, color-coded by status (published/draft/flagged) |
| AI Usage | Line chart | AiUsageLog by date | Daily AI message count, overlay with user count |
| Active Users | Area chart | UserDailyActivity table | DAU/WAU/MAU with stacked areas |
| Content Breakdown | Pie chart | Sheets + Notes + FeedPosts counts | Visual split of content types |
| Moderation Funnel | Bar chart | ModerationCase by status | Cases: pending, reviewing, resolved, appealed |
| Top Courses | Horizontal bar | Sheets count per course | Most active courses by content volume |
| Message Volume | Line chart | Messages by createdAt (daily) | Messaging activity trend |
| Library Usage | Line chart | ReadingProgress + BookBookmark counts | Library engagement (once BookHub launches) |
| Storage Usage | Gauge/metric | Sum of sheet file sizes | Total platform storage consumption |

### 5.4 Backend Endpoints

**New admin analytics endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/analytics/users` | User growth data (grouped by day/week/month) |
| GET | `/api/admin/analytics/content` | Content creation stats (sheets, notes, posts by date) |
| GET | `/api/admin/analytics/ai` | AI usage trends |
| GET | `/api/admin/analytics/messaging` | Message volume trends |
| GET | `/api/admin/analytics/moderation` | Moderation case funnel data |
| GET | `/api/admin/analytics/library` | Library engagement data |

Each endpoint accepts `?period=7d|30d|90d|1y` for time range filtering.

### 5.5 Admin Page Changes

- Add a new "Analytics" tab to the AdminPage tab bar.
- The existing OverviewTab keeps its stat cards (quick glance numbers).
- The new AnalyticsTab contains all the charts with a date range picker at the top.
- Charts load lazily (only when the Analytics tab is active).

---

## 6. Feature 5: Security Hardening

### 6.1 Current Security Posture (Audit Results)

**What is already secure:**
- Passwords: bcrypt with 12 salt rounds. Never stored in plaintext.
- Sessions: HTTP-only cookies (not accessible via JavaScript). Secure flag in production.
- CORS: Strict origin whitelist.
- Rate limiting: 49 centralized rate limiters across all endpoints.
- HTML security: 4-tier scan pipeline for uploaded HTML content.
- Input validation: Express-validator on critical endpoints.
- Sentry: PII scrubbing via `beforeSend` hooks, ignoring expected 4xx errors.

**What needs hardening:**

| Issue | Severity | Current State | Target State |
|-------|----------|---------------|-------------|
| Email addresses visible in database | High | Plaintext in User.email column | Encrypted at rest with AES-256-GCM |
| Messages readable in database | High | Plaintext in Message.content | Encrypted at rest with AES-256-GCM |
| AI messages readable in database | High | Plaintext in AiMessage.content | Encrypted at rest with AES-256-GCM |
| Admin API exposes user emails | Medium | GET /api/admin/users returns email | Return masked email (a***@gmail.com) |
| PII vault code is dead | Low | `piiVault.js` exists but is never called | Either activate it or remove dead code |
| No field-level encryption key rotation | Medium | No rotation mechanism | Implement key versioning for rotation |
| Railway env vars contain DATABASE_URL | Info | Contains full connection string | Document that Railway encrypts env vars at rest (it does). Add warning in admin docs. |

### 6.2 Encryption Strategy

**Approach: Application-level field encryption using AES-256-GCM.**

Why not database-level encryption?
- PostgreSQL's `pgcrypto` encrypts at rest but data is plaintext in query results.
- Application-level encryption means even if someone dumps the database or accesses Railway's database console, they see ciphertext.
- The encryption key lives in a Railway environment variable (`FIELD_ENCRYPTION_KEY`), not in code.

**Implementation:**

1. **New utility:** `backend/src/lib/fieldEncryption.js`
   - `encrypt(plaintext, key)` -- returns `iv:ciphertext:authTag` (base64-encoded).
   - `decrypt(encrypted, key)` -- splits and decrypts.
   - Key is loaded from `process.env.FIELD_ENCRYPTION_KEY` (32-byte hex string).

2. **Prisma middleware:** `backend/src/lib/prismaEncryption.js`
   - Intercepts `create`, `update`, and `findMany`/`findUnique` operations on encrypted fields.
   - On write: encrypts designated fields before they hit the database.
   - On read: decrypts designated fields before returning to the application.
   - Encrypted fields config: `{ User: ['email'], Message: ['content'], AiMessage: ['content'] }`.

3. **Migration strategy for existing data:**
   - Write a one-time migration script that reads all existing plaintext values, encrypts them, and writes them back.
   - Run this script once after deploying the encryption middleware.
   - The script is idempotent: it checks if a value looks like ciphertext (contains two colons and is base64) before encrypting.

4. **Search on encrypted fields:**
   - Encrypted fields cannot be searched with SQL `LIKE` or `WHERE email = ?`.
   - For email lookup (login, password reset): store a `emailHash` column (SHA-256 of lowercased email) alongside the encrypted email. Look up by hash, then decrypt to verify.
   - For message search: this is a future concern. Current messaging has no server-side search. If needed later, implement a search index with encrypted tokens.

5. **Key rotation:**
   - Support multiple key versions: `FIELD_ENCRYPTION_KEY` (current) and `FIELD_ENCRYPTION_KEY_PREV` (previous).
   - On read, if decryption with current key fails, try previous key, then re-encrypt with current key and save.
   - To rotate: set new key as `FIELD_ENCRYPTION_KEY`, move old key to `FIELD_ENCRYPTION_KEY_PREV`, run a background job that reads and re-saves all encrypted records.

### 6.3 Admin API Masking

- `GET /api/admin/users` currently returns full email addresses.
- Change to return masked emails: `a]***@gmail.com` (first letter + `***` + domain).
- Admin can request full email only through a separate `GET /api/admin/users/:id/email` endpoint that requires an additional confirmation (e.g., re-authenticate or enter admin PIN).
- Log all full-email access attempts to an audit table.

### 6.4 Railway Security Notes

- Railway encrypts environment variables at rest. Even if someone gains access to the Railway dashboard, they see the values (this is by design for usability). The main protection is: Railway account security (strong password + 2FA) and team access controls.
- The `DATABASE_URL` in Railway is a connection string with credentials. If Railway is compromised, the attacker gets database access. Our field-level encryption mitigates this: even with full database access, encrypted fields are unreadable without `FIELD_ENCRYPTION_KEY`.
- Recommendation: enable 2FA on the Railway account if not already enabled. Review team member access.

### 6.5 Files to Create/Modify

| File | Action |
|------|--------|
| `backend/src/lib/fieldEncryption.js` | NEW -- encrypt/decrypt utility |
| `backend/src/lib/prismaEncryption.js` | NEW -- Prisma middleware |
| `backend/src/lib/prisma.js` | MODIFY -- attach encryption middleware |
| `backend/src/modules/admin/admin.users.controller.js` | MODIFY -- mask emails |
| `backend/prisma/schema.prisma` | MODIFY -- add emailHash column to User |
| `backend/scripts/encryptExistingData.js` | NEW -- one-time migration script |
| `backend/src/modules/auth/auth.routes.js` | MODIFY -- use emailHash for login lookup |

---

## 7. AI Rate Limit Adjustment

### 7.1 Current Limits

From `ai.constants.js`:
```
default: 30 messages/day
verified: 60 messages/day
admin: 120 messages/day
```

### 7.2 Proposed New Limits

Based on the subscription model:

```
default: 10 messages/day (free tier -- encourages upgrade)
verified: 20 messages/day (free tier with verified email)
admin: 120 messages/day (unchanged)
```

### 7.3 Changes Required

- `backend/src/modules/ai/ai.constants.js` -- update `DAILY_LIMITS` object.
- `frontend/studyhub-app/src/pages/ai/AiPage.jsx` -- update any hardcoded limit displays.
- `frontend/studyhub-app/src/components/ai/AiBubble.jsx` -- update usage bar if it references limits.
- Add a "Want more AI conversations? Upgrade to Pro" upsell message when a user hits their limit.

---

## 8. Database Migrations Required

All new tables need migration SQL files in `backend/prisma/migrations/`.

**Migration: `20260401000001_add_library_tables`**
- `BookShelf` -- user's custom book shelves.
- `ShelfBook` -- books in a shelf (stores Gutenberg ID + cached metadata).
- `ReadingProgress` -- per-user per-book reading position.
- `BookBookmark` -- bookmarks within books.
- `BookHighlight` -- highlights and annotations.

**Migration: `20260401000002_add_waitlist_table`**
- `Waitlist` -- email waitlist for subscription tiers.

**Migration: `20260401000003_add_email_hash_column`**
- `ALTER TABLE "User" ADD COLUMN "emailHash" TEXT` -- for encrypted email lookup.
- Backfill script to compute SHA-256 hashes of existing emails.

**Total: 3 new migrations, 8 new tables, 1 altered table.**

---

## 9. Railway Configuration

### 9.1 New Environment Variables

| Variable | Value | Purpose |
|----------|-------|---------|
| `FIELD_ENCRYPTION_KEY` | 64-char hex string (32 bytes) | AES-256-GCM key for field encryption |
| `FIELD_ENCRYPTION_KEY_PREV` | (empty initially) | Previous key for rotation |

### 9.2 No New Storage Attachments Needed

- Books are served from Gutendex/Open Library APIs -- we do not store book files.
- Cover images are cached in memory or proxied on-the-fly.
- No new Redis or S3 buckets required.
- All new data (shelves, bookmarks, highlights, progress) lives in the existing PostgreSQL database.

### 9.3 Build and Deploy Checklist

After code is deployed:
1. Add `FIELD_ENCRYPTION_KEY` to Railway env vars.
2. Run `npx prisma migrate deploy` for new migrations.
3. Run `node backend/scripts/encryptExistingData.js` to encrypt existing emails and messages.
4. Verify health check: `GET /api/health` returns `{ status: "healthy" }`.

---

## 10. Frontend Routing and Navigation Changes

### 10.1 New Routes in App.jsx

```
/library                --> LibraryPage
/library/:gutenbergId   --> BookDetailPage
/library/:gutenbergId/read --> BookReaderPage
/pricing                --> PricingPage
/playground             --> PlaygroundPage
```

### 10.2 Sidebar Navigation Updates

Add to `sidebarConstants.js` NAV_LINKS:

```javascript
{ icon: IconBook,       label: 'Library',        to: '/library' },
// ... existing links ...
{ icon: IconCode,       label: 'Playground',     to: '/playground',  badge: 'Soon' },
{ icon: IconPricing,    label: 'Pricing',        to: '/pricing' },
```

Library goes near the top (after Study Sheets) since it is a core feature. Playground and Pricing go near the bottom.

### 10.3 New Icons Needed

Add to `Icons.jsx`:
- `IconBook` -- open book icon for Library.
- `IconCode` -- code brackets icon for Playground.
- `IconPricing` -- tag/diamond icon for Pricing.

### 10.4 Route Announcer Updates

Add new paths to `ROUTE_TITLES` in App.jsx:
```javascript
'/library': 'Library',
'/pricing': 'Pricing',
'/playground': 'Code Playground',
```

### 10.5 Prefetch Updates

Add `/library` to the prefetch route map in `prefetch.js` so the sidebar hover pre-warms the API cache.

---

## 11. Future Feature Brainstorming (Monetization)

These are features to market on the Pricing page and develop over time:

### 11.1 Pro Tier Features (Revenue Generators)

1. **Extended AI conversations** -- 100 messages/day for Pro vs 20 for free. This is the primary conversion driver since students love the AI assistant.
2. **Document upload to AI** -- Upload PDFs, Word docs, code files, and images for AI to analyze. Free tier gets text-only input. Pro gets file uploads up to 10MB.
3. **AI study plan generator** -- AI creates a personalized study schedule based on the user's courses, upcoming exams, and reading progress. Pro-only feature.
4. **Advanced code playground** -- More saved projects, longer execution time, additional languages (Python via Pyodide/WASM).
5. **Private study groups** -- Free tier gets 2, Pro gets 10 with larger file sharing limits.
6. **Custom themes** -- Beyond dark/light mode: custom color schemes, font choices, layout density.
7. **Export to PDF** -- Export study sheets, notes, and AI conversations as formatted PDFs.
8. **Offline mode** -- Progressive Web App features to access downloaded books and saved sheets offline.
9. **Analytics dashboard** -- Personal learning analytics: study time tracking, reading velocity, topic mastery heatmap.
10. **Ad-free experience** -- If free tier ever gets minimal, non-intrusive promotions for Pro.

### 11.2 Institution Tier Features

1. **Org-wide analytics** -- Professors/admins see aggregate engagement data across their students.
2. **LMS integration** -- Connect with Canvas, Blackboard, Moodle for automatic course sync.
3. **Custom branding** -- Institution logo, colors, and domain.
4. **SSO** -- SAML/OAuth integration with university identity providers.
5. **Bulk student onboarding** -- CSV import of student rosters with automatic course enrollment.
6. **Content moderation tools** -- Institution-specific content policies and review workflows.
7. **Priority support** -- Dedicated support channel with SLA guarantees.

### 11.3 Marketplace Possibilities

1. **Premium study sheet packs** -- Verified tutors/TAs can sell curated study sheet collections.
2. **Tutor marketplace** -- Connect students with verified tutors for 1-on-1 help. Platform takes a percentage.
3. **Textbook alternatives** -- Curated open-source textbook collections organized by course.

---

## 12. Implementation Order and Session Estimates

### Recommended Build Order

| Phase | Feature | Sessions | Dependencies |
|-------|---------|----------|-------------|
| 1 | Security hardening (encryption) | 2 | None -- do this first to protect data before adding more features |
| 2 | AI rate limit adjustment | 0.5 | None |
| 3 | Admin analytics charts (Recharts) | 1-2 | None |
| 4 | Library backend (API proxy, caching, DB) | 2 | Migrations |
| 5 | Library frontend (catalog + detail page) | 2 | Phase 4 |
| 6 | Library reader (epub.js integration) | 2-3 | Phase 5 |
| 7 | Library AI reading assistant | 1 | Phase 6 |
| 8 | Pricing placeholder page | 0.5 | None |
| 9 | Playground placeholder page | 0.5 | None |
| 10 | Navigation + routing updates | 0.5 | Phases 4-9 |
| **Total** | | **12-14 sessions** | |

### Why this order?

1. **Security first:** Encrypting sensitive data before adding more sensitive data (reading habits, bookmarks) is the responsible approach.
2. **AI rate limits are a quick win** with immediate impact on the subscription narrative.
3. **Admin charts** give you visibility into platform health before the big feature launch.
4. **Library is the centerpiece** and gets the most sessions. Backend first, then catalog UI, then the reader (the most complex piece), then AI integration.
5. **Placeholder pages are quick** and can be done in half-sessions between larger work.

---

## 13. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Gutendex API goes down or changes | Low | High | Cache aggressively (1-24 hour TTLs). Implement fallback to direct Gutenberg catalog files. |
| epub.js rendering issues with certain EPUBs | Medium | Medium | Test with 20+ diverse Gutenberg EPUBs. Provide "Download instead" fallback for problematic files. |
| Field encryption breaks existing login flow | Medium | Critical | Add emailHash column before enabling encryption. Test login flow extensively. Have rollback plan (keep plaintext column temporarily). |
| Open Library rate limiting (100 req/5 min) | Medium | Low | Server-side caching with long TTLs. Only fetch cover URLs, not full API data on every request. |
| epub.js bundle size impact | Low | Low | Lazy-load epub.js only on the reader page. Use dynamic import(). |
| Database migration on large existing data | Low | Medium | Run encryption migration during low-traffic hours. Batch in groups of 1000 records. |

---

## Approval Checklist

Before proceeding with implementation, please confirm:

- [ ] Agree with the Library (BookHub) feature scope and page structure.
- [ ] Agree with the AI rate limit changes (10 default / 20 verified / 120 admin).
- [ ] Agree with the subscription tier pricing and feature breakdown.
- [ ] Agree with the security hardening approach (field-level AES-256-GCM encryption).
- [ ] Agree with Recharts as the admin chart library.
- [ ] Agree with the implementation order (security first, then AI limits, then admin charts, then library, then placeholders).
- [ ] Any features to add, remove, or reprioritize?
- [ ] Any concerns about the epub.js dependency or external API reliance?

---

*End of plan. Awaiting review and approval before any code changes begin.*
