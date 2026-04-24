import { forwardRef } from 'react'
import styles from './Chip.module.css'

/**
 * Chip — small labeled pill/badge primitive.
 *
 * See `docs/internal/audits/2026-04-24-day2-primitives-plus-phase2-handoff.md`
 * Part B for the canonical spec.
 *
 * API:
 *
 *   variant  "eyebrow" | "pill" | "badge"   default "pill"
 *   tone     "brand" | "success" | "warning" | "danger" | "neutral"   default "brand"
 *   size     "sm" | "md"   default "md" (ignored by eyebrow variant)
 *
 * Variants:
 *   eyebrow — uppercase, letter-spaced, transparent bg, tone-colored text.
 *     Used for section kickers, course codes above titles, etc.
 *   pill    — full-round radius, tone bg + tone text.
 *   badge   — small-radius, same coloring as pill, slightly tighter padding.
 *             See the Badge alias component for the "this is a badge"
 *             call-site.
 */
const Chip = forwardRef(function Chip(
  { variant = 'pill', tone = 'brand', size = 'md', className, children, ...rest },
  ref,
) {
  const classes = [
    styles.chip,
    styles[`chip--${variant}`],
    styles[`chip--tone-${tone}`],
    // eyebrow ignores size classes
    variant !== 'eyebrow' && styles[`chip--${size}`],
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <span ref={ref} className={classes} {...rest}>
      {children}
    </span>
  )
})

export default Chip

/**
 * Badge — thin alias for <Chip variant="badge"> so call sites can say
 * "this is a status badge" without the `variant` noise. Same API minus
 * the variant prop.
 */
export const Badge = forwardRef(function Badge(props, ref) {
  return <Chip ref={ref} variant="badge" {...props} />
})
