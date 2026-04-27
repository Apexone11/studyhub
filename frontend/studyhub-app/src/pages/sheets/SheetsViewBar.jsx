/**
 * SheetsViewBar — Phase 4 Day 3 view-mode + cross-school toggles.
 *
 * Renders only when `design_v2_sheets_grid` is on. Sits above the
 * results list in `SheetsPage` and owns:
 *   - Grid/List view toggle  — soft-pill segmented buttons (no
 *     SegmentedControl primitive on purpose; keeps the surface area
 *     small for this cycle).
 *   - "Search across StudyHub" switch — inline button switch with
 *     role="switch" / aria-checked. Drops schoolId scoping when on.
 *
 * The component is dumb — all state and persistence live in
 * `useSheetsData` (searchAll) and `useSheetsViewMode` (viewMode). It
 * receives the values + setters and renders.
 */
import { IconGrid, IconList } from '../../components/Icons'
import styles from './SheetsViewBar.module.css'

const VIEW_MODES = [
  { mode: 'list', label: 'List', Icon: IconList },
  { mode: 'grid', label: 'Grid', Icon: IconGrid },
]

export default function SheetsViewBar({
  viewMode,
  onViewModeChange,
  searchAll,
  onToggleSearchAll,
  resultsLabel,
}) {
  return (
    <div className={styles.bar} data-tutorial="sheets-view-bar">
      <span className={styles.results}>{resultsLabel}</span>

      <button
        type="button"
        role="switch"
        aria-checked={searchAll}
        onClick={onToggleSearchAll}
        className={`${styles.switch} ${searchAll ? styles.switchOn : ''}`}
      >
        <span className={styles.switchTrack}>
          <span className={styles.switchKnob} />
        </span>
        <span className={styles.switchLabel}>Search across StudyHub</span>
      </button>

      <div className={styles.viewToggle} role="group" aria-label="Sheet view">
        {VIEW_MODES.map((entry) => {
          const ModeIcon = entry.Icon
          return (
            <button
              key={entry.mode}
              type="button"
              aria-pressed={viewMode === entry.mode}
              onClick={() => onViewModeChange(entry.mode)}
              className={`${styles.viewBtn} ${viewMode === entry.mode ? styles.viewBtnActive : ''}`}
              aria-label={`${entry.label} view`}
            >
              <ModeIcon size={14} />
              <span>{entry.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
