/* ═══════════════════════════════════════════════════════════════════════════
 * ExplorePage.jsx — cross-school discovery (G2-3, "Explore").
 *
 * GitHub-Explore-inspired: a topic-chip filter row, a "Trending this week"
 * shelf, then Sheets / Notes / Study groups shelves. Read-only — distinct
 * from the school-scoped /sheets, /notes, /study-groups pages. The selected
 * topic lives in the ?topic=<topicTag> query param (URL is the source of
 * truth, per repo convention).
 *
 * Gating: the page renders unconditionally; the backend /api/explore/*
 * surface is fail-closed behind flag_explore_tab and 503s when off. The
 * data hook surfaces that as a quiet "feature unavailable" state rather
 * than an error banner.
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useSearchParams } from 'react-router-dom'
import Navbar from '../../components/navbar/Navbar'
import AppSidebar from '../../components/sidebar/AppSidebar'
import { IconBolt, IconSheets, IconNotes, IconUsers } from '../../components/Icons'
import { pageShell, useResponsiveAppLayout } from '../../lib/ui'
import { usePageTitle } from '../../lib/usePageTitle'
import ExploreTopicChips from './ExploreTopicChips'
import ExploreShelf from './ExploreShelf'
import useExploreData from './useExploreData'
import './ExplorePage.css'

export default function ExplorePage() {
  usePageTitle('Explore')
  const layout = useResponsiveAppLayout()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTopic = searchParams.get('topic') || ''

  const { topics, topicsLoading, trending, sheets, notes, groups, disabled } =
    useExploreData(activeTopic)

  const selectTopic = (topicTag) => {
    const next = new URLSearchParams(searchParams)
    if (topicTag) {
      next.set('topic', topicTag)
    } else {
      next.delete('topic')
    }
    setSearchParams(next, { replace: true })
  }

  const clearTopic = () => selectTopic('')

  const activeTopicLabel = activeTopic
    ? topics.find((t) => t.topicTag === activeTopic)?.displayName || activeTopic
    : ''

  return (
    <>
      <Navbar crumbs={[{ label: 'Explore', to: '/explore' }]} />
      <div className="explore-page sh-app-page">
        <div className="sh-ambient-shell" style={pageShell('app', 26, 48)}>
          <div className="app-two-col-grid sh-ambient-grid">
            <AppSidebar mode={layout.sidebarMode} />

            <main id="main-content" className="explore-page__main sh-ambient-main">
              <section className="sh-card explore-page__title-card">
                <h1 className="explore-page__title">Explore</h1>
                <p className="explore-page__subtitle">
                  {activeTopicLabel
                    ? `Discovering ${activeTopicLabel} across every school.`
                    : 'Discover study sheets, notes, and groups across every school — read-only.'}
                </p>
              </section>

              <ExploreTopicChips
                topics={topics}
                activeTopic={activeTopic}
                loading={topicsLoading}
                onSelect={selectTopic}
              />

              {disabled ? (
                <section className="sh-card sh-card--flat explore-page__shelf">
                  <div className="explore-page__empty">
                    <p className="explore-page__empty-text">
                      Explore is not available right now. Check back soon.
                    </p>
                  </div>
                </section>
              ) : (
                <>
                  <ExploreShelf
                    title="Trending this week"
                    icon={IconBolt}
                    kind="sheet"
                    items={trending.items}
                    loading={trending.loading}
                    activeTopic={activeTopic}
                    onClearTopic={clearTopic}
                  />
                  <ExploreShelf
                    title="Study sheets"
                    icon={IconSheets}
                    kind="sheet"
                    items={sheets.items}
                    loading={sheets.loading}
                    activeTopic={activeTopic}
                    onClearTopic={clearTopic}
                  />
                  <ExploreShelf
                    title="Notes"
                    icon={IconNotes}
                    kind="note"
                    items={notes.items}
                    loading={notes.loading}
                    activeTopic={activeTopic}
                    onClearTopic={clearTopic}
                  />
                  <ExploreShelf
                    title="Study groups"
                    icon={IconUsers}
                    kind="group"
                    items={groups.items}
                    loading={groups.loading}
                    activeTopic={activeTopic}
                    onClearTopic={clearTopic}
                  />
                </>
              )}
            </main>
          </div>
        </div>
      </div>
    </>
  )
}
