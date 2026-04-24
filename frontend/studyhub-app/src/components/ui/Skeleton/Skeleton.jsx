import { forwardRef } from 'react'
import styles from './Skeleton.module.css'

/**
 * Skeleton — loading placeholder primitives.
 *
 * See `docs/internal/audits/2026-04-24-day2-primitives-plus-phase2-handoff.md`
 * Part B for the canonical spec.
 *
 * API:
 *
 *   variant  "text" | "avatar" | "card"   default "text"
 *   width    number | string              default '100%'
 *   height   number | string              default '1em'
 *   lines    number                       default 1 (only applies to text)
 *
 * Convenience wrappers: SkeletonText, SkeletonAvatar, SkeletonCard.
 *
 * Accessibility: aria-hidden on the visual shell; the caller's container
 * should set `aria-busy="true"` on the region being loaded so screen
 * readers announce the state.
 */

const LINE_WIDTHS = ['100%', '85%', '70%', '90%', '60%']

function toCssLength(value) {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'number') return `${value}px`
  return value
}

const Skeleton = forwardRef(function Skeleton(
  { variant = 'text', width, height, lines = 1, className, style, ...rest },
  ref,
) {
  // Multi-line text variant: emit a stacked flex container of line bars.
  if (variant === 'text' && lines > 1) {
    return (
      <span
        ref={ref}
        className={[styles.lines, className].filter(Boolean).join(' ')}
        style={style}
        aria-hidden="true"
        {...rest}
      >
        {Array.from({ length: lines }).map((_, i) => (
          <span
            key={i}
            className={[styles.base, styles.text].join(' ')}
            style={{
              width: toCssLength(width) ?? LINE_WIDTHS[i % LINE_WIDTHS.length],
              height: toCssLength(height) ?? undefined,
            }}
          />
        ))}
      </span>
    )
  }

  const classes = [styles.base, styles[variant], className].filter(Boolean).join(' ')
  const mergedStyle = {
    width: toCssLength(width) ?? (variant === 'avatar' ? 40 : '100%'),
    height: toCssLength(height) ?? (variant === 'avatar' ? 40 : undefined),
    ...style,
  }

  return <span ref={ref} className={classes} style={mergedStyle} aria-hidden="true" {...rest} />
})

export default Skeleton

export const SkeletonText = forwardRef(function SkeletonText({ lines = 1, ...rest }, ref) {
  return <Skeleton ref={ref} variant="text" lines={lines} {...rest} />
})

export const SkeletonAvatar = forwardRef(function SkeletonAvatar({ size = 40, ...rest }, ref) {
  return <Skeleton ref={ref} variant="avatar" width={size} height={size} {...rest} />
})

/**
 * SkeletonCard — mirrors the Card layout (header, body lines, footer).
 * Keeps the container dimensions stable so the real Card slotting in
 * does not layout-shift the surrounding widgets.
 */
export const SkeletonCard = forwardRef(function SkeletonCard({ className, ...rest }, ref) {
  const classes = [styles.card, className].filter(Boolean).join(' ')
  return (
    <div ref={ref} className={classes} role="status" aria-busy="true" {...rest}>
      <span className={[styles.base, styles.card__header].join(' ')} aria-hidden="true" />
      <span className={styles.lines} aria-hidden="true">
        <span className={[styles.base, styles.text].join(' ')} style={{ width: '100%' }} />
        <span className={[styles.base, styles.text].join(' ')} style={{ width: '85%' }} />
        <span className={[styles.base, styles.text].join(' ')} style={{ width: '70%' }} />
      </span>
      <span className={[styles.base, styles.card__footer].join(' ')} aria-hidden="true" />
    </div>
  )
})
