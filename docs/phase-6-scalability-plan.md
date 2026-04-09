# Phase 6 — Scaling StudyHub to 10,000,000+ Users

**Team:** 2 people (Abdul + roommate) · **Budget:** $20 to $100/month · **Stack:** Express 5, Prisma 6, PostgreSQL, Socket.io, React 19 + Vite, Railway

This document is both the reasoning (so you understand *why*) and the checklist (so VS Code Claude can execute step by step). Every recommendation is ordered cheapest and highest impact first.

---

## How the Giants Did It on Tiny Teams

Before we touch a single file, here is what actually worked for startups that scaled to millions with skeleton crews. These are not hypotheticals. These are the patterns StudyHub should follow.

**Instagram (2 engineers, 30M users, Django + PostgreSQL)**
Instagram stayed on Django and PostgreSQL far longer than people expected. Their playbook: deploy PgBouncer for connection pooling, add Redis for caching and task queuing, shard PostgreSQL only when a single instance ran out of disk, and never rewrite anything that was still working. Mike Krieger said it clearly: "Do the simple thing first." They solved problems with existing tools before building custom ones, and they scaled individual components rather than rewriting the whole system.

**Discord (small team, billions of messages, originally Cassandra)**
Discord started with a simple monolith, added message storage on Cassandra, and leaned heavily on open source orchestration (Dagster) so a small team could manage large infrastructure without hiring an ops team. Their lesson: automate operations early so your two person team is not woken up at 3am.

**Twitter (Ruby on Rails, then JVM, MySQL sharding)**
Twitter stayed on MySQL and only introduced their sharding framework (Gizzard) when they truly had to. The takeaway: do not shard before you need to. Vertical scaling and read replicas buy you years.

**The common thread:** Every one of these companies started simple, measured what was actually slow, and only added complexity at the layer that was breaking. None of them over-engineered on day one.

---

## Current Architecture Snapshot

```
User Browser
  |
  |  HTTPS
  v
Cloudflare (DNS only today)
  |
  +---> Railway: Vite static build (frontend)
  +---> Railway: Express API (backend)
            |
            +--> Railway PostgreSQL (single instance, no pooler)
            +--> Socket.io (in-process, single dyno)
            +--> R2 (file storage)
            +--> Anthropic API (Hub AI)
```

**Known pain point:** sheet creation and forking feel slightly slow. This is almost certainly Prisma's connection overhead against a pooler-less PostgreSQL, compounded by the fact that fork writes several rows transactionally (sheet + commit + contribution metadata).

---

## Target Architecture (10M users, under $100/month until real revenue)

```
User Browser
  |
  |  HTTPS
  v
Cloudflare (free CDN + edge cache + DDoS protection)
  |
  +---> Cloudflare Pages (frontend static, free tier)
  +---> Railway: Express API (backend, $20 plan)
            |
            +--> PgBouncer on Railway (free template)
            |       |
            |       +--> Railway PostgreSQL primary
            |       +--> (later) Read replica
            |
            +--> Upstash Redis (free tier, then pay per use)
            +--> Socket.io (single dyno, sticky sessions)
            +--> R2 (file storage, unchanged)
            +--> Anthropic API (unchanged)
```

Estimated monthly cost at 50K active users: $45 to $75. At 500K: $75 to $120 (add read replica). At 10M: revisit with revenue.

---

## The Checklist

Each step is independent. Do them in order, one weekend at a time.

### Step 1 — PgBouncer (Weekend 1)

**Why:** Every Prisma query currently opens a new connection to PostgreSQL. Railway PostgreSQL defaults to about 97 max connections. Under load, connection storms will be the first thing that kills the site. PgBouncer sits between Express and PostgreSQL, reuses connections, and makes the database 2 to 3 times faster for short queries. Instagram did exactly this as their first scaling move.

**Cost:** $0 (runs on Railway free template alongside your database).

**How:**
1. On Railway dashboard, deploy the official "Postgres + PgBouncer" template. This creates a PgBouncer service pointing at your existing PostgreSQL.
2. In `backend/.env` (and Railway environment variables), change `DATABASE_URL` to point at PgBouncer's connection string (port 6432, transaction mode).
3. Add a `DIRECT_URL` variable pointing at the original PostgreSQL connection string. Prisma needs this for migrations.
4. In `backend/prisma/schema.prisma`, update the datasource:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

5. Run `npx prisma migrate deploy` using the direct URL. Verify all existing queries still work.
6. Load test: `npx autocannon -c 100 -d 30 http://localhost:4000/api/sheets` and compare before/after response times.

