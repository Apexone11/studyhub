import { IconSearch } from '../../components/Icons'
import { SORT_OPTIONS, FORMAT_OPTIONS, STATUS_OPTIONS } from './sheetsPageConstants'

export default function SheetsFilters({
  search,
  schoolId,
  courseId,
  sortValue,
  formatValue,
  mine,
  starred,
  statusFilter,
  mobileFiltersOpen,
  setMobileFiltersOpen,
  catalog,
  activeSchool,
  availableCourses,
  setQueryParam,
  handleSchoolChange,
  toggleMine,
  accountType,
}) {
  const hideSchoolCourse = accountType === 'other'
  return (
    <section className="sh-card sheets-page__filters-card">
      <div className="sheets-page__mobile-search-row">
        <label className="sheets-page__search-wrap">
          <IconSearch size={15} className="sheets-page__search-icon" />
          <input
            className="sh-input sheets-page__search-input"
            value={search}
            onChange={(event) => setQueryParam('search', event.target.value)}
            placeholder="Search sheets, topics, or authors..."
          />
        </label>
        <button
          type="button"
          className="sh-btn sh-btn--secondary sh-btn--sm"
          onClick={() => setMobileFiltersOpen((open) => !open)}
          aria-expanded={mobileFiltersOpen}
          aria-controls="sheets-filter-panel"
        >
          {mobileFiltersOpen ? 'Close' : 'Filters'}
        </button>
      </div>

      <div
        id="sheets-filter-panel"
        className={`sheets-page__filter-grid ${mobileFiltersOpen ? 'is-open' : ''}`}
        data-tutorial="sheets-filters"
      >
        <label
          data-tutorial="sheets-search"
          className="sheets-page__search-wrap sheets-page__desktop-search"
        >
          <IconSearch size={15} className="sheets-page__search-icon" />
          <input
            className="sh-input sheets-page__search-input"
            value={search}
            onChange={(event) => setQueryParam('search', event.target.value)}
            placeholder="Search sheets, topics, or authors..."
          />
        </label>

        {hideSchoolCourse ? null : (
          <select
            className="sh-input sheets-page__filter-select"
            value={schoolId}
            onChange={(event) => handleSchoolChange(event.target.value)}
          >
            <option value="">All schools</option>
            {catalog.map((school) => (
              <option key={school.id} value={school.id}>
                {school.short || school.name}
              </option>
            ))}
          </select>
        )}

        {hideSchoolCourse ? null : (
          <select
            className="sh-input sheets-page__filter-select"
            value={courseId}
            onChange={(event) => setQueryParam('courseId', event.target.value)}
          >
            <option value="">All courses</option>
            {availableCourses.map((course) => {
              const schoolLabel = course.school?.short || course.school?.name
              return (
                <option key={course.id} value={course.id}>
                  {activeSchool
                    ? course.code
                    : `${course.code}${schoolLabel ? ` · ${schoolLabel}` : ''}`}
                </option>
              )
            })}
          </select>
        )}

        <select
          className="sh-input sheets-page__filter-select"
          value={sortValue}
          onChange={(event) => setQueryParam('sort', event.target.value)}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          className="sh-input sheets-page__filter-select"
          value={formatValue}
          onChange={(event) =>
            setQueryParam('format', event.target.value === 'all' ? '' : event.target.value)
          }
        >
          {FORMAT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <div className="sheets-page__toggle-row" data-tutorial="sheets-toggles">
          <button
            type="button"
            className={`sh-chip ${mine ? 'sh-chip--active' : ''}`}
            onClick={toggleMine}
          >
            Mine
          </button>
          <button
            type="button"
            className={`sh-chip ${starred ? 'sh-chip--active' : ''}`}
            onClick={() => setQueryParam('starred', starred ? '' : '1')}
          >
            Starred
          </button>
        </div>

        {mine ? (
          <div className="sheets-page__status-row">
            {STATUS_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`sh-chip sh-chip--status ${statusFilter === option.value ? 'sh-chip--active' : ''}`}
                onClick={() =>
                  setQueryParam('status', statusFilter === option.value ? '' : option.value)
                }
              >
                {option.icon ? <span className="sh-chip__icon">{option.icon}</span> : null}
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  )
}
