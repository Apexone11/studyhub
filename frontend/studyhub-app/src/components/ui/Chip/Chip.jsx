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
 *   variant   "eyebrow" | "pill" | "badge"   default "pill"
 *   tone      "brand" | "success" | "warning" | "danger" | "neutral"   default "brand"
 *   size      "sm" | "md"   default "md" (ignored by eyebrow variant)
 *   selected  boolean | undefined   default undefined.
 *             Optional. When defined, the chip is treated as a toggle:
 *             `aria-pressed` reflects the value. When `true`, the chip
 *             also picks up the `chip--selected` modifier (solid tone
 *             background + anti-text). Eyebrow variants ignore the
 *             selected modifier visually but still set aria-pressed so
 *             the call-site can wrap the chip in a button without
 *             losing the state.
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
  { variant = 'pill', tone = 'brand', size = 'md', selected, className, children, ...rest },
  ref,
) {
  const classes = [
    styles.chip,
    styles[`chip--${variant}`],
    styles[`chip--tone-${tone}`],
    // eyebrow ignores size classes
    variant !== 'eyebrow' && styles[`chip--${size}`],
    selected === true && styles['chip--selected'],
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const ariaPressed = selected === undefined ? undefined : selected ? 'true' : 'false'

  return (
    <span ref={ref} className={classes} aria-pressed={ariaPressed} {...rest}>
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