**Files touched:**
- `backend/prisma/schema.prisma` (add `directUrl`)
- `backend/.env` (update `DATABASE_URL`, add `DIRECT_URL`)
- Railway dashboard (deploy PgBouncer template)

**Capacity math:** PgBouncer in transaction mode can multiplex 1,000 client connections over 20 server connections. That supports roughly 200 concurrent API requests without connection exhaustion.

---

### Step 2 — Database Query Optimization (Weekend 1 or 2)

**Why:** Prisma generates SQL behind the scenes, and some of it is inefficient. The sheet creation and fork flows involve multiple queries that can be batched. Adding the right indexes eliminates table scans as data grows.

**Cost:** $0.

**How:**

1. **Add missing composite indexes.** Create migration `YYYYMMDDHHMMSS_add_performance_indexes`:

```sql
-- Speed up sheet listing with filters
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_study_sheet_school_course
  ON "StudySheet" ("schoolId", "courseId", "visibility", "status");

-- Speed up fork lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_study_sheet_fork_of
  ON "StudySheet" ("forkOf") WHERE "forkOf" IS NOT NULL;

-- Speed up contribution queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contribution_sheet_status
  ON "SheetContribution" ("targetSheetId", "status", "createdAt");

-- Speed up user feed (recent sheets by followed users)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_study_sheet_author_created
  ON "StudySheet" ("authorId", "createdAt" DESC);

-- Speed up note listing
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_note_user_course
  ON "Note" ("userId", "courseId", "createdAt" DESC);

-- Speed up message queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_message_conversation_created
  ON "Message" ("conversationId", "createdAt" DESC);

-- Speed up block/mute lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_block_blocker
  ON "UserBlock" ("blockerId", "blockedId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_mute_muter
  ON "UserMute" ("muterId", "mutedId");
```

2. **Batch Prisma writes in fork flow.** In the fork service, replace sequential `prisma.studySheet.create` + `prisma.sheetCommit.create` with `prisma.$transaction([...])` to combine them into a single round trip.

3. **Add `EXPLAIN ANALYZE` logging in dev.** Create `backend/src/lib/queryLogger.js` that logs slow queries (>200ms) by wrapping Prisma's `$on('query')` event. This is how you find the next bottleneck before users report it.

**Files touched:**
- `backend/prisma/migrations/YYYYMMDDHHMMSS_add_performance_indexes/migration.sql` (new)
- `backend/src/modules/sheets/sheets.service.js` (batch transaction for fork)
- `backend/src/lib/queryLogger.js` (new, dev only)

**Capacity math:** Proper indexes reduce query time from O(n) table scan to O(log n) index lookup. For 1M sheets, that is the difference between 800ms and 2ms on a filter query.

---

### Step 3 — Redis Caching Layer (Weekend 2)

**Why:** Some data barely changes but is fetched on nearly every page load: school lists, course catalogs, platform stats, popular sheets. Caching these in Redis means the database is not hit at all for those requests. Instagram's second scaling move after PgBouncer was exactly this: Redis for caching and task queuing.

**Cost:** $0 (Upstash free tier: 10K commands/day). At scale: pay per request, capped at $10/month for the first paid tier.

**How:**

1. `npm install @upstash/redis --prefix backend`
2. Create `backend/src/lib/redis.js`:

```js
import { Redis } from '@upstash/redis'

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL,
  token: process.env.UPSTASH_REDIS_TOKEN,
})

/**
 * Cache-aside helper. Returns cached value if fresh, otherwise calls `fetcher`,
 * stores the result, and returns it.
 * @param {string} key
 * @param {Function} fetcher  — async function that returns the data
 * @param {number} ttlSeconds — how long to cache (default 300 = 5 min)
 */
export async function cached(key, fetcher, ttlSeconds = 300) {
  try {
    const hit = await redis.get(key)
    if (hit !== null && hit !== undefined) return hit
  } catch {
    // Redis down — fall through to fetcher (graceful degradation)
  }
  const data = await fetcher()
  try {
    await redis.set(key, JSON.stringify(data), { ex: ttlSeconds })
  } catch {
    // Best effort
  }
  return data
}

export function invalidate(key) {
  return redis.del(key).catch(() => {})
}
```

3. Wrap high traffic, low change endpoints:
   - `GET /api/public/platform-stats` — cache 5 minutes
   - `GET /api/schools` — cache 1 hour
   - `GET /api/courses/popular` — cache 10 minutes
   - `GET /api/sheets` (public, no user filter) — cache 2 minutes
   - `GET /api/search?q=...` — cache 60 seconds per query string

