# S-10.3 Frontend Performance + UI Jank Cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate feed rendering jank, add list virtualization, memoize heavy components, make Sheet/Note viewers content-first with deferred comments, and verify improvements via existing PostHog `page_timing` telemetry.

**Architecture:** Three sub-cycles working outward from the highest-traffic page (Feed) to viewer pages, then verifying with telemetry. Feed gets `@tanstack/react-virtual` for the item list, `React.memo` on FeedCard, and stable callback references. Sheet/Note viewers get deferred (lazy-expanded) comment sections. All pages already emit `page_timing` events — S-10.3.3 adds a dev-mode performance overlay so we can eyeball timing without opening PostHog.

**Tech Stack:** React 19, @tanstack/react-virtual, React.memo, useCallback, PostHog (existing), Vitest

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `frontend/studyhub-app/src/pages/feed/VirtualFeedList.jsx` | Virtualizer wrapper — owns `useVirtualizer`, overscan, scroll container, renders FeedCard rows by index |
| `frontend/studyhub-app/src/pages/feed/VirtualFeedList.test.jsx` | Unit tests for VirtualFeedList rendering and load-more trigger |
| `frontend/studyhub-app/src/pages/feed/FeedCard.test.jsx` | Unit tests for FeedCard memoization contract |
| `frontend/studyhub-app/src/components/PerfOverlay.jsx` | Dev-only floating overlay showing last `page_timing` event values |

### Modified files
| File | Change |
|------|--------|
| `frontend/studyhub-app/package.json` | Add `@tanstack/react-virtual` dependency |
| `frontend/studyhub-app/src/pages/feed/FeedCard.jsx` | Wrap export in `React.memo` with custom comparator |
| `frontend/studyhub-app/src/pages/feed/FeedPage.jsx` | Replace `.map()` grid with `<VirtualFeedList>`, stabilize callback props with `useCallback` |
| `frontend/studyhub-app/src/pages/feed/useFeedData.js` | Stabilize `toggleReaction`, `toggleStar`, `canDeletePost` with `useCallback` |
| `frontend/studyhub-app/src/pages/sheets/SheetViewerPage.jsx` | Wrap comment section in lazy expand (collapsed by default, load on expand) |
| `frontend/studyhub-app/src/pages/notes/NoteViewerPage.jsx` | Already lazy via NoteCommentSection expand — no change needed |
| `frontend/studyhub-app/src/lib/usePageTiming.js` | Expose last timing values for PerfOverlay |
| `frontend/studyhub-app/src/App.jsx` | Mount `<PerfOverlay />` in dev mode |

---

## Task 1: Install @tanstack/react-virtual

**Files:**
- Modify: `frontend/studyhub-app/package.json`

- [ ] **Step 1: Install the dependency**

```bash
cd "frontend/studyhub-app" && npm install @tanstack/react-virtual
```

- [ ] **Step 2: Verify installation**

```bash
cd "frontend/studyhub-app" && node -e "require('@tanstack/react-virtual'); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 3: Run lint to confirm no issues**

```bash
npm --prefix frontend/studyhub-app run lint
```

Expected: PASS (no new errors)

- [ ] **Step 4: Commit**

```bash
git add frontend/studyhub-app/package.json frontend/studyhub-app/package-lock.json
git commit -m "chore: add @tanstack/react-virtual for feed virtualization"
```

---

## Task 2: Memoize FeedCard with React.memo

**Files:**
- Modify: `frontend/studyhub-app/src/pages/feed/FeedCard.jsx`
- Create test: `frontend/studyhub-app/src/pages/feed/FeedCard.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/studyhub-app/src/pages/feed/FeedCard.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import FeedCard from './FeedCard'

const baseItem = {
  id: 1,
  feedKey: 'sheet-1',
  type: 'sheet',
  title: 'Test Sheet',
  body: 'Some content',
  createdAt: new Date().toISOString(),
  author: { id: 1, username: 'alice' },
  stars: 5,
  starred: false,
  reactions: { likes: 0, dislikes: 0, userReaction: null },
}

