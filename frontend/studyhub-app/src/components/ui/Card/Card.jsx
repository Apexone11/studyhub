import { forwardRef } from 'react'
import styles from './Card.module.css'

/**
 * Card — base container primitive for StudyHub.
 *
 * See `docs/internal/audits/2026-04-24-day1-component-kit-handoff.md`
 * Part E for the canonical spec.
 *
 * API:
 *
 *   interactive  boolean   default false. Adds hover lift + focus ring.
 *   as           "div" | "article" | "section" | "a"   default "div".
 *   padding      "sm" | "md" | "lg" | "none"            default "md".
 *                Drives the padding of CardHeader/Body/Footer via a CSS
 *                custom property so the children inherit without re-
 *                passing a prop.
 *   ...rest      Spread onto the rendered element.
 *
 * Subcomponents: `CardHeader`, `CardBody`, `CardFooter`. Each forwards
 * ref, spreads `...rest`, and inherits padding from the Card via the
 * `--card-inner-pad` CSS variable set by the Card's `padding` class.
 */
const Card = forwardRef(function Card(
  {
    interactive = false,
    as: Tag = 'div',
    padding = 'md',
    className,
    onClick,
    onKeyDown,
    children,
    ...rest
  },
  ref,
) {
  const classes = [
    styles.card,
    styles[`card--padding-${padding}`],
    interactive && styles['card--interactive'],
    className,
  ]
    .filter(Boolean)
    .join(' ')

  // When rendering as an interactive non-button element, expose a role
  // + tabindex + keyboard activation so keyboard users get parity with
  // mouse users. Native <a> / <button> already have activation built in,
  // so we skip the ARIA override there to let the native semantics win.
  const needsManualKeyboard = interactive && Tag !== 'a' && Tag !== 'button'
  const handleKeyDown = needsManualKeyboard
    ? (event) => {
        // Defer to a caller-supplied onKeyDown first; they can call
        // event.preventDefault() to suppress the default activation.
        if (typeof onKeyDown === 'function') onKeyDown(event)
        if (event.defaultPrevented) return
        if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
          event.preventDefault()
          if (typeof onClick === 'function') onClick(event)
        }
      }
    : onKeyDown
  const interactiveProps = needsManualKeyboard ? { role: 'button', tabIndex: 0 } : undefined

  return (
    <Tag
      ref={ref}
      className={classes}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      {...interactiveProps}
      {...rest}
    >
      {children}
    </Tag>
  )
})

export const CardHeader = forwardRef(function CardHeader(
  { as = 'div', className, children, ...rest },
  ref,
) {
  const Tag = as
  const classes = [styles.card__header, className].filter(Boolean).join(' ')
  return (
    <Tag ref={ref} className={classes} {...rest}>
      {children}
    </Tag>
  )
})

export const CardBody = forwardRef(function CardBody(
  { as = 'div', className, children, ...rest },
  ref,
) {
  const Tag = as
  const classes = [styles.card__body, className].filter(Boolean).join(' ')
  return (
    <Tag ref={ref} className={classes} {...rest}>
      {children}
    </Tag>
  )
})

export const CardFooter = forwardRef(function CardFooter(
  { as = 'div', className, children, ...rest },
  ref,
) {
  const Tag = as
  const classes = [styles.card__footer, className].filter(Boolean).join(' ')
  return (
    <Tag ref={ref} className={classes} {...rest}>
      {children}
    </Tag>
  )
})

export default Card
