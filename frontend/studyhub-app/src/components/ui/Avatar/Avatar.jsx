import { forwardRef, useState } from 'react'
import styles from './Avatar.module.css'

/**
 * Avatar — generic, design-system-aligned user avatar primitive.
 *
 * See `docs/internal/audits/2026-04-24-day2-primitives-plus-phase2-handoff.md`
 * Part B for the canonical spec.
 *
 * API:
 *
 *   size     28 | 40 | 80 | 120   default 40 — locked sizes matching Figma.
 *   name     string                required for alt text + initials fallback.
 *   src      string                optional image URL; falls back to initials
 *                                  on missing or broken image.
 *   online   boolean               default false. Shows a green dot.
 *
 * NB: this is the Figma-aligned primitive. The product-specific
 * `components/UserAvatar.jsx` (with Pro/Donor badges, admin styling,
 * role-aware coloring) is the correct choice for StudyHub-specific UI;
 * this primitive is for generic uses that just need "a circle with an
 * image or initials."
 */

const SIZES = [28, 40, 80, 120]

function initialsFrom(name) {
  if (!name || typeof name !== 'string') return '?'
  const trimmed = name.trim()
  if (!trimmed) return '?'
  const words = trimmed.split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase()
  }
  return (words[0][0] + words[1][0]).toUpperCase()
}

const Avatar = forwardRef(function Avatar(
  { size = 40, name, src, online = false, className, ...rest },
  ref,
) {
  const [imgBroken, setImgBroken] = useState(false)
  const resolvedSize = SIZES.includes(size) ? size : 40
  const showImg = Boolean(src) && !imgBroken

  const classes = [styles.avatar, styles[`avatar--${resolvedSize}`], className]
    .filter(Boolean)
    .join(' ')

  return (
    <span ref={ref} className={classes} {...rest}>
      {showImg ? (
        <img
          src={src}
          alt={name || ''}
          className={styles.img}
          loading="lazy"
          onError={() => setImgBroken(true)}
        />
      ) : (
        <span aria-hidden="true">{initialsFrom(name)}</span>
      )}
      {online ? <span className={styles.online} aria-label="Online" /> : null}
    </span>
  )
})

export default Avatar
