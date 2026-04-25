// src/mobile/components/MobileButton.jsx
// Button primitive for Mobile Design Refresh v3.
// Variants: primary | secondary | ghost | danger | floating
// Sizes: s | m | l

import { forwardRef, useCallback } from 'react'
import haptics from '../lib/haptics'

const VARIANTS = new Set(['primary', 'secondary', 'ghost', 'danger', 'floating'])
const SIZES = new Set(['s', 'm', 'l'])

const MobileButton = forwardRef(function MobileButton(
  {
    variant = 'primary',
    size = 'm',
    block = false,
    loading = false,
    disabled = false,
    onClick,
    className = '',
    children,
    type = 'button',
    hapticsKind = 'tap', // 'tap' | 'success' | 'warn' | 'select' | 'none'
    ...rest
  },
  ref,
) {
  const safeVariant = VARIANTS.has(variant) ? variant : 'primary'
  const safeSize = SIZES.has(size) ? size : 'm'

  const handleClick = useCallback(
    (e) => {
      if (loading || disabled) return
      if (hapticsKind !== 'none') {
        const fn = haptics[hapticsKind]
        if (typeof fn === 'function') fn()
      }
      if (typeof onClick === 'function') onClick(e)
    },
    [loading, disabled, hapticsKind, onClick],
  )

  const classes = [
    'sh-m-btn',
    `sh-m-btn--${safeVariant}`,
    `sh-m-btn--${safeSize}`,
    block ? 'sh-m-btn--block' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      onClick={handleClick}
      disabled={disabled || loading}
      aria-busy={loading ? 'true' : undefined}
      {...rest}
    >
      {loading ? <span className="sh-m-btn__spinner" aria-hidden="true" /> : children}
    </button>
  )
})

export default MobileButton