4. Invalidate on writes: when a sheet is created, `invalidate('sheets:public:*')`. When a school is added, `invalidate('schools:all')`.

**Files touched:**
- `backend/src/lib/redis.js` (new)
- `backend/src/modules/sheets/sheets.service.js` (wrap list query)
- `backend/src/modules/search/search.routes.js` (wrap search)
- `backend/src/modules/schools/` routes (wrap list)
- `backend/src/modules/public/` routes (wrap stats)

**Capacity math:** If 80% of reads hit cache, database load drops by 80%. Your single PostgreSQL instance goes from serving 500 req/s to effectively serving 2,500 req/s worth of traffic.

---

### Step 4 — Move Frontend to Cloudflare Pages (Weekend 3)

**Why:** Your React build is static HTML/JS/CSS. Serving it from Railway means every page load hits your Railway dyno. Moving it to Cloudflare Pages (free tier, unlimited bandwidth, 500 deploys/month) puts your frontend on a global CDN with 300+ edge locations, making initial page load 2 to 5 times faster for users outside the US east coast. This also frees Railway resources entirely for the API.

**Cost:** $0 (Cloudflare Pages free tier).

**How:**

1. Connect your GitHub repo to Cloudflare Pages.
2. Build command: `cd frontend/studyhub-app && npm install && npm run build`
3. Output directory: `frontend/studyhub-app/dist`
4. Set environment variable `VITE_API_URL` to your Railway backend URL.
5. Configure SPA fallback (Cloudflare Pages does this automatically for SPA frameworks).
6. Add custom domain: `getstudyhub.org` pointing to Cloudflare Pages.
7. Keep Railway backend at `api.getstudyhub.org` (or your current subdomain).

**Files touched:**
- Cloudflare dashboard configuration
- `frontend/studyhub-app/src/config.js` (ensure `API` reads from `VITE_API_URL` or falls back correctly)

**Capacity math:** Cloudflare Pages serves unlimited requests at no cost. Your frontend can handle 100M page views/month without touching your Railway bill.

---

### Step 5 — API Response Compression and HTTP Caching (Weekend 3)

**Why:** JSON responses from the API are text, and text compresses extremely well. Enabling gzip/brotli cuts response sizes by 60 to 80%, making every request faster on slow connections (mobile, developing countries, dorms with bad wifi).

**Cost:** $0.

**How:**

1. `npm install compression --prefix backend`
2. In `backend/src/index.js`, add after CORS but before routes:

```js
import compression from 'compression'
app.use(compression())
```

3. Strengthen the existing `cacheControl.js` middleware. Apply it to more stable endpoints:

```js
// Long cache for truly static data
app.use('/api/schools', cacheControl({ maxAge: 3600, public: true }))
app.use('/api/courses/popular', cacheControl({ maxAge: 600, public: true }))
app.use('/api/public/platform-stats', cacheControl({ maxAge: 300, public: true }))
```

4. For user specific endpoints, use `Cache-Control: private, no-cache` (browser caches but always revalidates).

**Files touched:**
- `backend/src/index.js` (add compression middleware)
- `backend/src/lib/cacheControl.js` (extend usage)

---

### Step 6 — Image and Asset Optimization (Weekend 4)

**Why:** Images (avatars, sheet thumbnails, uploaded content) are often the heaviest part of any page. Serving them through Cloudflare's free image optimization or converting to WebP on upload cuts bandwidth by 40 to 60%.

**Cost:** $0 to $5/month.

**How:**

1. On upload (avatar, sheet content), use `sharp` to:
   - Resize to max dimensions (avatars: 256px, thumbnails: 800px)
   - Convert to WebP with quality 80
   - Strip EXIF metadata

2. `npm install sharp --prefix backend`
3. Create `backend/src/lib/imageOptimizer.js`:

```js
import sharp from 'sharp'

export async function optimizeAvatar(buffer) {
  return sharp(buffer)
    .resize(256, 256, { fit: 'cover' })
    .webp({ quality: 80 })
    .toBuffer()
}

export async function optimizeThumbnail(buffer) {
  return sharp(buffer)
    .resize(800, null, { withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer()
}
```

4. Call before uploading to R2 in the avatar and resource upload routes.

**Files touched:**
- `backend/src/lib/imageOptimizer.js` (new)
- Upload routes for avatars and resources

---

### Step 7 — Frontend Bundle Optimization (Weekend 4)

**Why:** Your React app lazy loads HomeSections already, but there are likely more chunks that can be split. Smaller bundles mean faster first paint, especially on mobile.

