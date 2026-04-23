// src/mobile/components/MobileInput.jsx
// Text input with floating label, error display, and password eye-toggle.

import { forwardRef, useCallback, useEffect, useId, useState } from 'react'

const MobileInput = forwardRef(function MobileInput(
  {
    label,
    type = 'text',
    value,
    defaultValue,
    onChange,
    onFocus,
    onBlur,
    error,
    autoComplete,
    inputMode,
    name,
    id: idProp,
    disabled = false,
    className = '',
    ...rest
  },
  ref,
) {
  const generatedId = useId()
  const id = idProp || generatedId
  const [showPassword, setShowPassword] = useState(false)
  const [hasValue, setHasValue] = useState(() => {
    if (value !== undefined) return value !== '' && value !== null
    if (defaultValue !== undefined) return defaultValue !== '' && defaultValue !== null
    return false
  })
  // React-canonical "derive state from changing prop" pattern (see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).
  // When `error` changes value, we record it and bump a nonce to replay the
  // CSS shake. `error` here is always a plain string from useState in the
  // parent, so the `!==` compares by value and cannot loop.
  const [lastErr, setLastErr] = useState(error)
  const [shakeNonce, setShakeNonce] = useState(0)
  if (error !== lastErr) {
    setLastErr(error)
    if (error && !lastErr) setShakeNonce((n) => n + 1)
  }
  const shake = shakeNonce > 0
  useEffect(() => {
    if (!shake) return undefined
    const t = setTimeout(() => setShakeNonce(0), 320)
    return () => clearTimeout(t)
  }, [shake])

  const handleChange = useCallback(
    (e) => {
      setHasValue(e.target.value !== '')
      if (typeof onChange === 'function') onChange(e)
    },
    [onChange],
  )

  const isPassword = type === 'password'
  const effectiveType = isPassword && showPassword ? 'text' : type

  const wrapperClasses = [
    'sh-m-input',
    hasValue ? 'sh-m-input--filled' : '',
    error ? 'sh-m-input--error' : '',
    shake ? 'sh-m-input--shake' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={wrapperClasses}>
      <input
        ref={ref}
        id={id}
        name={name}
        type={effectiveType}
        value={value}
        defaultValue={defaultValue}
        onChange={handleChange}
        onFocus={onFocus}
        onBlur={onBlur}
        autoComplete={autoComplete}
        inputMode={inputMode}
        disabled={disabled}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        className="sh-m-input__control"
        placeholder=" "
        {...rest}
      />
      {label && (
        <label htmlFor={id} className="sh-m-input__label">
          {label}
        </label>
      )}
      {isPassword && (
        <button
          type="button"
          aria-label={showPassword ? 'Hide password' : 'Show password'}
          className="sh-m-input__eye"
          onClick={() => setShowPassword((v) => !v)}
        >
          {showPassword ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 4.3A10.3 10.3 0 0 1 12 4c5.5 0 9.4 5 10 8-0.3 1.3-1.1 3-2.5 4.6M6.3 6.3C4.2 8 2.6 10.6 2 12c0.6 3 4.5 8 10 8 1.7 0 3.2-0.4 4.6-1.1"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M2 12c0.6-3 4.5-8 10-8s9.4 5 10 8c-0.6 3-4.5 8-10 8s-9.4-5-10-8z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          )}
        </button>
      )}
      {error && (
        <div id={`${id}-err`} className="sh-m-input__error" role="alert">
          {error}
        </div>
      )}
    </div>
  )
})

export default MobileInput
