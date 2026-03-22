import { Link } from 'react-router-dom'
import Navbar from '../../components/Navbar'
import AppSidebar from '../../components/AppSidebar'
import { IconUpload } from '../../components/Icons'
import { pageShell, useResponsiveAppLayout } from '../../lib/ui'
import { usePageTitle } from '../../lib/usePageTitle'
import { SkeletonSheetGrid } from '../../components/Skeleton'
import SafeJoyride from '../../components/SafeJoyride'
import { useTutorial } from '../../lib/useTutorial'
import { SHEETS_STEPS } from '../../lib/tutorialSteps'
import SheetListRow from './SheetListItem'
import SheetsFilters from './SheetsFilters'
import useSheetsData from './useSheetsData'
import './SheetsPage.css'

export default function SheetsPage() {
  usePageTitle('Study Sheets')
  const layout = useResponsiveAppLayout()
  const tutorial = useTutorial('sheets', SHEETS_STEPS)

  const {
    user,
    navigate,
    search,
    schoolId,
    courseId,
    mine,
    starred,
    sortValue,
    formatValue,
    catalog,
    catalogError,
    sheetsState,
    loadingMore,
    mobileFiltersOpen,
    setMobileFiltersOpen,
    forkingSheetId,
    cardsRef,
    activeSchool,
    availableCourses,
    subtitle,
    hasActiveFilters,
    setQueryParam,
    handleSchoolChange,
    clearAllFilters,
    toggleStar,
    handleFork,
    loadMoreSheets,
  } = useSheetsData()

  return (
    <>
      <Navbar />
      <div className="sheets-page">
        <div style={pageShell('app', 26, 48)}>
          <div className="app-three-col-grid">
            <AppSidebar mode={layout.sidebarMode} />

            <main id="main-content" className="sheets-page__main">
              <section className="sh-card sheets-page__title-card">
                <div className="sheets-page__title-row">
                  <div>
                    <h1 className="sheets-page__title">Study Sheets</h1>
                    <p className="sheets-page__subtitle">{subtitle}</p>
                  </div>
                  <Link data-tutorial="sheets-upload" to="/sheets/upload" className="sh-btn sh-btn--primary sheets-page__upload-cta">
                    <IconUpload size={14} />
                    Upload a sheet
                  </Link>
                </div>
              </section>

              <SheetsFilters
                search={search}
                schoolId={schoolId}
                courseId={courseId}
                sortValue={sortValue}
                formatValue={formatValue}
                mine={mine}
                starred={starred}
                mobileFiltersOpen={mobileFiltersOpen}
                setMobileFiltersOpen={setMobileFiltersOpen}
                catalog={catalog}
                activeSchool={activeSchool}
                availableCourses={availableCourses}
                setQueryParam={setQueryParam}
                handleSchoolChange={handleSchoolChange}
              />

              {catalogError ? <div className="sh-alert sh-alert--danger">{catalogError}</div> : null}
              {sheetsState.error ? <div className="sh-alert sh-alert--danger">{sheetsState.error}</div> : null}

              {sheetsState.loading ? (
                <SkeletonSheetGrid count={4} />
              ) : sheetsState.sheets.length === 0 ? (
                <section className="sh-card sheets-page__empty-state">
                  {search.trim() ? (
                    <>
                      <h2 className="sheets-page__empty-title">No results for &ldquo;{search}&rdquo;</h2>
                      <p className="sheets-page__empty-copy">
                        Try another query or clear your filters to scan the full sheet index.
                      </p>
                      <button type="button" className="sh-btn sh-btn--secondary" onClick={clearAllFilters}>
                        Clear filters
                      </button>
                    </>
                  ) : hasActiveFilters ? (
                    <>
                      <h2 className="sheets-page__empty-title">No sheets matched your filters</h2>
                      <p className="sheets-page__empty-copy">
                        Your current filters are too narrow. Clear them to return to the full list.
                      </p>
                      <button type="button" className="sh-btn sh-btn--secondary" onClick={clearAllFilters}>
                        Clear filters
                      </button>
                    </>
                  ) : mine ? (
                    <>
                      <h2 className="sheets-page__empty-title">No sheets yet</h2>
                      <p className="sheets-page__empty-copy">
                        You haven&rsquo;t uploaded any sheets yet. Upload your notes or start with a template.
                      </p>
                      <div className="sheets-page__empty-actions">
                        <Link to="/sheets/upload?new=1" className="sh-btn sh-btn--primary">
                          <IconUpload size={14} />
                          Upload a sheet
                        </Link>
                      </div>
                    </>
                  ) : (
                    <>
                      <h2 className="sheets-page__empty-title">Be the first to share for this space</h2>
                      <p className="sheets-page__empty-copy">
                        No published sheets yet. Upload your notes or start with a template to kick off the course repo.
                      </p>
                      <div className="sheets-page__empty-actions">
                        <Link to="/sheets/upload" className="sh-btn sh-btn--primary">
                          <IconUpload size={14} />
                          Upload a sheet
                        </Link>
                        <Link to="/sheets/upload?template=starter" className="sh-btn sh-btn--secondary">
                          Use a template
                        </Link>
                      </div>
                    </>
                  )}
                </section>
              ) : (
                <section className="sh-card sh-card--flat sh-card--flush sheets-page__list-shell">
                  <div className="sheets-page__list-head">
                    <span>{sheetsState.total} sheet{sheetsState.total === 1 ? '' : 's'}</span>
                    {hasActiveFilters ? (
                      <button type="button" className="sh-btn sh-btn--ghost sh-btn--sm" onClick={clearAllFilters}>
                        Clear filters
                      </button>
                    ) : null}
                  </div>

                  <div ref={cardsRef} className="sheets-page__rows" role="list">
                    {sheetsState.sheets.map((sheet) => (
                      <SheetListRow
                        key={sheet.id}
                        sheet={sheet}
                        forking={forkingSheetId === sheet.id}
                        onOpen={(sheetId) => {
                          const s = sheetsState.sheets.find((x) => x.id === sheetId)
                          if (s && s.status === 'draft') {
                            navigate(`/sheets/upload?draft=${sheetId}`)
                          } else {
                            navigate(`/sheets/${sheetId}`)
                          }
                        }}
                        onStar={toggleStar}
                        onFork={handleFork}
                      />
                    ))}
                  </div>

                  {sheetsState.sheets.length < sheetsState.total ? (
                    <div className="sheets-page__load-more-wrap">
                      <button onClick={loadMoreSheets} disabled={loadingMore} className="sh-load-more-btn">
                        {loadingMore
                          ? 'Loading...'
                          : `Load More (${sheetsState.sheets.length} of ${sheetsState.total})`}
                      </button>
                    </div>
                  ) : null}
                </section>
              )}
            </main>

            <aside className="feed-aside sheets-page__aside">
              <section className="sh-card">
                <h2 className="sh-card-title">Quick view</h2>
                <p className="sh-card-helper">Live index context</p>
                <div className="sheets-page__aside-stats">
                  <div>{sheetsState.total} sheets found</div>
                  <div>{catalog.length} schools available</div>
                  <div>{user?.enrollments?.length || 0} courses in your profile</div>
                </div>
              </section>

              <section className="sh-card">
                <h2 className="sh-card-title">Workflow</h2>
                <p className="sheets-page__aside-copy">
                  Use the filters to narrow the repo list, open a sheet row, then fork or star from the same view.
                </p>
                <Link to="/feed" className="sh-btn sh-btn--secondary sh-btn--sm">
                  Back to feed
                </Link>
              </section>
            </aside>
          </div>
        </div>
      </div>

      <SafeJoyride {...tutorial.joyrideProps} />
      {tutorial.seen ? (
        <button type="button" onClick={tutorial.restart} title="Show tutorial" className="sheets-page__tutorial-btn">
          ?
        </button>
      ) : null}
    </>
  )
}
