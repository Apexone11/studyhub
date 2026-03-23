/* ═══════════════════════════════════════════════════════════════════════════
 * FeedPage.jsx — Social feed shell (thin orchestrator)
 *
 * Layout (responsive via CSS class `app-three-col-grid` in responsive.css):
 *   Desktop: sidebar (250px) | feed column (flex) | leaderboard aside (300px)
 *   Tablet:  sidebar trigger (auto) | feed | aside (280px)
 *   Phone:   single stacked column
 *
 * Components: FeedComposer, FeedCard, FeedAside, FeedWidgets
 * Data: useFeedData
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Navbar from '../../components/Navbar'
import AppSidebar from '../../components/AppSidebar'
import ConfirmDialog from '../../components/ConfirmDialog'
import { useSession } from '../../lib/session-context'
import { pageShell, useResponsiveAppLayout } from '../../lib/ui'
import { staggerEntrance } from '../../lib/animations'
import { usePageTitle } from '../../lib/usePageTitle'
import { SkeletonFeed } from '../../components/Skeleton'
import SafeJoyride from '../../components/SafeJoyride'
import { useTutorial } from '../../lib/useTutorial'
import { FEED_STEPS } from '../../lib/tutorialSteps'

import { FONT, FILTERS } from './feedConstants'
import { Panel, EmptyFeed } from './FeedWidgets'
import FeedComposer from './FeedComposer'
import FeedCard from './FeedCard'
import FeedAside from './FeedAside'
import { useFeedData } from './useFeedData'

export default function FeedPage() {
  usePageTitle('Feed')
  const { user, clearSession } = useSession()
  const layout = useResponsiveAppLayout()
  const [searchParams, setSearchParams] = useSearchParams()

  const activeFilter = FILTERS.includes(searchParams.get('filter')) ? searchParams.get('filter') : 'all'
  const search = searchParams.get('search') || ''

  const {
    feedState, leaderboards, loadingMore, deletingPostIds,
    loadMoreFeed, toggleReaction, toggleStar,
    canDeletePost, deletePost, submitPost, retryFeed,
  } = useFeedData({ user, clearSession, search })

  const feedListRef = useRef(null)
  const feedAnimatedRef = useRef(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [openPostMenuId, setOpenPostMenuId] = useState(null)

  const tutorial = useTutorial('feed', FEED_STEPS)

  const setQueryParam = useCallback((key, value) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  const visibleItems = useMemo(() => {
    if (activeFilter === 'all') return feedState.items
    const nextType = activeFilter === 'announcements' ? 'announcement' : activeFilter.slice(0, -1)
    return feedState.items.filter((item) => item.type === nextType)
  }, [activeFilter, feedState.items])

  useEffect(() => {
    if (!feedState.loading && visibleItems.length > 0 && feedListRef.current && !feedAnimatedRef.current) {
      feedAnimatedRef.current = true
      staggerEntrance(feedListRef.current.children, { staggerMs: 50, duration: 450, y: 16 })
    }
  }, [feedState.loading, visibleItems.length])

  const confirmDeletePost = (item) => {
    if (!canDeletePost(item)) return
    setOpenPostMenuId(null)
    setDeleteTarget(item)
  }

  const handleDeletePost = async (item) => {
    setDeleteTarget(null)
    await deletePost(item)
  }

  return (
    <>
      <Navbar />
      <div style={{ background: 'var(--sh-page-bg)', minHeight: '100vh', fontFamily: FONT }}>
        <div style={pageShell('app', 26, 48)}>
          <div className="app-three-col-grid">
            <AppSidebar mode={layout.sidebarMode} />

            <main id="main-content" style={{ display: 'grid', gap: 18 }}>
              <div data-tutorial="feed-composer">
                <Panel title="Share with your classmates" helper="Post class notes, course questions, or links to your latest sheet.">
                  <FeedComposer user={user} onSubmitPost={submitPost} />
                </Panel>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div data-tutorial="feed-filters" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {FILTERS.map((filter) => (
                    <button key={filter} type="button" onClick={() => setQueryParam('filter', filter === 'all' ? '' : filter)} className={`sh-chip${filter === activeFilter ? ' sh-chip--active' : ''}`}>
                      {filter}
                    </button>
                  ))}
                </div>
                <input data-tutorial="feed-search" value={search} onChange={(event) => setQueryParam('search', event.target.value)} placeholder="Search the feed..." className="sh-input" style={{ maxWidth: 240 }} />
              </div>

              {feedState.partial ? (
                <div style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', borderRadius: 14, padding: '12px 14px', fontSize: 13, lineHeight: 1.6 }}>
                  Feed loaded in reduced mode. {feedState.degradedSections.join(', ')}.
                </div>
              ) : null}

              {feedState.error ? (
                <div style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 14, padding: '12px 14px', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <span>{feedState.error}</span>
                  <button onClick={retryFeed} style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: FONT }}>Retry</button>
                </div>
              ) : null}

              {feedState.loading ? (
                <SkeletonFeed count={3} />
              ) : visibleItems.length === 0 ? (
                <EmptyFeed message="No feed items matched this filter." />
              ) : (
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
                    />
                  ))}
                  {feedState.items.length < feedState.total && (
                    <button onClick={loadMoreFeed} disabled={loadingMore} className="sh-load-more-btn">
                      {loadingMore ? 'Loading…' : `Load More (${feedState.items.length} of ${feedState.total})`}
                    </button>
                  )}
                </div>
              )}
            </main>

            <FeedAside leaderboards={leaderboards} />
          </div>
        </div>
      </div>
      <SafeJoyride {...tutorial.joyrideProps} />
      {tutorial.seen && (
        <button type="button" onClick={tutorial.restart} title="Show tutorial" style={{ position: 'fixed', bottom: 24, right: 24, width: 44, height: 44, borderRadius: '50%', border: 'none', background: 'var(--sh-brand)', color: '#fff', fontSize: 18, fontWeight: 800, cursor: 'pointer', boxShadow: 'var(--sh-btn-primary-shadow)', zIndex: 50, display: 'grid', placeItems: 'center', fontFamily: FONT }}>
          ?
        </button>
      )}
      <ConfirmDialog open={deleteTarget !== null} title="Delete this post?" message="This action cannot be undone. The post and any attachments will be permanently removed." confirmLabel="Delete" cancelLabel="Cancel" variant="danger" onConfirm={() => deleteTarget && handleDeletePost(deleteTarget)} onCancel={() => setDeleteTarget(null)} />
    </>
  )
}
