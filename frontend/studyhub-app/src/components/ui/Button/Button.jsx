import { forwardRef } from 'react'
import styles from './Button.module.css'

/**
 * Button — the primary action primitive for StudyHub.
 *
 * API (see `docs/internal/audits/2026-04-24-day1-component-kit-handoff.md`
 * Part C for the canonical spec):
 *
 *   variant   "primary" | "secondary" | "ghost" | "danger"   default "primary"
 *   size      "sm" | "md" | "lg"                             default "md"
 *   fullWidth boolean                                         default false
 *   loading   boolean                                         default false
 *   disabled  boolean                                         default false
 *   leftIcon  ReactNode
 *   rightIcon ReactNode
 *   type      "button" | "submit" | "reset"                   default "button"
 *   ...rest   spread onto the underlying <button>
 *
 * `loading` disables the button and hides label + icons while showing
 * a centered spinner, keeping dimensions stable so the surrounding
 * layout does not shift.
 */
const Button = forwardRef(function Button(
  {
    variant = 'primary',
    size = 'md',
    fullWidth = false,
    loading = false,
    disabled = false,
    leftIcon,
    rightIcon,
    type = 'button',
    className,
    children,
    ...rest
  },
  ref,
) {
  const classes = [
    styles.btn,
    styles[`btn--${variant}`],
    styles[`btn--${size}`],
    fullWidth && styles['btn--fullWidth'],
    loading && styles['btn--loading'],
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {leftIcon ? (
        <span className={styles.btn__leftIcon} aria-hidden="true">
          {leftIcon}
        </span>
      ) : null}
      <span className={styles.btn__label}>{children}</span>
      {rightIcon ? (
        <span className={styles.btn__rightIcon} aria-hidden="true">
          {rightIcon}
        </span>
      ) : null}
      {loading ? <span className={styles.btn__spinner} aria-hidden="true" /> : null}
    </button>
  )
})

export default Button
