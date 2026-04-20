// src/mobile/components/Chip.jsx
// Pill/chip primitive. Variants: soft | outline | solid.

import { forwardRef, useCallback } from 'react'
import haptics from '../lib/haptics'

const VARIANTS = new Set(['soft', 'outline', 'solid'])

const Chip = forwardRef(function Chip(
  { variant = 'soft', onPress, leading, className = '', children, ...rest },
  ref,
) {
  const safeVariant = VARIANTS.has(variant) ? variant : 'soft'
  const pressable = typeof onPress === 'function'

  const handleClick = useCallback(
    (e) => {
      if (!pressable) return
      haptics.select()
      onPress(e)
    },
    [pressable, onPress],
  )

  const classes = [
    'sh-m-chip',
    `sh-m-chip--${safeVariant}`,
    pressable ? 'sh-m-chip--pressable' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  if (pressable) {
    return (
      <button ref={ref} type="button" className={classes} onClick={handleClick} {...rest}>
        {leading}
        {children}
      </button>
    )
  }

  return (
    <span ref={ref} className={classes} {...rest}>
      {leading}
      {children}
    </span>
  )
})

export default Chip
