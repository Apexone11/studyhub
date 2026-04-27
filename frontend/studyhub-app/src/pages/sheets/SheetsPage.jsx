/* ═══════════════════════════════════════════════════════════════════════════
 * SheetsPage.jsx — Study sheets listing (thin orchestrator)
 *
 * Components: SheetsFilters, SheetsEmptyState, SheetsAside, SheetListItem,
 *             SheetGridCard, SheetsViewBar
 * Data: useSheetsData, useSheetsViewMode, useDesignV2Flags
 * ═══════════════════════════════════════════════════════════════════════════ */
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../../components/navbar/Navbar'
import AppSidebar from '../../components/sidebar/AppSidebar'
import { IconUpload } from '../../components/Icons'
import { pageShell, useResponsiveAppLayout } from '../../lib/ui'
import { usePageTitle } from '../../lib/usePageTitle'
import { useStudyStatusBatch } from '../../lib/useStudyStatus'
import { useDesignV2Flags } from '../../lib/designV2Flags'
import { SkeletonSheetGrid } from '../../components/Skeleton'
import SheetListRow from './SheetListItem'
import SheetGridCard from './SheetGridCard'
import SheetsFilters from './SheetsFilters'
import SheetsEmptyState from './SheetsEmptyState'
import SheetsAside from './SheetsAside'
import SheetsViewBar from './SheetsViewBar'
import useSheetsData from './useSheetsData'
import useSheetsViewMode from './useSheetsViewMode'
import { isEditableSheetStatus } from './sheetsPageConstants'
import './SheetsPage.css'

