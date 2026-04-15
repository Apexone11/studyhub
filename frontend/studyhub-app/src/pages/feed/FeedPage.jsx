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
import { Link, useSearchParams } from 'react-router-dom'
import Navbar from '../../components/navbar/Navbar'
import AppSidebar from '../../components/sidebar/AppSidebar'
import ConfirmDialog from '../../components/ConfirmDialog'
import ReportModal from '../../components/ReportModal'
import { useSession } from '../../lib/session-context'
import { pageShell, useResponsiveAppLayout } from '../../lib/ui'
import { usePageTitle } from '../../lib/usePageTitle'
import { SkeletonFeed } from '../../components/Skeleton'
import SafeJoyride from '../../components/SafeJoyride'
import { useTutorial } from '../../lib/useTutorial'
import { FEED_STEPS, TUTORIAL_VERSIONS } from '../../lib/tutorialSteps'
import { useOnboardingRedirect } from '../../lib/useOnboardingRedirect'

import { FONT, FILTERS } from './feedConstants'
import { Panel, EmptyFeed, GettingStartedCard } from './FeedWidgets'
import FeedComposer from './FeedComposer'
import VirtualFeedList from './VirtualFeedList'
import FeedAside from './FeedAside'
import ForYouSection from './ForYouSection'
import { useFeedData } from './useFeedData'
import { useRecentlyViewed } from '../../lib/useRecentlyViewed'
import { useStudyStatusBatch } from '../../lib/useStudyStatus'
import SchoolSuggestionBanner from './SchoolSuggestionBanner'
import GoalTriageCard from './GoalTriageCard'
import InterestChipRow from './InterestChipRow'
import { roleCopy, isSelfLearner } from '../../lib/roleCopy'

