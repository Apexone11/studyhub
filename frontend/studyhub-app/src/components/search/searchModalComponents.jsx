/* ═══════════════════════════════════════════════════════════════════════════
 * searchModalComponents.jsx — Presentational components for SearchModal.
 *
 * Lives in its own .jsx file (separate from searchModalConstants.js) so the
 * constants module satisfies react-refresh/only-export-components. The styles
 * object and SEARCH_TABS constant live in searchModalConstants.js.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { IconClock, IconSpark, IconArrowRight } from '../Icons'
import { styles, SEARCH_TABS } from './searchModalConstants'

/** Highlight matched substring in bold (and `<mark>` background). */
export function Highlight({ text, query }) {
  if (!query || query.length < 2 || !text) return text
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = String(text).split(new RegExp(`(${escaped})`, 'gi'))
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark
        key={i}
        style={{
          background: 'var(--sh-highlight, #fef08a)',
          color: 'inherit',
          borderRadius: 2,
          padding: '0 1px',
          fontWeight: 700,
        }}
      >
        {part}
      </mark>
    ) : (
      part
    ),
  )
}

/** Skeleton placeholder row used while results are loading. */
export function SearchSkeletonRow({ keyId = 0 }) {
  // Slightly varied widths so the skeleton block doesn't look uniform.
  const titleWidth = 50 + (keyId % 3) * 12
  const metaWidth = 30 + (keyId % 2) * 14
  return (
    <div style={styles.skeletonRow} aria-hidden="true">
      <div
        style={{ ...styles.skeletonBlock, width: 28, height: 28, borderRadius: 8 }}
        className="sh-skeleton"
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div
          style={{ ...styles.skeletonBlock, width: `${titleWidth}%`, height: 12 }}
          className="sh-skeleton"
        />
        <div
          style={{ ...styles.skeletonBlock, width: `${metaWidth}%`, height: 10 }}
          className="sh-skeleton"
        />
      </div>
    </div>
  )
}

/** Stacked rows of SearchSkeletonRow. */
export function SearchSkeletonList({ count = 5 }) {
  return (
    <div role="status" aria-live="polite" aria-label="Loading results">
      {Array.from({ length: count }).map((_, i) => (
        <SearchSkeletonRow key={i} keyId={i} />
      ))}
    </div>
  )
}

/**
 * Tab filter chips above the result list. Tab key cycles through them.
 *
 * @param {object} props
 * @param {string} props.active - active tab key
 * @param {(key: string) => void} props.onChange
 * @param {(node: HTMLButtonElement | null, index: number) => void} [props.registerTab]
 * @param {Array<{key: string, label: string, count?: number}>} [props.tabs] - override list
 */
export function SearchTabChips({ active, onChange, registerTab, tabs }) {
  const list = Array.isArray(tabs) && tabs.length > 0 ? tabs : SEARCH_TABS
  return (
    <div style={styles.tabRow} role="tablist" aria-label="Filter results by type">
      {list.map((tab, idx) => {
        const isActive = active === tab.key
        return (
          <button
            key={tab.key}
            ref={(node) => registerTab?.(node, idx)}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.key)}
            style={{
              ...styles.tabChip,
              ...(isActive ? styles.tabChipActive : null),
            }}
          >
            {tab.label}
            {typeof tab.count === 'number' && tab.count > 0 ? (
              <span style={{ marginLeft: 4, opacity: 0.75 }}>{tab.count}</span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Empty state shown before the user types: Recent searches + Suggestions +
 * keyboard shortcuts. Arrow-key navigation is driven by the parent via
 * activeIndex.
 */
export function SearchEmptyState({
  recent,
  suggestions,
  activeIndex,
  setActiveIndex,
  onPick,
  onClearRecent,
}) {
  let cursor = 0
  return (
    <div style={styles.emptyStateWrap}>
      {recent.length > 0 && (
        <div style={styles.emptyStateGroup}>
          <div style={styles.emptyStateHeader}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <IconClock size={11} /> Recent searches
            </span>
            <button
              type="button"
              onClick={onClearRecent}
              style={styles.emptyStateLinkBtn}
              aria-label="Clear recent searches"
            >
              Clear
            </button>
          </div>
          {recent.map((entry) => {
            const idx = cursor++
            const isActive = idx === activeIndex
            return (
              <button
                key={`r-${entry}-${idx}`}
                type="button"
                onClick={() => onPick(entry)}
                onMouseEnter={() => setActiveIndex(idx)}
                style={{
                  ...styles.emptyStateRow,
                  ...(isActive ? styles.emptyStateRowActive : null),
                }}
              >
                <span style={styles.emptyStateRowIcon}>
                  <IconClock size={14} />
                </span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {entry}
                </span>
                <span style={styles.emptyStateRowIcon}>
                  <IconArrowRight size={12} />
                </span>
              </button>
            )
          })}
        </div>
      )}

      {suggestions.length > 0 && (
        <div style={styles.emptyStateGroup}>
          <div style={styles.emptyStateHeader}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <IconSpark size={11} /> Suggestions
            </span>
          </div>
          {suggestions.map((entry) => {
            const idx = cursor++
            const isActive = idx === activeIndex
            return (
              <button
                key={`sg-${entry}-${idx}`}
                type="button"
                onClick={() => onPick(entry)}
                onMouseEnter={() => setActiveIndex(idx)}
                style={{
                  ...styles.emptyStateRow,
                  ...(isActive ? styles.emptyStateRowActive : null),
                }}
              >
                <span style={styles.emptyStateRowIcon}>
                  <IconSpark size={14} />
                </span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {entry}
                </span>
                <span style={styles.emptyStateRowIcon}>
                  <IconArrowRight size={12} />
                </span>
              </button>
            )
          })}
        </div>
      )}

      {recent.length === 0 && suggestions.length === 0 && (
        <div style={{ ...styles.statusMsg, padding: '8px 0' }}>
          Start typing to search sheets, notes, courses, users, and groups.
        </div>
      )}

      <div style={styles.shortcutsRow} aria-label="Keyboard shortcuts">
        <span style={styles.shortcutItem}>
          <kbd style={styles.kbd}>Esc</kbd> close
        </span>
        <span style={styles.shortcutItem}>
          <kbd style={styles.kbd}>{'↑'}</kbd>
          <kbd style={styles.kbd}>{'↓'}</kbd> navigate
        </span>
        <span style={styles.shortcutItem}>
          <kbd style={styles.kbd}>Enter</kbd> open
        </span>
        <span style={styles.shortcutItem}>
          <kbd style={styles.kbd}>Tab</kbd> switch type
        </span>
      </div>
    </div>
  )
}

/** Empty result state — shown when a query returns 0 hits. */
export function SearchNoResults({ query, onBroaden }) {
  return (
    <div style={styles.noResultsWrap} role="status" aria-live="polite">
      <div style={styles.noResultsTitle}>No results for &ldquo;{query}&rdquo;</div>
      <div style={styles.noResultsHint}>
        Try a different keyword, switch to a different result type with{' '}
        <kbd style={styles.kbd}>Tab</kbd>, or broaden your school scope from the Sheets page.
      </div>
      {onBroaden ? (
        <button type="button" onClick={onBroaden} style={styles.emptyStateLinkBtn}>
          Reset to All
        </button>
      ) : null}
    </div>
  )
}

/** Tiny type-chip used in result rows. */
export function TypeChip({ label }) {
  return (
    <span style={styles.typeChip} aria-hidden="true">
      {label}
    </span>
  )
}
