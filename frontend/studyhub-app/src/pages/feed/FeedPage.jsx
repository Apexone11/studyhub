/* ═══════════════════════════════════════════════════════════════════════════
 * FeedPage.jsx — Social feed with posts, sheet shares, and announcements
 *
 * Layout (responsive via CSS class `app-three-col-grid` in responsive.css):
 *   Desktop: sidebar (250px) | feed column (flex) | leaderboard aside (300px)
 *   Tablet:  sidebar trigger (auto) | feed | aside (280px)
 *   Phone:   single stacked column
 *
 * Features: live polling, post composer with attachments, per-course filters,
 * inline search, leaderboard panels, like/star/helpful reactions (anime.js).
 *
 * Tutorial: First-visit Joyride walkthrough highlights composer, filters,
 * search, and leaderboards. Re-trigger via floating "?" button.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Navbar from '../../components/Navbar'
import AppSidebar from '../../components/AppSidebar'
import ConfirmDialog from '../../components/ConfirmDialog'
import { IconPlus, IconUpload, IconX } from '../../components/Icons'
import { useSession } from '../../lib/session-context'
import { pageShell, useResponsiveAppLayout } from '../../lib/ui'
import { staggerEntrance } from '../../lib/animations'
import { usePageTitle } from '../../lib/usePageTitle'
import { SkeletonFeed } from '../../components/Skeleton'
import SafeJoyride from '../../components/SafeJoyride'
import { useTutorial } from '../../lib/useTutorial'
import { FEED_STEPS } from '../../lib/tutorialSteps'

import { FONT, FILTERS, COMPOSER_PROMPTS, linkButton } from './feedConstants'
import { Panel, LeaderboardPanel, EmptyFeed } from './FeedWidgets'
import FeedCard from './FeedCard'
import { useFeedData } from './useFeedData'

export default function FeedPage() {
  usePageTitle('Feed')
  const { user, clearSession } = useSession()
  const layout = useResponsiveAppLayout()
  const [searchParams, setSearchParams] = useSearchParams()

  const activeFilter = FILTERS.includes(searchParams.get('filter')) ? searchParams.get('filter') : 'all'
  const search = searchParams.get('search') || ''

  const {
    feedState,
    leaderboards,
    loadingMore,
    deletingPostIds,
    loadMoreFeed,
    toggleReaction,
    toggleStar,
    canDeletePost,
    deletePost,
    submitPost,
    retryFeed,
  } = useFeedData({ user, clearSession, search })

  const [composer, setComposer] = useState({ content: '', courseId: '' })
  const [composeState, setComposeState] = useState({ saving: false, error: '' })
  const [attachedFile, setAttachedFile] = useState(null)
  const fileInputRef = useRef(null)
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

  const [composerPromptIndex] = useState(
    () => Math.floor(Date.now() / 60000) % COMPOSER_PROMPTS.length
  )
  const composerPrompt = COMPOSER_PROMPTS[composerPromptIndex]

  useEffect(() => {
    if (!feedState.loading && visibleItems.length > 0 && feedListRef.current && !feedAnimatedRef.current) {
      feedAnimatedRef.current = true
      staggerEntrance(feedListRef.current.children, { staggerMs: 50, duration: 450, y: 16 })
    }
  }, [feedState.loading, visibleItems.length])

  const handleSubmitPost = async (event) => {
    event.preventDefault()
    if (!composer.content.trim()) {
      setComposeState({ saving: false, error: 'Write something before posting.' })
      return
    }

    setComposeState({ saving: true, error: '' })
    try {
      await submitPost({ content: composer.content, courseId: composer.courseId, attachedFile })
      setComposer({ content: '', courseId: '' })
      setAttachedFile(null)
      setComposeState({ saving: false, error: '' })
    } catch (error) {
      setComposeState({ saving: false, error: error.message || 'Could not post to the feed.' })
    }
  }

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
                <form onSubmit={handleSubmitPost} style={{ display: 'grid', gap: 12 }}>
                  <textarea
                    value={composer.content}
                    onChange={(event) => setComposer((current) => ({ ...current, content: event.target.value }))}
                    placeholder={composerPrompt}
                    rows={4}
                    className="sh-input"
                    style={{ width: '100%', resize: 'vertical', borderRadius: 'var(--radius-card)', padding: 14, font: 'inherit' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <select
                      value={composer.courseId}
                      onChange={(event) => setComposer((current) => ({ ...current, courseId: event.target.value }))}
                      className="sh-input"
                      style={{ minWidth: 140, maxWidth: 200, width: 'auto' }}
                    >
                      <option value="">All courses</option>
                      {(user?.enrollments || []).map((enrollment) => (
                        <option key={enrollment.course.id} value={enrollment.course.id}>{enrollment.course.code}</option>
                      ))}
                    </select>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.gif,.webp"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) {
                            if (file.size > 10 * 1024 * 1024) {
                              setComposeState((s) => ({ ...s, error: 'File must be under 10 MB.' }))
                              return
                            }
                            setAttachedFile(file)
                          }
                          e.target.value = ''
                        }}
                      />
                      <button type="button" onClick={() => fileInputRef.current?.click()} style={linkButton()}>
                        <IconUpload size={14} /> Attach file
                      </button>
                      <button type="submit" disabled={composeState.saving} className="sh-btn sh-btn--primary" style={{ fontWeight: 800, cursor: composeState.saving ? 'wait' : 'pointer' }}>
                        {composeState.saving ? 'Posting...' : 'Post'}
                      </button>
                    </div>
                  </div>
                  {attachedFile && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--sh-soft)', borderRadius: 8, fontSize: 12, color: 'var(--sh-subtext)' }}>
                      <IconUpload size={12} />
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{attachedFile.name}</span>
                      <span style={{ color: 'var(--sh-muted)', flexShrink: 0 }}>{(attachedFile.size / 1024).toFixed(0)} KB</span>
                      <button type="button" onClick={() => setAttachedFile(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--sh-muted)', display: 'flex', padding: 2 }}><IconX size={12} /></button>
                    </div>
                  )}
                  {composeState.error ? <div style={{ color: 'var(--sh-danger)', fontSize: 13 }}>{composeState.error}</div> : null}
                </form>
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

            <aside className="feed-aside" data-tutorial="feed-leaderboards" style={{ display: 'grid', gap: 16 }}>
              <LeaderboardPanel title="Top Starred" items={leaderboards.stars} empty="No starred sheets yet." renderLabel={(item) => item.title} />
              <LeaderboardPanel title="Most Downloaded" items={leaderboards.downloads} empty="No downloads yet." renderLabel={(item) => item.title} />
              <LeaderboardPanel title="Top Contributors" items={leaderboards.contributors} empty="No contributor activity yet." renderLabel={(item) => item.username} />
              <Panel title="Version 1 collaboration tips">
                <div style={{ display: 'grid', gap: 10, color: 'var(--sh-subtext)', fontSize: 13, lineHeight: 1.7 }}>
                  <div>Post updates with @mentions, fork a sheet before improving it, and send contributions back from your fork so the original author can review safely.</div>
                  <Link to="/sheets/upload" style={{ ...linkButton(), justifyContent: 'center' }}><IconPlus size={13} /> New Sheet</Link>
                </div>
              </Panel>
              {leaderboards.error ? <div style={{ color: 'var(--sh-danger)', fontSize: 13 }}>{leaderboards.error}</div> : null}
            </aside>
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