export default function FeedPage() {
  usePageTitle('Feed')
  const { user } = useSession()
  const layout = useResponsiveAppLayout()
  const [searchParams, setSearchParams] = useSearchParams()

  const activeFilter = FILTERS.includes(searchParams.get('filter'))
    ? searchParams.get('filter')
    : 'all'
  const search = searchParams.get('search') || ''
  const targetPostId = searchParams.get('post')
  const targetCommentId = searchParams.get('comment')

  const {
    feedState,
    leaderboards,
    starredUpdates,
    loadingMore,
    deletingPostIds,
    newSinceLastVisit,
    loadMoreFeed,
    toggleReaction,
    toggleStar,
    canDeletePost,
    deletePost,
    submitPost,
    retryFeed,
  } = useFeedData({ user, search })

  const [deleteTarget, setDeleteTarget] = useState(null)
  const [openPostMenuId, setOpenPostMenuId] = useState(null)
  const [reportTarget, setReportTarget] = useState(null)

  const { recentlyViewed } = useRecentlyViewed()
  const { showBanner: showOnboardingBanner, dismissBanner: dismissOnboardingBanner } =
    useOnboardingRedirect({ user })
  const tutorial = useTutorial('feed', FEED_STEPS, { version: TUTORIAL_VERSIONS.feed })

  const setQueryParam = useCallback(
    (key, value) => {
      const next = new URLSearchParams(searchParams)
      if (value) next.set(key, value)
      else next.delete(key)
      setSearchParams(next, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  // Debounced search: local input state syncs to URL param after 350ms idle.
  const [localSearch, setLocalSearch] = useState(search)
  const searchTimerRef = useRef(null)
  const handleSearchChange = useCallback(
    (value) => {
      setLocalSearch(value)
      clearTimeout(searchTimerRef.current)
      searchTimerRef.current = setTimeout(() => {
        setQueryParam('search', value)
      }, 350)
    },
    [setQueryParam],
  )
  // Sync local search state if URL changes externally (e.g. filter reset).
  useEffect(() => {
    setLocalSearch(search)
  }, [search])

  const visibleItems = useMemo(() => {
    if (activeFilter === 'all') return feedState.items
    if (activeFilter === 'videos') return feedState.items.filter((item) => item.video)
    if (activeFilter === 'posts')
      return feedState.items.filter((item) => item.type === 'post' && !item.video)
    const nextType = activeFilter === 'announcements' ? 'announcement' : activeFilter.slice(0, -1)
    return feedState.items.filter((item) => item.type === nextType)
  }, [activeFilter, feedState.items])

  const feedSheetIds = useMemo(
    () => visibleItems.filter((i) => i.type === 'sheet').map((i) => i.id),
    [visibleItems],
  )
  const feedStudyStatusMap = useStudyStatusBatch(feedSheetIds)

  useEffect(() => {
    if (!targetPostId || feedState.loading) return
    const el = document.querySelector(`[data-post-id="${targetPostId}"]`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.style.transition = 'box-shadow 0.3s'
      el.style.boxShadow = '0 0 0 3px var(--sh-info-border)'
      setTimeout(() => {
        el.style.boxShadow = ''
      }, 2000)
    }
  }, [targetPostId, feedState.loading])

  useEffect(() => {
    if (!targetCommentId || feedState.loading) return
    const el = document.querySelector(`[data-comment-id="${targetCommentId}"]`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.style.transition = 'box-shadow 0.3s'
      el.style.boxShadow = '0 0 0 3px var(--sh-info-border)'
      setTimeout(() => {
        el.style.boxShadow = ''
      }, 2000)
    }
  }, [targetCommentId, feedState.loading])

  const confirmDeletePost = useCallback(
    (item) => {
      if (!canDeletePost(item)) return
      setOpenPostMenuId(null)
      setDeleteTarget(item)
    },
    [canDeletePost],
  )

  const handleDeletePost = useCallback(
    async (item) => {
      setDeleteTarget(null)
      await deletePost(item)
    },
    [deletePost],
  )

  const handleReport = useCallback((type, id) => setReportTarget({ type, id }), [])

  return (
    <>
      <Navbar />
      <div
        className="sh-app-page"
        style={{ background: 'var(--sh-page-bg)', minHeight: '100vh', fontFamily: FONT }}
      >
        <div className="sh-ambient-shell" style={pageShell('app', 26, 48)}>
          <div className="app-three-col-grid sh-ambient-grid">
            <AppSidebar mode={layout.sidebarMode} />

            <main
              className="sh-ambient-main feed-page__main"
              id="main-content"
              style={{ display: 'grid', gap: 18 }}
            >
              <GettingStartedCard user={user} />
              {isSelfLearner(user?.accountType) ? <GoalTriageCard /> : null}
              {isSelfLearner(user?.accountType) ? <InterestChipRow /> : null}
              <SchoolSuggestionBanner user={user} />
              {showOnboardingBanner && (
                <div
                  style={{
                    background: 'var(--sh-info-bg)',
                    border: '1px solid var(--sh-info-border)',
                    borderRadius: 12,
                    padding: '14px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    fontFamily: FONT,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: 'var(--sh-text)',
                        marginBottom: 2,
                      }}
                    >
                      You are almost set up
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--sh-text-secondary)' }}>
                      Continue where you left off
                    </div>
                  </div>
                  <Link
                    to="/onboarding"
                    style={{
                      background: 'var(--sh-brand)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 8,
                      padding: '7px 16px',
                      fontSize: 13,
                      fontWeight: 700,
                      textDecoration: 'none',
                      whiteSpace: 'nowrap',
                      fontFamily: FONT,
                    }}
                  >
                    Resume setup
                  </Link>
                  <button
                    type="button"
                    onClick={dismissOnboardingBanner}
                    aria-label="Dismiss onboarding banner"
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 18,
                      color: 'var(--sh-text-secondary)',
                      padding: '2px 4px',
                      lineHeight: 1,
                      fontFamily: FONT,
                    }}
                  >
                    &#x2715;
                  </button>
                </div>
              )}
              {newSinceLastVisit > 0 && activeFilter !== 'for-you' ? (
                <div
                  style={{
                    background: 'var(--sh-info-bg)',
                    border: '1px solid var(--sh-info-border)',
                    borderRadius: 12,
                    padding: '10px 14px',
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--sh-brand)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span style={{ fontSize: 15 }}>&#9679;</span>
                  {newSinceLastVisit} new {newSinceLastVisit === 1 ? 'post' : 'posts'} since your
                  last visit
                </div>
              ) : null}
              {activeFilter !== 'for-you' && (
                <div data-tutorial="feed-composer">
                  <Panel
                    title={roleCopy('composerTitle', user?.accountType)}
                    helper={roleCopy('composerHelper', user?.accountType)}
                  >
                    <FeedComposer user={user} onSubmitPost={submitPost} />
                  </Panel>
                </div>
              )}

              <div className="feed-page__toolbar">
                <div className="feed-page__filters" data-tutorial="feed-filters">
                  {FILTERS.map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setQueryParam('filter', filter === 'all' ? '' : filter)}
                      className={`sh-chip${filter === activeFilter ? ' sh-chip--active' : ''}`}
                    >
                      {filter.replace('for-you', 'For You')}
                    </button>
                  ))}
                </div>
                {activeFilter !== 'for-you' && (
                  <>
                    <label htmlFor="feed-search" className="sr-only">
                      Search the feed
                    </label>
                    <input
                      id="feed-search"
                      className="sh-input feed-page__search"
                      data-tutorial="feed-search"
                      aria-label="Search the feed"
                      value={localSearch}
                      onChange={(event) => handleSearchChange(event.target.value)}
                      placeholder="Search the feed..."
                    />
                  </>
                )}
              </div>

              {activeFilter === 'for-you' ? (
                <ForYouSection onSwitchToAll={() => setQueryParam('filter', '')} />
              ) : (
                <>
                  {feedState.partial ? (
                    <div
                      style={{
                        background: 'var(--sh-warning-bg)',
                        color: 'var(--sh-warning-text)',
                        border: '1px solid var(--sh-warning-border)',
                        borderRadius: 14,
                        padding: '12px 14px',
                        fontSize: 13,
                        lineHeight: 1.6,
                      }}
                    >
                      Feed loaded in reduced mode. {feedState.degradedSections.join(', ')}.
                    </div>
                  ) : null}

                  {feedState.error ? (
                    <div
                      style={{
                        background: 'var(--sh-danger-bg)',
                        color: 'var(--sh-danger-text)',
                        border: '1px solid var(--sh-danger)',
                        borderRadius: 14,
                        padding: '12px 14px',
                        fontSize: 13,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                      }}
                    >
                      <span>{feedState.error}</span>
                      <button
                        onClick={retryFeed}
                        style={{
                          background: 'var(--sh-danger)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 8,
                          padding: '6px 14px',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          fontFamily: FONT,
                        }}
                      >
                        Retry
                      </button>
                    </div>
                  ) : null}

                  {feedState.loading ? (
                    <SkeletonFeed count={3} />
                  ) : visibleItems.length === 0 ? (
                    <EmptyFeed
                      message={
                        feedState.items.length === 0 && !search
                          ? 'Your feed is empty'
                          : 'No feed items matched this filter.'
                      }
                      isFirstRun={feedState.items.length === 0 && !search}
                      accountType={user?.accountType}
                    />
                  ) : (
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
                      studyStatusMap={feedStudyStatusMap}
                    />
                  )}
                </>
              )}
            </main>

            <FeedAside
              leaderboards={leaderboards}
              starredUpdates={starredUpdates}
              recentlyViewed={recentlyViewed}
              accountType={user?.accountType}
            />
          </div>
        </div>
      </div>
      <SafeJoyride {...tutorial.joyrideProps} />
      {tutorial.seen && (
        <button
          type="button"
          onClick={tutorial.restart}
          title="Show tutorial"
          style={{
            position: 'fixed',
            bottom: 88,
            right: 24,
            width: 44,
            height: 44,
            borderRadius: '50%',
            border: 'none',
            background: 'var(--sh-brand)',
            color: '#fff',
            fontSize: 18,
            fontWeight: 800,
            cursor: 'pointer',
            boxShadow: 'var(--sh-btn-primary-shadow)',
            zIndex: 50,
            display: 'grid',
            placeItems: 'center',
            fontFamily: FONT,
          }}
        >
          ?
        </button>
      )}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete this post?"
        message="This action cannot be undone. The post and any attachments will be permanently removed."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => deleteTarget && handleDeletePost(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />
      <ReportModal
        open={reportTarget !== null}
        targetType={reportTarget?.type}
        targetId={reportTarget?.id}
        onClose={() => setReportTarget(null)}
      />
    </>
  )
}
