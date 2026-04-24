import { forwardRef, useId } from 'react'
import styles from './Input.module.css'

/**
 * Input — text-field primitive with label / hint / error slots.
 *
 * See `docs/internal/audits/2026-04-24-day1-component-kit-handoff.md`
 * Part D for the canonical spec.
 *
 * API (abridged):
 *
 *   type       "text" | "email" | "password" | "search" | "tel" | "url"
 *   size       "sm" | "md" | "lg"
 *   label      string           renders a <label>, auto-linked by id
 *   hint       string           subtle helper text below; hidden if `error`
 *   error      string           error state + message; sets aria-invalid
 *   leftIcon   ReactNode
 *   rightIcon  ReactNode
 *   fullWidth  boolean
 *   required   boolean          adds a * marker to the label
 *   disabled / readOnly / value / defaultValue / onChange / ...rest
 *
 * Ref forwards to the inner `<input>`, NOT the wrapper div, so form
 * libraries and focus calls hit the actual field.
 *
 * Uses `React.useId()` to generate a stable id when the consumer does
 * not supply one, so the label/input association, the error message
 * `aria-describedby`, and the hint `aria-describedby` all line up
 * correctly.
 */
const Input = forwardRef(function Input(
  {
    type = 'text',
    size = 'md',
    label,
    hint,
    error,
    leftIcon,
    rightIcon,
    fullWidth = false,
    disabled = false,
    readOnly = false,
    required = false,
    id: idProp,
    className,
    ...rest
  },
  ref,
) {
  const generatedId = useId()
  const id = idProp || generatedId
  const errorId = `${id}-error`
  const hintId = `${id}-hint`

  const wrapperClasses = [
    styles.inputField,
    styles[`inputField--${size}`],
    fullWidth && styles['inputField--fullWidth'],
    error && styles['inputField--error'],
    disabled && styles['inputField--disabled'],
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const describedBy = error ? errorId : hint ? hintId : undefined

  return (
    <div className={wrapperClasses}>
      {label ? (
        <label className={styles.inputField__label} htmlFor={id}>
          {label}
          {required ? (
            <span className={styles.inputField__required} aria-hidden="true">
              *
            </span>
          ) : null}
        </label>
      ) : null}
      <div className={styles.inputField__control}>
        {leftIcon ? (
          <span className={styles.inputField__leftIcon} aria-hidden="true">
            {leftIcon}
          </span>
        ) : null}
        <input
          ref={ref}
          id={id}
          type={type}
          className={styles.inputField__input}
          disabled={disabled}
          readOnly={readOnly}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...rest}
        />
        {rightIcon ? (
          <span className={styles.inputField__rightIcon} aria-hidden="true">
            {rightIcon}
          </span>
        ) : null}
      </div>
      {error ? (
        <p id={errorId} className={styles.inputField__error} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className={styles.inputField__hint}>
          {hint}
        </p>
      ) : null}
    </div>
  )
})

export default Input
