/* Small category pill shared across the newsletter surfaces. Token-driven
 * palette (see newsletterConstants) so it renders correctly in dark mode. */
import { categoryMeta } from './newsletterConstants'

export default function NewsletterCategoryChip({ category }) {
  const meta = categoryMeta(category)
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 10px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.02em',
        background: meta.bg,
        border: `1px solid ${meta.border}`,
        color: meta.text,
        whiteSpace: 'nowrap',
      }}
    >
      {meta.label}
    </span>
  )
}
