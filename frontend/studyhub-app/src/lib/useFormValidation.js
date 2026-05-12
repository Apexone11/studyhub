/* ═══════════════════════════════════════════════════════════════════════════
 * useFormValidation.js — Shared inline form-validation hook
 *
 * Implements the five P3 form-feedback standards:
 *   1. Inline `aria-invalid` + danger border on invalid fields.
 *   2. Inline error message anchored to invalid field via `aria-describedby`.
 *   3. Errors disappear on next valid input.
 *   4. Submit button disabled while submitting (and shows spinner / "Saving…").
 *   5. First invalid field gets focus on submit-with-errors.
 *
 * Public API
 * ──────────
 *
 *   const {
 *     errors,          // { [fieldName]: 'message' }
 *     setFieldError,   // (name, message) — manually set one
 *     clearFieldError, // (name) — drop one (e.g. on user edit)
 *     setErrors,       // (obj) — bulk replace
 *     registerFieldRef,// (name) → ref callback
 *     focusFirstError, // (errors?) — focus the first invalid input
 *     getFieldProps,   // (name) → aria + ref helper for spreading on inputs
 *     hasErrors,       // boolean
 *     resetErrors,     // () — empty the map
 *   } = useFormValidation()
 *
 * Each form keeps its own field-value state (`useState`); the hook owns the
 * error map, refs, and aria glue. Validation logic itself stays in each form
 * (we already have `validateAccountFields` in registerConstants, etc.).
 *
 * Use the companion `formValidationStyles.js` for inline style helpers and
 * the `SubmitSpinner` component if your page can't use a class.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { useCallback, useRef, useState } from 'react'

export function useFormValidation(initialErrors = {}) {
  const [errors, setErrorsState] = useState(initialErrors)
  // Map of field name → DOM node (input/select/textarea). Used to focus the
  // first invalid field on submit-with-errors.
  const fieldRefs = useRef({})

  const setErrors = useCallback((next) => {
    setErrorsState(next || {})
  }, [])

  const setFieldError = useCallback((name, message) => {
    setErrorsState((prev) => {
      if (!message) {
        if (!(name in prev)) return prev
        const next = { ...prev }
        delete next[name]
        return next
      }
      if (prev[name] === message) return prev
      return { ...prev, [name]: message }
    })
  }, [])

  const clearFieldError = useCallback((name) => {
    setErrorsState((prev) => {
      if (!(name in prev)) return prev
      const next = { ...prev }
      delete next[name]
      return next
    })
  }, [])

  const resetErrors = useCallback(() => {
    setErrorsState({})
  }, [])

  const registerFieldRef = useCallback(
    (name) => (node) => {
      if (node) fieldRefs.current[name] = node
      else delete fieldRefs.current[name]
    },
    [],
  )

  // Focus the first invalid field. Argument optional; falls back to the
  // current errors map. Returns the focused field name, or null.
  const focusFirstError = useCallback(
    (nextErrors) => {
      const map = nextErrors || errors
      if (!map || typeof map !== 'object') return null
      const orderedNames = [
        ...Object.keys(fieldRefs.current),
        ...Object.keys(map).filter((k) => !(k in fieldRefs.current)),
      ]
      for (const name of orderedNames) {
        if (!map[name]) continue
        const node = fieldRefs.current[name]
        if (node && typeof node.focus === 'function') {
          try {
            node.focus({ preventScroll: false })
          } catch {
            try {
              node.focus()
            } catch {
              /* ignore */
            }
          }
          return name
        }
      }
      return null
    },
    [errors],
  )

  // Helper that wires ref + aria-invalid + aria-describedby. Spread on input.
  // The page must render the matching error element with `id={fieldId}-error`.
  const getFieldProps = useCallback(
    (name, options = {}) => {
      const fieldId = options.id || name
      const errorId = `${fieldId}-error`
      const hasError = Boolean(errors[name])
      return {
        ref: registerFieldRef(name),
        'aria-invalid': hasError ? 'true' : undefined,
        'aria-describedby': hasError ? errorId : undefined,
        'data-sh-invalid': hasError ? 'true' : undefined,
      }
    },
    [errors, registerFieldRef],
  )

  return {
    errors,
    setErrors,
    setFieldError,
    clearFieldError,
    resetErrors,
    registerFieldRef,
    focusFirstError,
    getFieldProps,
    hasErrors: Object.keys(errors).length > 0,
  }
}

/* ── Style helpers (non-component) ─────────────────────────────────── */

export function invalidInputStyle(hasError) {
  if (!hasError) return null
  return {
    borderColor: 'var(--sh-danger)',
    boxShadow: '0 0 0 1px var(--sh-danger)',
  }
}

export const fieldErrorStyle = Object.freeze({
  marginTop: 6,
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--sh-danger-text)',
  lineHeight: 1.4,
})
