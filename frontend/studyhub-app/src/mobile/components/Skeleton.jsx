// src/mobile/components/Skeleton.jsx
// Skeleton primitive — gradient shimmer placeholder.

export default function Skeleton({
  variant = 'text',
  width,
  height,
  style,
  className = '',
  ...rest
}) {
  const variantClass =
    {
      text: 'sh-m-skel--text',
      title: 'sh-m-skel--title',
      avatar: 'sh-m-skel--avatar',
      card: 'sh-m-skel--card',
    }[variant] || 'sh-m-skel--text'

  const finalStyle = { ...style }
  if (width !== undefined) finalStyle.width = width
  if (height !== undefined) finalStyle.height = height

  return (
    <span
      className={`sh-m-skel ${variantClass} ${className}`.trim()}
      style={finalStyle}
      aria-hidden="true"
      {...rest}
    />
  )
}
