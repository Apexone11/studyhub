// src/mobile/components/AuroraCard.jsx
// Card primitive for the Mobile Design Refresh v3. Variants match the spec:
//   default | photo | sheet | post | ai
// Press feedback runs through springPress + haptic tap.

import { forwardRef, useCallback } from 'react'
import haptics from '../lib/haptics'

const VARIANTS = new Set(['default', 'photo', 'sheet', 'post', 'ai'])

const AuroraCard = forwardRef(function AuroraCard(
  {
    as: Tag = 'div',
    variant = 'default',
    onPress,
    padding = 'md',
    className = '',
    children,
    style,
    ...rest
  },
  ref,
) {
  const safeVariant = VARIANTS.has(variant) ? variant : 'default'
  const pressable = typeof onPress === 'function'

  const handleClick = useCallback(
    (e) => {
      if (!pressable) return
      haptics.tap()
      onPress(e)
    },
    [pressable, onPress],
  )

  const bodyClass = padding === 'lg' ? 'sh-m-card__body sh-m-card__body--lg' : 'sh-m-card__body'
  const variantClass = `sh-m-card--${safeVariant}`
  const pressClass = pressable ? 'sh-m-card--pressable' : ''

  const tagProps = pressable ? { role: Tag === 'button' ? undefined : 'button', tabIndex: 0 } : {}

  return (
    <Tag
      ref={ref}
      className={`sh-m-card ${variantClass} ${pressClass} ${className}`.trim()}
      style={style}
      onClick={pressable ? handleClick : rest.onClick}
      onKeyDown={
        pressable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                handleClick(e)
              }
            }
          : rest.onKeyDown
      }
      {...tagProps}
      {...rest}
    >
      <div className={bodyClass}>{children}</div>
    </Tag>
  )
})

export default AuroraCard
