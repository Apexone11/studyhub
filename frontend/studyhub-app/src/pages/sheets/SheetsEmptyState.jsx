/* ═══════════════════════════════════════════════════════════════════════════
 * SheetsEmptyState.jsx — Empty state variants for the sheets page
 * ═══════════════════════════════════════════════════════════════════════════ */
import { Link } from 'react-router-dom'
import { IconUpload } from '../../components/Icons'

export default function SheetsEmptyState({
  search,
  hasActiveFilters,
  mine,
  statusFilter,
  clearAllFilters,
  selectedCourse,
}) {
  if (search.trim()) {
    return (
      <section className="sh-card sheets-page__empty-state">
        <h2 className="sheets-page__empty-title">No results for &ldquo;{search}&rdquo;</h2>
        <p className="sheets-page__empty-copy">
          Try another query or clear your filters to scan the full sheet index.
        </p>
        <button type="button" className="sh-btn sh-btn--secondary" onClick={clearAllFilters}>
          Clear filters
        </button>
      </section>
    )
  }

  if (selectedCourse && !mine && !search.trim()) {
    const courseLabel = selectedCourse.code || selectedCourse.name
    const schoolLabel = selectedCourse.school?.short || selectedCourse.school?.name || ''
    return (
      <section className="sh-card sheets-page__empty-state">
        <h2 className="sheets-page__empty-title">No sheets for {courseLabel} yet</h2>
        <p className="sheets-page__empty-copy">
          Be the first to share notes for {courseLabel}
          {schoolLabel ? ` at ${schoolLabel}` : ''}. Upload your study materials to help classmates.
        </p>
        <div className="sheets-page__empty-actions">
          <Link to="/sheets/upload" className="sh-btn sh-btn--primary">
            <IconUpload size={14} />
            Upload for {courseLabel}
          </Link>
          <button type="button" className="sh-btn sh-btn--secondary" onClick={clearAllFilters}>
            Browse all sheets
          </button>
        </div>
      </section>
    )
  }

  if (hasActiveFilters) {
    return (
      <section className="sh-card sheets-page__empty-state">
        <h2 className="sheets-page__empty-title">No sheets matched your filters</h2>
        <p className="sheets-page__empty-copy">
          Your current filters are too narrow. Clear them to return to the full list.
        </p>
        <button type="button" className="sh-btn sh-btn--secondary" onClick={clearAllFilters}>
          Clear filters
        </button>
      </section>
    )
  }

  if (mine && statusFilter === 'draft') {
    return (
      <section className="sh-card sheets-page__empty-state">
        <h2 className="sheets-page__empty-title">No drafts</h2>
        <p className="sheets-page__empty-copy">
          You don&rsquo;t have any drafts right now. Start writing a new sheet and save it as a
          draft.
        </p>
        <div className="sheets-page__empty-actions">
          <Link to="/sheets/upload?new=1" className="sh-btn sh-btn--primary">
            <IconUpload size={14} />
            Start a new sheet
          </Link>
        </div>
      </section>
    )
  }

  if (mine && statusFilter === 'pending_review') {
    return (
      <section className="sh-card sheets-page__empty-state">
        <h2 className="sheets-page__empty-title">Nothing pending</h2>
        <p className="sheets-page__empty-copy">
          None of your sheets are waiting for review. Published sheets are live and visible to
          classmates.
        </p>
      </section>
    )
  }

  if (mine && statusFilter === 'rejected') {
    return (
      <section className="sh-card sheets-page__empty-state">
        <h2 className="sheets-page__empty-title">No rejected sheets</h2>
        <p className="sheets-page__empty-copy">
          All clear — none of your sheets have been rejected by moderators.
        </p>
      </section>
    )
  }

  if (mine) {
    return (
      <section className="sh-card sheets-page__empty-state">
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
      </section>
    )
  }

  return (
    <section className="sh-card sheets-page__empty-state">
      <h2 className="sheets-page__empty-title">Be the first to share for this space</h2>
      <p className="sheets-page__empty-copy">
        No published sheets yet. Upload your notes or start with a template to kick off the course
        repo.
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
    </section>
  )
}