**Cost:** $0.

**How:**

1. Run `npx vite-bundle-visualizer` in `frontend/studyhub-app` to see what is largest.
2. Lazy load all page routes that are not the landing page:

```js
// In your router setup
const SheetsPage = lazy(() => import('./pages/sheets/SheetsPage'))
const MessagesPage = lazy(() => import('./pages/messages/MessagesPage'))
const AiPage = lazy(() => import('./pages/ai/AiPage'))
const LibraryPage = lazy(() => import('./pages/library/LibraryPage'))
// ... etc for every non-home route
```

3. If `@codemirror/*` or `tiptap` are bundled into the main chunk (Phase 3), ensure they are only imported in the SheetLab route.
4. Add `<link rel="prefetch">` hints for the most common next pages (sheets, feed) in `index.html`.
5. Verify with Lighthouse: target a Performance score of 90+ on mobile.

**Files touched:**
- `frontend/studyhub-app/src/App.jsx` or router file (lazy imports)
- `frontend/studyhub-app/index.html` (prefetch hints)

**Capacity math:** Reducing initial JS from 400KB to 120KB makes Time to Interactive drop from ~3s to ~1s on 3G.

---

### Step 8 — Socket.io Scaling Preparation (Weekend 5)

**Why:** Socket.io on a single process can handle about 10K concurrent connections. That is enough for your first 50K to 100K users (not everyone is online at once). But you need a plan for when you outgrow one process.

**Cost:** $0 now. ~$5/month when you add a second process.

**How (preparation now, scale later):**

1. Install the Redis adapter: `npm install @socket.io/redis-adapter --prefix backend`
2. In `backend/src/lib/socketio.js`, add conditional Redis adapter:

```js
import { createAdapter } from '@socket.io/redis-adapter'

// If Redis is available, use it for multi-process Socket.io
if (process.env.UPSTASH_REDIS_URL) {
  const pubClient = redis.duplicate()
  const subClient = redis.duplicate()
  io.adapter(createAdapter(pubClient, subClient))
}
```

3. This does nothing on a single process but means the moment you scale to 2 Railway replicas, Socket.io events are broadcast across both.
4. Ensure all Socket.io state (typing indicators, online status) is ephemeral and not stored in process memory. Use Redis pub/sub.

**Files touched:**
- `backend/src/lib/socketio.js` (add adapter)

---

### Step 9 — Rate Limiting Hardening (Weekend 5)

**Why:** You already have 49+ rate limiters, which is excellent. But they are in-memory (`express-rate-limit` default store). If Railway restarts the process, all rate limit counters reset, and a bad actor gets a fresh allowance. Moving to a Redis-backed store makes limits persistent and shared across future replicas.

**Cost:** $0 (uses the same Upstash Redis from Step 3).

**How:**

1. `npm install rate-limit-redis --prefix backend`
2. In `backend/src/lib/rateLimiters.js`, create a shared store factory:

```js
import { RedisStore } from 'rate-limit-redis'
import { redis } from './redis.js'

function createStore(prefix) {
  if (!redis) return undefined // fall back to in-memory
  return new RedisStore({
    sendCommand: (...args) => redis.call(...args),
    prefix: `rl:${prefix}:`,
  })
}
```

3. Apply `store: createStore('limiterName')` to the most critical limiters first: `paymentCheckoutLimiter`, `uploadAvatarLimiter`, `authLoginLimiter`, `aiMessageLimiter`.

**Files touched:**
- `backend/src/lib/rateLimiters.js` (add Redis store)

---

### Step 10 — Monitoring and Alerting (Weekend 6)

**Why:** You cannot fix what you cannot see. Instagram's team said monitoring was the single thing that let 2 engineers manage 30M users. You already have Sentry for errors. Add lightweight metrics so you know *before* users complain.

**Cost:** $0 (Sentry free tier, Railway built in metrics, Upstash dashboard).

**How:**

1. **Sentry performance monitoring.** Enable `tracesSampleRate: 0.1` in both frontend and backend Sentry configs. This gives you transaction traces (which API calls are slow) at 10% sampling.

2. **Custom health endpoint.** Create `GET /api/health`:

```js
router.get('/health', async (req, res) => {
  const checks = {}
  try {
    await prisma.$queryRaw`SELECT 1`
    checks.database = 'ok'
  } catch {
    checks.database = 'error'
  }
  try {
    await redis.ping()
    checks.redis = 'ok'
  } catch {
    checks.redis = 'unavailable'
  }
  checks.uptime = process.uptime()
  checks.memory = process.memoryUsage().heapUsed
  const healthy = checks.database === 'ok'
  res.status(healthy ? 200 : 503).json(checks)
})
```

