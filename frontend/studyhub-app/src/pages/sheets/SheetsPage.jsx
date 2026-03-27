/* ═══════════════════════════════════════════════════════════════════════════
 * SheetsPage.jsx — Study sheets listing (thin orchestrator)
 *
 * Components: SheetsFilters, SheetsEmptyState, SheetsAside, SheetListItem
 * Data: useSheetsData
 * ═══════════════════════════════════════════════════════════════════════════ */
import { Link } from 'react-router-dom'
import Navbar from '../../components/navbar/Navbar'
import AppSidebar from '../../components/sidebar/AppSidebar'
import { IconUpload } from '../../components/Icons'
import { pageShell, useResponsiveAppLayout } from '../../lib/ui'
import { usePageTitle } from '../../lib/usePageTitle'
import { SkeletonSheetGrid } from '../../components/Skeleton'
import SafeJoyride from '../../components/SafeJoyride'
import { useTutorial } from '../../lib/useTutorial'
import { SHEETS_STEPS, TUTORIAL_VERSIONS } from '../../lib/tutorialSteps'
import SheetListRow from './SheetListItem'
import SheetsFilters from './SheetsFilters'
import SheetsEmptyState from './SheetsEmptyState'
import SheetsAside from './SheetsAside'
import useSheetsData from './useSheetsData'
import './SheetsPage.css'

export default function SheetsPage() {
  usePageTitle('Study Sheets')
  const layout = useResponsiveAppLayout()
  const tutorial = useTutorial('sheets', SHEETS_STEPS, { version: TUTORIAL_VERSIONS.sheets })

  const {
    user, navigate,
    search, schoolId, courseId, mine, starred, statusFilter,
    sortValue, formatValue,
    catalog, catalogError, sheetsState, loadingMore,
    mobileFiltersOpen, setMobileFiltersOpen,
    forkingSheetId, cardsRef,
    activeSchool, availableCourses, selectedCourse,
    popularCourses, recentCourses,
    subtitle, hasActiveFilters,
    setQueryParam, handleSchoolChange, handleCourseFilter, toggleMine, clearAllFilters,
    toggleStar, handleFork, loadMoreSheets,
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
                search={search} schoolId={schoolId} courseId={courseId}
                sortValue={sortValue} formatValue={formatValue}
                mine={mine} starred={starred} statusFilter={statusFilter}
                mobileFiltersOpen={mobileFiltersOpen} setMobileFiltersOpen={setMobileFiltersOpen}
                catalog={catalog} activeSchool={activeSchool} availableCourses={availableCourses}
                setQueryParam={setQueryParam} handleSchoolChange={handleSchoolChange} toggleMine={toggleMine}
              />

              {catalogError ? <div className="sh-alert sh-alert--danger">{catalogError}</div> : null}
              {sheetsState.error ? <div className="sh-alert sh-alert--danger">{sheetsState.error}</div> : null}

              {sheetsState.loading ? (
                <SkeletonSheetGrid count={4} />
              ) : sheetsState.sheets.length === 0 ? (
                <SheetsEmptyState
                  search={search} hasActiveFilters={hasActiveFilters}
                  mine={mine} statusFilter={statusFilter} clearAllFilters={clearAllFilters}
                  selectedCourse={selectedCourse}
                />
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

            <SheetsAside
              sheetsTotal={sheetsState.total}
              catalogCount={catalog.length}
              enrollmentCount={user?.enrollments?.length || 0}
              popularCourses={popularCourses}
              recentCourses={recentCourses}
              activeCourseId={courseId}
              onCourseFilter={handleCourseFilter}
            />
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