const noop = () => {}

function renderCard(props = {}) {
  return render(
    <MemoryRouter>
      <FeedCard
        item={baseItem}
        onReact={noop}
        onStar={noop}
        onDeletePost={noop}
        canDeletePost={false}
        isPostMenuOpen={false}
        onTogglePostMenu={noop}
        isDeletingPost={false}
        currentUser={null}
        onReport={noop}
        targetCommentId={null}
        {...props}
      />
    </MemoryRouter>,
  )
}

describe('FeedCard', () => {
  it('renders sheet card with title and stars', () => {
    renderCard()
    expect(screen.getByText('Test Sheet')).toBeInTheDocument()
    expect(screen.getByText('5 stars')).toBeInTheDocument()
  })

  it('is wrapped in React.memo (displayName check)', () => {
    // React.memo components have a $$typeof of Symbol.for('react.memo')
    expect(FeedCard).toHaveProperty('$$typeof', Symbol.for('react.memo'))
  })
})
```

- [ ] **Step 2: Run test to verify the memo check fails**

```bash
npm --prefix frontend/studyhub-app run test -- --run FeedCard.test
```

Expected: FAIL — `FeedCard` is a plain function, not a memo wrapper.

- [ ] **Step 3: Wrap FeedCard in React.memo**

In `frontend/studyhub-app/src/pages/feed/FeedCard.jsx`, change the export from:

```javascript
export default function FeedCard({
```

to a named function + memo export:

```javascript
import { memo } from 'react'
```

(add `memo` to the top of the file)

Then at the bottom, replace:

```javascript
export default function FeedCard({
  item,
  onReact,
  onStar,
  onDeletePost,
  canDeletePost,
  isPostMenuOpen,
  onTogglePostMenu,
  isDeletingPost,
  currentUser,
  onReport,
  targetCommentId,
}) {
```

with:

```javascript
function FeedCardInner({
  item,
  onReact,
  onStar,
  onDeletePost,
  canDeletePost,
  isPostMenuOpen,
  onTogglePostMenu,
  isDeletingPost,
  currentUser,
  onReport,
  targetCommentId,
}) {
```

And at the very end of the file, replace `}` (closing brace of the component) with:

```javascript
}

function feedCardPropsAreEqual(prev, next) {
  return (
    prev.item === next.item
    && prev.canDeletePost === next.canDeletePost
    && prev.isPostMenuOpen === next.isPostMenuOpen
    && prev.isDeletingPost === next.isDeletingPost
    && prev.currentUser === next.currentUser
    && prev.targetCommentId === next.targetCommentId
  )
}

const FeedCard = memo(FeedCardInner, feedCardPropsAreEqual)
export default FeedCard
```

The comparator skips callback props (`onReact`, `onStar`, `onDeletePost`, `onTogglePostMenu`, `onReport`) because we will stabilize them with `useCallback` in Task 4. For now it compares the data props that actually change.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm --prefix frontend/studyhub-app run test -- --run FeedCard.test
```

Expected: PASS (both tests green)

- [ ] **Step 5: Run lint**

```bash
npm --prefix frontend/studyhub-app run lint
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/studyhub-app/src/pages/feed/FeedCard.jsx frontend/studyhub-app/src/pages/feed/FeedCard.test.jsx
git commit -m "perf(feed): wrap FeedCard in React.memo with custom comparator"
```

---

## Task 3: Stabilize callback props in useFeedData and FeedPage

**Files:**
- Modify: `frontend/studyhub-app/src/pages/feed/useFeedData.js`
- Modify: `frontend/studyhub-app/src/pages/feed/FeedPage.jsx`

- [ ] **Step 1: Stabilize `toggleReaction` and `toggleStar` in useFeedData.js**

Both `toggleReaction` and `toggleStar` are currently plain `async` functions (not wrapped in `useCallback`). They close over `feedState` which changes on every render. We need to convert them to `useCallback` with functional state updates so they don't depend on `feedState`.

In `frontend/studyhub-app/src/pages/feed/useFeedData.js`, replace the `toggleReaction` function (lines 176-204):

```javascript
  const toggleReaction = useCallback(async (item, type) => {
    const currentType = item.reactions?.userReaction || null
    const nextType = currentType === type ? null : type
    const endpoint = item.type === 'post' ? `${API}/api/feed/posts/${item.id}/react` : `${API}/api/sheets/${item.id}/react`

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ type: nextType }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(getApiErrorMessage(data, 'Could not update the reaction.'))
      }

      setFeedState((current) => ({
        ...current,
        items: current.items.map((entry) => (
          entry.feedKey === item.feedKey
            ? { ...entry, reactions: data }
            : entry
        )),
      }))
    } catch (error) {
      setFeedState((current) => ({ ...current, error: error.message || 'Could not update the reaction.' }))
    }
  }, [])
```

Replace the `toggleStar` function (lines 206-229):

```javascript
  const toggleStar = useCallback(async (item) => {
    try {
      const response = await fetch(`${API}/api/sheets/${item.id}/star`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(getApiErrorMessage(data, 'Could not update the star.'))
      }

      setFeedState((current) => ({
        ...current,
        items: current.items.map((entry) => (
          entry.feedKey === item.feedKey
            ? { ...entry, starred: data.starred, stars: data.stars }
            : entry
        )),
      }))
    } catch (error) {
      setFeedState((current) => ({ ...current, error: error.message || 'Could not update the star.' }))
    }
  }, [])
```

Both already use functional `setFeedState` updates, so the `[]` dependency array is correct — `API` and `authHeaders` are module-level constants.

- [ ] **Step 2: Stabilize callback props in FeedPage.jsx**

In `frontend/studyhub-app/src/pages/feed/FeedPage.jsx`, the `confirmDeletePost` function (line 105) is currently a plain function. Wrap it:

Replace:
```javascript
  const confirmDeletePost = (item) => {
    if (!canDeletePost(item)) return
    setOpenPostMenuId(null)
    setDeleteTarget(item)
  }
```

with:
```javascript
  const confirmDeletePost = useCallback((item) => {
    if (!canDeletePost(item)) return
    setOpenPostMenuId(null)
    setDeleteTarget(item)
  }, [canDeletePost])
```

Also wrap `handleDeletePost`:

Replace:
```javascript
  const handleDeletePost = async (item) => {
    setDeleteTarget(null)
    await deletePost(item)
  }
```

with:
```javascript
  const handleDeletePost = useCallback(async (item) => {
    setDeleteTarget(null)
    await deletePost(item)
  }, [deletePost])
```

Stabilize the inline `onReport` arrow in the FeedCard render. Replace:
```javascript
                      onReport={(type, id) => setReportTarget({ type, id })}
```

with a stable callback defined above the return:
```javascript
  const handleReport = useCallback((type, id) => setReportTarget({ type, id }), [])
```

And use it in the JSX:
```javascript
                      onReport={handleReport}
```

- [ ] **Step 3: Run lint**

```bash
npm --prefix frontend/studyhub-app run lint
```

Expected: PASS

- [ ] **Step 4: Run existing tests**

```bash
npm --prefix frontend/studyhub-app run test -- --run
```

Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add frontend/studyhub-app/src/pages/feed/useFeedData.js frontend/studyhub-app/src/pages/feed/FeedPage.jsx
git commit -m "perf(feed): stabilize callback props with useCallback for memo compatibility"
```

---

## Task 4: Build VirtualFeedList component

**Files:**
- Create: `frontend/studyhub-app/src/pages/feed/VirtualFeedList.jsx`
- Create: `frontend/studyhub-app/src/pages/feed/VirtualFeedList.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/studyhub-app/src/pages/feed/VirtualFeedList.test.jsx`:

```jsx
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

// Mock @tanstack/react-virtual since jsdom has no layout engine
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, i) => ({
        index: i,
        key: `vitem-${i}`,
        start: i * 200,
        size: 200,
      })),
    getTotalSize: () => count * 200,
    measureElement: () => {},
  }),
}))