export default function SheetsPage() {
  usePageTitle('Study Sheets')
  const layout = useResponsiveAppLayout()
  const flags = useDesignV2Flags()
  const { viewMode, setViewMode } = useSheetsViewMode()

  const {
    user,
    navigate,
    search,
    schoolId,
    courseId,
    mine,
    starred,
    statusFilter,
    sortValue,
    formatValue,
    searchAll,
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
    selectedCourse,
    popularCourses,
    recentCourses,
    subtitle,
    hasActiveFilters,
    setQueryParam,
    handleSchoolChange,
    handleCourseFilter,
    toggleMine,
    toggleSearchAll,
    clearAllFilters,
    toggleStar,
    handleFork,
    loadMoreSheets,
  } = useSheetsData()

  const sheetIds = useMemo(() => (sheetsState.sheets || []).map((s) => s.id), [sheetsState.sheets])
  const studyStatusMap = useStudyStatusBatch(sheetIds)

  // Phase 4 Day 3 — Grid/List + cross-school toggles ride the
  // `design_v2_sheets_grid` flag. When the flag is off the page renders
  // exactly as before (list-only, no view bar, no cross-school switch).
  const v2Enabled = flags.sheetsGrid === true && !flags.loading
  const renderGrid = v2Enabled && viewMode === 'grid'
  const handleSheetOpen = (sheetId) => {
    const s = sheetsState.sheets.find((x) => x.id === sheetId)
    if (s && isEditableSheetStatus(s.status)) {
      navigate(`/sheets/upload?draft=${sheetId}`)
    } else {
      navigate(`/sheets/${sheetId}`)
    }
  }

  return (
    <>
      <Navbar />
      <div className="sheets-page sh-app-page">
        <div className="sh-ambient-shell" style={pageShell('app', 26, 48)}>
          <div className="app-three-col-grid sh-ambient-grid">
            <AppSidebar mode={layout.sidebarMode} />

            <main id="main-content" className="sheets-page__main sh-ambient-main">
              <section className="sh-card sheets-page__title-card">
                <div className="sheets-page__title-row">
                  <div>
                    <h1 className="sheets-page__title">Study Sheets</h1>
                    <p className="sheets-page__subtitle">{subtitle}</p>
                  </div>
                  <Link
                    data-tutorial="sheets-upload"
                    to="/sheets/upload"
                    className="sh-btn sh-btn--primary sheets-page__upload-cta"
                  >
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
                statusFilter={statusFilter}
                mobileFiltersOpen={mobileFiltersOpen}
                setMobileFiltersOpen={setMobileFiltersOpen}
                catalog={catalog}
                activeSchool={activeSchool}
                availableCourses={availableCourses}
                setQueryParam={setQueryParam}
                handleSchoolChange={handleSchoolChange}
                toggleMine={toggleMine}
                accountType={user?.accountType}
                v2Chips={v2Enabled}
              />

              {catalogError ? (
                <div className="sh-alert sh-alert--danger">{catalogError}</div>
              ) : null}
              {sheetsState.error ? (
                <div className="sh-alert sh-alert--danger">{sheetsState.error}</div>
              ) : null}

              {/* SheetsViewBar must render OUTSIDE the loading/empty/results
                  split: when a school-scoped query returns zero results, the
                  user needs the cross-school switch to widen the search.
                  Hiding the bar inside the results branch traps them in an
                  empty state with no recovery path. */}
              {v2Enabled ? (
                <section className="sh-card sh-card--flat sh-card--flush sheets-page__viewbar-shell">
                  <SheetsViewBar
                    viewMode={viewMode}
                    onViewModeChange={setViewMode}
                    searchAll={searchAll}
                    onToggleSearchAll={toggleSearchAll}
                    resultsLabel={
                      sheetsState.loading
                        ? 'Loading sheets...'
                        : `${sheetsState.total} sheet${sheetsState.total === 1 ? '' : 's'}`
                    }
                  />
                  {hasActiveFilters ? (
                    <div className="sheets-page__list-head sheets-page__list-head--secondary">
                      <span aria-hidden="true" />
                      <button
                        type="button"
                        className="sh-btn sh-btn--ghost sh-btn--sm"
                        onClick={clearAllFilters}
                      >
                        Clear filters
                      </button>
                    </div>
                  ) : null}
                </section>
              ) : null}

              {sheetsState.loading ? (
                <SkeletonSheetGrid count={4} />
              ) : sheetsState.sheets.length === 0 ? (
                <SheetsEmptyState
                  search={search}
                  hasActiveFilters={hasActiveFilters}
                  mine={mine}
                  statusFilter={statusFilter}
                  clearAllFilters={clearAllFilters}
                  selectedCourse={selectedCourse}
                />
              ) : (
                <section className="sh-card sh-card--flat sh-card--flush sheets-page__list-shell">
                  {v2Enabled ? null : (
                    <div className="sheets-page__list-head">
                      <span>
                        {sheetsState.total} sheet{sheetsState.total === 1 ? '' : 's'}
                      </span>
                      {hasActiveFilters ? (
                        <button
                          type="button"
                          className="sh-btn sh-btn--ghost sh-btn--sm"
                          onClick={clearAllFilters}
                        >
                          Clear filters
                        </button>
                      ) : null}
                    </div>
                  )}

                  {renderGrid ? (
                    <div ref={cardsRef} className="sheets-page__grid" role="list">
                      {sheetsState.sheets.map((sheet) => (
                        <SheetGridCard
                          key={sheet.id}
                          sheet={sheet}
                          studyStatus={studyStatusMap[sheet.id] || null}
                          forking={forkingSheetId === sheet.id}
                          onOpen={handleSheetOpen}
                          onStar={toggleStar}
                          onFork={handleFork}
                        />
                      ))}
                    </div>
                  ) : (
                    <div ref={cardsRef} className="sheets-page__rows" role="list">
                      {sheetsState.sheets.map((sheet) => (
                        <SheetListRow
                          key={sheet.id}
                          sheet={sheet}
                          studyStatus={studyStatusMap[sheet.id] || null}
                          forking={forkingSheetId === sheet.id}
                          onOpen={handleSheetOpen}
                          onStar={toggleStar}
                          onFork={handleFork}
                          v2={v2Enabled}
                        />
                      ))}
                    </div>
                  )}

                  {sheetsState.sheets.length < sheetsState.total ? (
                    <div className="sheets-page__load-more-wrap">
                      <button
                        onClick={loadMoreSheets}
                        disabled={loadingMore}
                        className="sh-load-more-btn"
                      >
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
    </>
  )
}