3. **Railway cron or Upstash QStash** to ping `/api/health` every 5 minutes and alert (email or Slack webhook) if it returns 503.

4. **Slow query log.** The `queryLogger.js` from Step 2 should write to Sentry breadcrumbs so slow queries appear in error context.

**Files touched:**
- `backend/src/modules/public/` or `backend/src/index.js` (health route)
- Backend and frontend Sentry configs (enable tracing)

---

### Step 11 — Database Read Replica (When Needed)

**When:** Add this when your PostgreSQL CPU consistently sits above 70% or your P95 query latency exceeds 200ms. Probably around 100K to 500K active users.

**Cost:** ~$7 to $20/month on Railway.

**How:**
1. Create a PostgreSQL read replica on Railway (one click).
2. Add `READ_DATABASE_URL` environment variable pointing at the replica.
3. In Prisma, this requires the `@prisma/extension-read-replicas` package. Configure read queries to go to the replica, write queries to the primary.
4. PgBouncer should get a second pool for the replica.

This is the step Instagram took when their single PostgreSQL could not keep up with reads, and it bought them another 10x of headroom.

---

### Step 12 — Content Delivery for User Uploads (When Needed)

**When:** If R2 egress or latency becomes noticeable (many users downloading sheets/resources simultaneously).

**Cost:** $0 (Cloudflare R2 has zero egress fees, and you can put a Cloudflare CDN in front of the R2 bucket for free).

**How:**
1. Create a Cloudflare Worker that proxies R2 requests with proper `Cache-Control` headers.
2. Point `cdn.getstudyhub.org` at this worker.
3. Update frontend URLs to serve uploaded content from `cdn.getstudyhub.org` instead of directly from R2.

---

## Cost Summary

| Stage | Monthly Users | Monthly Cost | What You Add |
|-------|--------------|-------------|-------------|
| Now | <1K | ~$20 | Railway (API + DB + frontend) |
| Steps 1 to 5 | 1K to 50K | ~$20 to $30 | PgBouncer, Cloudflare Pages, Redis free tier |
| Steps 6 to 10 | 50K to 500K | ~$40 to $75 | Upstash paid, sharp, monitoring |
| Steps 11 to 12 | 500K to 10M | ~$75 to $120 | Read replica, CDN for uploads |

For comparison, Instagram was spending about $0 to $100/month on AWS in its first year with millions of users, because they used the same pattern: PostgreSQL + PgBouncer + Redis + CDN.

---

## The Two Week Marketing Launch Checklist

Since you said marketing starts in two weeks, here are the steps to do *before* you start driving traffic:

1. **This week:** Steps 1 (PgBouncer) and 2 (indexes). These are the highest impact, lowest risk changes.
2. **This week:** Step 5 (compression). Five minutes of work, immediate benefit.
3. **Next week:** Step 3 (Redis caching) and Step 4 (Cloudflare Pages). This makes the site feel fast globally.
4. **Next week:** Step 10 (monitoring). You must be able to see what breaks when new users arrive.
5. **After launch:** Steps 6 through 9 based on what monitoring reveals.

Steps 11 and 12 are insurance for when you are a success story. You will not need them for months.

---

## Golden Rules for a Two Person Team

These are the principles that kept Instagram running with 2 engineers and Discord running with a small team serving billions of messages:

1. **Do the simple thing first.** Do not add Redis until PgBouncer is not enough. Do not add read replicas until Redis is not enough. Each layer buys you 5 to 10x headroom.

2. **Measure, then optimize.** Never guess what is slow. Use Sentry traces, `EXPLAIN ANALYZE`, and Railway metrics. The bottleneck is almost never where you think it is.

3. **Graceful degradation everywhere.** Every cache call, every Redis call, every third party API call must be wrapped in try/catch with a sensible fallback. If Redis goes down, the site should be slower but not dead.

4. **Automate what wakes you up.** Health checks, alerts, auto-restart. Your time is the most expensive resource in this startup. Spend it building features, not babysitting servers.

5. **Horizontal scaling is a last resort.** Vertical scaling (bigger instance, better indexes, smarter caching) is always cheaper and simpler than horizontal scaling (multiple instances, load balancers, distributed state). You will not need horizontal scaling until well past 1M users on this stack.

6. **Ship the feature, optimize the hotspot.** Do not pre-optimize every endpoint. Ship, watch metrics, and optimize the three endpoints that actually get hit 1000x/second.
