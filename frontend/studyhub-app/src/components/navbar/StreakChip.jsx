/**
 * StreakChip — compact streak indicator for the navbar (Bucket C2).
 *
 * Reads GET /api/users/me/streak via useFetch (SWR 5min) so it's cheap
 * to mount on every authenticated page. Renders nothing when:
 *   - The user has no streak (currentStreak == 0).
 *   - The endpoint fails (graceful degrade — no error UI in the nav).
 *
 * Clicking the chip routes to the user's profile achievements tab so
 * they can see what's contributing to the streak. Tooltip on hover/focus
 * tells them "Don't break the chain — keep studying daily!"
 *
 * Why a fire glyph: the streak metaphor universally maps to "🔥" but
 * CLAUDE.md forbids emoji in UI chrome. We use a small SVG flame glyph
 * that conveys the same intent without an emoji codepoint.
 */
import { Link } from 'react-router-dom'
import useFetch from '../../lib/useFetch'
import { useSession } from '../../lib/session-context'

function FlameGlyph({ size = 12 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path d="M13.5 0.5c0 4-2.5 5-2.5 9 0 1.5 0.5 3 1.5 4 -0.5-2 -0.5-3.5 1-5 0 2 1 3.5 3 4.5 1.5 0.75 2.5 2 2.5 4 0 3.5-3.5 6-7 6s-7-2.5-7-6.5C5 13 9 11.5 9 7c0-2-1-3.5-1-3.5C10.5 4 13.5 6 13.5 0.5z" />
    </svg>
  )
}

export default function StreakChip() {
  const { user } = useSession()
  const { data } = useFetch(user ? '/api/users/me/streak' : null, {
    skip: !user,
    swr: 5 * 60 * 1000,
  })

  const current = Number(data?.currentStreak || 0)
  if (!user || current <= 0) return null

  const username = user.username
  const href = username ? `/users/${username}?tab=achievements` : '/users/me'

  return (
    <Link
      to={href}
      title="Don't break the chain — keep studying daily!"
      aria-label={`${current} day study streak`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 10px',
        borderRadius: 999,
        background: 'var(--sh-warning-bg, #fffbeb)',
        border: '1px solid var(--sh-warning-border, #fde68a)',
        color: 'var(--sh-warning-text, #92400e)',
        fontSize: 12,
        fontWeight: 700,
        textDecoration: 'none',
        whiteSpace: 'nowrap',
        lineHeight: 1,
        cursor: 'pointer',
      }}
    >
      <FlameGlyph size={12} />
      <span>{current}d</span>
    </Link>
  )
}
