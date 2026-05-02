/**
 * SheetGridCard — Phase 4 Day 3 grid-view card for the Sheets page.
 *
 * Rendered from `SheetsPage` only when the `design_v2_sheets_grid`
 * feature flag is on AND the active view mode is "grid". The list view
 * keeps using `SheetListItem`.
 *
 * Card surface uses `--sh-surface` / `--sh-border` / `--radius-card`
 * with a `--shadow-sm → --shadow-md` hover lift, matching the
 * component-kit `Card` primitive treatment without re-wrapping it (the
 * card needs to be a clickable `<article>` for keyboard parity with the
 * list row, and the primitive's interactive mode would also work but
 * adds an extra layer here).
 *
 * The course code uses the `<Chip variant="eyebrow" tone="brand">`
 * primitive — the List view renders the same field as a plain styled
 * span. Different surface, different treatment, intentional.
 */
import { Link } from 'react-router-dom'
import Chip from '../../components/ui/Chip/Chip'
import { IconComment, IconFork, IconStar, IconStarFilled } from '../../components/Icons'
import StudyStatusChip from '../../components/StudyStatusChip'
import {
  computeSignalBadge,
  isEditableSheetStatus,
  SIGNAL_BADGE_CONFIG,
  timeAgo,
} from './sheetsPageConstants'
import styles from './SheetGridCard.module.css'

export default function SheetGridCard({ sheet, forking, onOpen, onStar, onFork, studyStatus }) {
  const detailPath = isEditableSheetStatus(sheet.status)
    ? `/sheets/upload?draft=${sheet.id}`
    : `/sheets/${sheet.id}`
  const courseCode = sheet.course?.code || 'General'
  const schoolLabel = sheet.course?.school?.short || sheet.course?.school?.name || 'StudyHub'
  const author = sheet.author?.username || 'Unknown'
  const previewText = (sheet.previewText || '').trim()
  const signal = computeSignalBadge(sheet)
  const signalConfig = signal ? SIGNAL_BADGE_CONFIG[signal] : null
  // Map `signal` to the local CSS-Module class. `SIGNAL_BADGE_CONFIG`
  // ships a global BEM class for the List view; we want a scoped rule
  // here so the tone colors actually resolve.
  const signalToneClass = signal ? styles[`signal--${signal}`] : ''

  const handleKeyDown = (event) => {
    if (event.target !== event.currentTarget) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onOpen(sheet.id)
    }
  }

  return (
    <article
      className={styles.card}
      role="link"
      tabIndex={0}
      onClick={() => onOpen(sheet.id)}
      onKeyDown={handleKeyDown}
      aria-label={`Open ${sheet.title}`}
    >
      <div className={styles.eyebrow}>
        <Chip variant="eyebrow" tone="brand">
          {courseCode}
        </Chip>
        {sheet.author?.username ? (
          <Link
            to={`/users/${sheet.author.username}`}
            onClick={(event) => event.stopPropagation()}
            className={styles.author}
          >
            {author}
          </Link>
        ) : (
          <span className={styles.author}>{author}</span>
        )}
      </div>

      <h3 className={styles.title}>
        <Link to={detailPath} onClick={(event) => event.stopPropagation()}>
          {sheet.title}
        </Link>
      </h3>

      {signalConfig || studyStatus ? (
        <div className={styles.badges}>
          {signalConfig ? (
            <span className={`${styles.signal} ${signalToneClass}`}>{signalConfig.label}</span>
          ) : null}
          {studyStatus ? <StudyStatusChip status={studyStatus} /> : null}
        </div>
      ) : null}

      {previewText ? <p className={styles.preview}>{previewText}</p> : null}

      <div className={styles.meta} aria-label="Sheet stats">
        <span className={styles.stat}>
          <IconStar size={13} />
          {sheet.stars || 0}
        </span>
        <span className={styles.stat}>
          <IconFork size={13} />
          {sheet.forks || 0}
        </span>
        {(sheet.commentCount || 0) > 0 ? (
          <span className={styles.stat}>
            <IconComment size={13} />
            {sheet.commentCount}
          </span>
        ) : null}
        <span className={styles.spacer} />
        <span className={styles.timestamp}>
          {schoolLabel} · Updated {timeAgo(sheet.updatedAt || sheet.createdAt)}
        </span>
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={`sh-btn sh-btn--secondary sh-btn--sm ${sheet.starred ? 'is-active' : ''}`}
          onClick={(event) => {
            event.stopPropagation()
            onStar(sheet)
          }}
          aria-pressed={Boolean(sheet.starred)}
          aria-label={`Star ${sheet.title}`}
        >
          {sheet.starred ? <IconStarFilled size={13} /> : <IconStar size={13} />}
          Star
        </button>
        {sheet.allowEditing === true ? (
          <button
            type="button"
            className="sh-btn sh-btn--secondary sh-btn--sm"
            onClick={(event) => {
              event.stopPropagation()
              onFork(sheet)
            }}
            disabled={forking}
            aria-label={`Fork ${sheet.title}`}
          >
            <IconFork size={13} />
            {forking ? 'Forking...' : 'Fork'}
          </button>
        ) : null}
      </div>
    </article>
  )
}