// Must import AFTER mock is set up
const { default: VirtualFeedList } = await import('./VirtualFeedList')

afterEach(() => { cleanup() })

const makeItems = (n) => Array.from({ length: n }, (_, i) => ({
  id: i + 1,
  feedKey: `sheet-${i + 1}`,
  type: 'sheet',
  title: `Sheet ${i + 1}`,
  body: 'content',
  createdAt: new Date().toISOString(),
  author: { id: 1, username: 'alice' },
  stars: 0,
  starred: false,
  reactions: { likes: 0, dislikes: 0, userReaction: null },
}))

const noop = () => {}

describe('VirtualFeedList', () => {
  it('renders the correct number of virtualized items', () => {
    const items = makeItems(5)
    render(
      <MemoryRouter>
        <VirtualFeedList
          items={items}
          hasMore={false}
          loadingMore={false}
          onLoadMore={noop}
          onReact={noop}
          onStar={noop}
          onDeletePost={noop}
          canDeletePost={() => false}
          openPostMenuId={null}
          onTogglePostMenu={noop}
          deletingPostIds={{}}
          currentUser={null}
          onReport={noop}
          targetCommentId={null}
        />
      </MemoryRouter>,
    )

    expect(screen.getAllByRole('article')).toHaveLength(5)
  })

  it('shows Load More button when hasMore is true', () => {
    const items = makeItems(2)
    render(
      <MemoryRouter>
        <VirtualFeedList
          items={items}
          hasMore={true}
          loadingMore={false}
          onLoadMore={noop}
          onReact={noop}
          onStar={noop}
          onDeletePost={noop}
          canDeletePost={() => false}
          openPostMenuId={null}
          onTogglePostMenu={noop}
          deletingPostIds={{}}
          currentUser={null}
          onReport={noop}
          targetCommentId={null}
        />
      </MemoryRouter>,
    )

    expect(screen.getByRole('button', { name: /load more/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm --prefix frontend/studyhub-app run test -- --run VirtualFeedList.test
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement VirtualFeedList**

Create `frontend/studyhub-app/src/pages/feed/VirtualFeedList.jsx`:

```jsx
import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import FeedCard from './FeedCard'

export default function VirtualFeedList({
  items,
  hasMore,
  loadingMore,
  onLoadMore,
  onReact,
  onStar,
  onDeletePost,
  canDeletePost,
  openPostMenuId,
  onTogglePostMenu,
  deletingPostIds,
  currentUser,
  onReport,
  targetCommentId,
}) {
  const scrollRef = useRef(null)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 200,
    overscan: 3,
    gap: 14,
  })

  return (
    <div
      ref={scrollRef}
      style={{
        height: '100%',
        maxHeight: 'calc(100vh - 120px)',
        overflow: 'auto',
        contain: 'strict',
      }}
    >
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const item = items[virtualRow.index]
          return (
            <div
              key={item.feedKey}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <FeedCard
                item={item}
                onReact={onReact}
                onStar={onStar}
                onDeletePost={onDeletePost}
                canDeletePost={canDeletePost(item)}
                isPostMenuOpen={openPostMenuId === item.id}
                onTogglePostMenu={onTogglePostMenu}
                isDeletingPost={Boolean(deletingPostIds[item.id])}
                currentUser={currentUser}
                onReport={onReport}
                targetCommentId={targetCommentId}
              />
            </div>
          )
        })}
      </div>

      {hasMore && (
        <button
          onClick={onLoadMore}
          disabled={loadingMore}
          className="sh-load-more-btn"
          style={{ marginTop: 14 }}
        >
          {loadingMore ? 'Loading...' : 'Load More'}
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm --prefix frontend/studyhub-app run test -- --run VirtualFeedList.test
```

Expected: PASS

- [ ] **Step 5: Run lint**

```bash
npm --prefix frontend/studyhub-app run lint
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/studyhub-app/src/pages/feed/VirtualFeedList.jsx frontend/studyhub-app/src/pages/feed/VirtualFeedList.test.jsx
git commit -m "feat(feed): add VirtualFeedList component with @tanstack/react-virtual"
```

---

## Task 5: Integrate VirtualFeedList into FeedPage

**Files:**
- Modify: `frontend/studyhub-app/src/pages/feed/FeedPage.jsx`

- [ ] **Step 1: Replace the .map() grid with VirtualFeedList**

In `frontend/studyhub-app/src/pages/feed/FeedPage.jsx`:

Add the import at the top (after `FeedCard` import):
```javascript
import VirtualFeedList from './VirtualFeedList'
```

Replace the entire block (lines 181-203):
```jsx
                <div ref={feedListRef} style={{ display: 'grid', gap: 14 }}>
                  {visibleItems.map((item) => (
                    <FeedCard
                      key={item.feedKey}
                      item={item}
                      onReact={toggleReaction}
                      onStar={toggleStar}
                      onDeletePost={confirmDeletePost}
                      canDeletePost={canDeletePost(item)}
                      isPostMenuOpen={openPostMenuId === item.id}
                      onTogglePostMenu={setOpenPostMenuId}
                      isDeletingPost={Boolean(deletingPostIds[item.id])}
                      currentUser={user}
                      onReport={(type, id) => setReportTarget({ type, id })}
                      targetCommentId={targetCommentId}
                    />
                  ))}
                  {feedState.items.length < feedState.total && (
                    <button onClick={loadMoreFeed} disabled={loadingMore} className="sh-load-more-btn">
                      {loadingMore ? 'Loading...' : `Load More (${feedState.items.length} of ${feedState.total})`}
                    </button>
                  )}
                </div>
```

with:
```jsx
                <VirtualFeedList
                  items={visibleItems}
                  hasMore={feedState.items.length < feedState.total}
                  loadingMore={loadingMore}
                  onLoadMore={loadMoreFeed}
                  onReact={toggleReaction}
                  onStar={toggleStar}
                  onDeletePost={confirmDeletePost}
                  canDeletePost={canDeletePost}
                  openPostMenuId={openPostMenuId}
                  onTogglePostMenu={setOpenPostMenuId}
                  deletingPostIds={deletingPostIds}
                  currentUser={user}
                  onReport={handleReport}
                  targetCommentId={targetCommentId}
                />
```

Note: `canDeletePost` is now passed as a function reference (not called inline), since `VirtualFeedList` calls it per-row. The `handleReport` callback was stabilized in Task 3.

Remove the now-unused `FeedCard` direct import if VirtualFeedList handles it internally. Keep the import only if FeedCard is used elsewhere in FeedPage (it is not after this change).

Remove:
```javascript
import FeedCard from './FeedCard'
```

Also update the stagger entrance effect. The `feedListRef` is no longer used for the `.map()` grid. The virtualizer manages its own DOM, so the stagger animation is no longer compatible. Remove the `feedListRef` and `feedAnimatedRef` refs and the stagger useEffect (lines 54-55 and 76-81):

Remove:
```javascript
  const feedListRef = useRef(null)
  const feedAnimatedRef = useRef(false)
```

Remove:
```javascript
  useEffect(() => {
    if (!feedState.loading && visibleItems.length > 0 && feedListRef.current && !feedAnimatedRef.current) {
      feedAnimatedRef.current = true
      staggerEntrance(feedListRef.current.children, { staggerMs: 50, duration: 450, y: 16 })
    }
  }, [feedState.loading, visibleItems.length])
```

Remove the `staggerEntrance` import if no longer used:
```javascript
import { staggerEntrance } from '../../lib/animations'
```

And clean up the `useRef` import — remove `useRef` from the React import if `feedListRef` was the only ref usage. Check: `feedListRef` and `feedAnimatedRef` were the only refs. Remove `useRef` from the import:

```javascript
import { useCallback, useEffect, useMemo, useState } from 'react'
```

- [ ] **Step 2: Run lint**

```bash
npm --prefix frontend/studyhub-app run lint
```

Expected: PASS

- [ ] **Step 3: Run all tests**

```bash
npm --prefix frontend/studyhub-app run test -- --run
```

Expected: All tests pass

- [ ] **Step 4: Run build**

```bash
npm --prefix frontend/studyhub-app run build
```

Expected: PASS — confirms no import/tree-shaking issues

- [ ] **Step 5: Commit**

```bash
git add frontend/studyhub-app/src/pages/feed/FeedPage.jsx
git commit -m "perf(feed): integrate VirtualFeedList, remove stagger animation for virtualized list"
```

---

## Task 6: Defer SheetViewerPage comment section

**Files:**
- Modify: `frontend/studyhub-app/src/pages/sheets/SheetViewerPage.jsx`

The NoteViewerPage already has a lazy-expand comment pattern via `NoteCommentSection` (collapsed by default, loads on expand). The SheetViewerPage currently renders its comment section inline and always-visible. We'll wrap it in a collapse/expand toggle matching the existing feed CommentSection pattern.

- [ ] **Step 1: Add collapse state and toggle to SheetViewerPage comments**

In `frontend/studyhub-app/src/pages/sheets/SheetViewerPage.jsx`, find the comment section (around line 432):

```jsx
              <section data-tutorial="viewer-comments" style={panelStyle()}>
                <h2 style={{ margin: '0 0 12px', fontSize: 18, color: 'var(--sh-heading)' }}>
                  Comments{commentsState.total > 0 ? ` (${commentsState.total})` : ''}
                </h2>
                <form onSubmit={submitComment} style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
```

Replace the `<h2>` with a clickable toggle:

```jsx
              <section data-tutorial="viewer-comments" style={panelStyle()}>
                <button
                  type="button"
                  onClick={() => setCommentsExpanded((v) => !v)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                    margin: '0 0 12px', fontSize: 18, fontWeight: 800,
                    color: 'var(--sh-heading)', fontFamily: FONT,
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}
                >
                  <span style={{ fontSize: 12 }}>{commentsExpanded ? '\u25BE' : '\u25B8'}</span>
                  Comments{commentsState.total > 0 ? ` (${commentsState.total})` : ''}
                </button>
                {commentsExpanded && (
                  <>
```

And close the conditional before `</section>`:

```jsx
                  </>
                )}
              </section>
```

Add the state at the top of the component (after existing `useState` calls around line 75):

```javascript
  const [commentsExpanded, setCommentsExpanded] = useState(false)
```

- [ ] **Step 2: Run lint**

```bash
npm --prefix frontend/studyhub-app run lint
```

Expected: PASS

- [ ] **Step 3: Run build**

```bash
npm --prefix frontend/studyhub-app run build
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/studyhub-app/src/pages/sheets/SheetViewerPage.jsx
git commit -m "perf(sheet): defer comment section with collapse toggle for content-first rendering"
```

---

## Task 7: Add dev-mode PerfOverlay component

**Files:**
- Create: `frontend/studyhub-app/src/components/PerfOverlay.jsx`
- Modify: `frontend/studyhub-app/src/lib/usePageTiming.js`
- Modify: `frontend/studyhub-app/src/App.jsx`

This gives developers a floating badge showing the last `page_timing` values (apiLatencyMs, timeToContentMs) without opening PostHog. It only renders in dev mode.

- [ ] **Step 1: Extend usePageTiming to expose last values**

In `frontend/studyhub-app/src/lib/usePageTiming.js`, add a module-level observable for the overlay to subscribe to.

Add after the imports (line 2):

```javascript
/** Last reported timing — exposed for dev overlay. */
let _lastTiming = null
export function getLastPageTiming() { return _lastTiming }
```

Then inside the `markContentVisible` callback, right after the `trackEvent` call (after line 70):

```javascript
    _lastTiming = { page: pageName, apiLatencyMs, timeToContentMs, ts: Date.now() }
```

- [ ] **Step 2: Create PerfOverlay**

Create `frontend/studyhub-app/src/components/PerfOverlay.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { getLastPageTiming } from '../lib/usePageTiming'

export default function PerfOverlay() {
  const [timing, setTiming] = useState(null)

  useEffect(() => {
    const interval = setInterval(() => {
      const latest = getLastPageTiming()
      if (latest && latest !== timing) setTiming({ ...latest })
    }, 1000)
    return () => clearInterval(interval)
  }, [timing])

  if (!timing) return null

  const age = Math.round((Date.now() - timing.ts) / 1000)
  if (age > 30) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 72,
        left: 12,
        zIndex: 99999,
        background: 'rgba(15, 23, 42, 0.9)',
        color: '#e2e8f0',
        fontSize: 11,
        fontFamily: 'monospace',
        padding: '6px 10px',
        borderRadius: 8,
        lineHeight: 1.6,
        pointerEvents: 'none',
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 2 }}>{timing.page}</div>
      <div>API: {timing.apiLatencyMs ?? '—'}ms</div>
      <div>TTC: {timing.timeToContentMs ?? '—'}ms</div>
    </div>
  )
}
```

- [ ] **Step 3: Mount PerfOverlay in App.jsx (dev only)**

In `frontend/studyhub-app/src/App.jsx`, add a conditional import and render.

Add after the existing lazy imports (around line 43):

```javascript
const PerfOverlay = import.meta.env?.DEV ? lazy(() => import('./components/PerfOverlay')) : null
```

Then inside the `<BrowserRouter>` (after `<ToastContainer />`, line 214):

```jsx
        {PerfOverlay && <Suspense fallback={null}><PerfOverlay /></Suspense>}
```

Note: `lazy` and `Suspense` are already imported at the top of App.jsx.

- [ ] **Step 4: Run lint**

```bash
npm --prefix frontend/studyhub-app run lint
```

Expected: PASS

- [ ] **Step 5: Run build**

```bash
npm --prefix frontend/studyhub-app run build
```

Expected: PASS — PerfOverlay should be tree-shaken out of production build since it's gated on `import.meta.env?.DEV`.

- [ ] **Step 6: Commit**

```bash
git add frontend/studyhub-app/src/components/PerfOverlay.jsx frontend/studyhub-app/src/lib/usePageTiming.js frontend/studyhub-app/src/App.jsx
git commit -m "feat(perf): add dev-only PerfOverlay showing page_timing metrics"
```

---

## Task 8: Final validation + release log

**Files:**
- Modify: `docs/beta-v1.7.0-release-log.md`

- [ ] **Step 1: Run full lint**

```bash
npm --prefix frontend/studyhub-app run lint
```

Expected: PASS

- [ ] **Step 2: Run full test suite**

```bash
npm --prefix frontend/studyhub-app run test -- --run
```

Expected: All tests pass

- [ ] **Step 3: Run production build**

```bash
npm --prefix frontend/studyhub-app run build
```

Expected: PASS

- [ ] **Step 4: Update release log**

Append an S-10.3 section to `docs/beta-v1.7.0-release-log.md` documenting:

- S-10.3.1: Feed virtualization with `@tanstack/react-virtual`, FeedCard `React.memo`, stable callbacks via `useCallback`
- S-10.3.2: SheetViewerPage comment section deferred behind collapse toggle (NoteViewerPage already had this pattern)
- S-10.3.3: Dev-mode PerfOverlay added for `page_timing` visibility, `usePageTiming` extended with `getLastPageTiming()`
- Verification: lint clean, tests green, build passes

- [ ] **Step 5: Commit**

```bash
git add docs/beta-v1.7.0-release-log.md
git commit -m "docs: add S-10.3 frontend performance cycle to release log"
```
