/* ═══════════════════════════════════════════════════════════════════════════
 * TopContributors.jsx — Phase 1 of v2 design refresh
 *
 * A compact mini-widget that highlights the people a viewer is likely to
 * learn from. Students + teachers see top contributors among their
 * classmates; self-learners see the top contributors among the users they
 * follow. The component is stateless — it receives its data as a prop so
 * the dashboard hook can decide the right query per role.
 *
 * Safety: no per-student engagement data ever flows through here. The
 * only numbers shown are aggregate contribution counts already visible
 * on each user's public profile.
 *
 * Empty and loading states are role-aware via `roleCopy`.
 * See docs/internal/design-refresh-v2-master-plan.md (Phase 1) and
 * docs/internal/design-refresh-v2-roles-integration.md (Phase 1 role deltas).
 * ═══════════════════════════════════════════════════════════════════════════ */
import { Link } from 'react-router-dom'
import UserAvatar from './UserAvatar'
import { roleCopy } from '../lib/roleCopy'

export default function TopContributors({
  contributors = [],
  accountType = 'student',
  loading = false,
  max = 5,
}) {
  const heading = roleCopy('topContributorsHeading', accountType)
  const emptyMessage = roleCopy('topContributorsEmpty', accountType)

  return (
    <section
      aria-labelledby="top-contributors-heading"
      style={{
        background: 'var(--sh-surface)',
        border: '1px solid var(--sh-border)',
        borderRadius: 14,
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <h3
          id="top-contributors-heading"
          style={{
            margin: 0,
            fontSize: 14,
            fontWeight: 800,
            color: 'var(--sh-heading)',
            letterSpacing: '-0.01em',
          }}
        >
          {heading}
        </h3>
      </header>

      {loading ? (
        <ul
          aria-busy="true"
          style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}
        >
          {Array.from({ length: 3 }).map((_, index) => (
            <li
              key={index}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '6px 0',
              }}
            >
              <div
                aria-hidden="true"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: 'var(--sh-soft)',
                }}
              />
              <div
                aria-hidden="true"
                style={{
                  height: 10,
                  width: '55%',
                  background: 'var(--sh-soft)',
                  borderRadius: 6,
                }}
              />
            </li>
          ))}
        </ul>
      ) : contributors.length === 0 ? (
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: 'var(--sh-muted)',
            lineHeight: 1.6,
          }}
        >
          {emptyMessage}
        </p>
      ) : (
        <ol
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'grid',
            gap: 8,
          }}
        >
          {contributors.slice(0, max).map((c) => (
            <li key={c.id || c.username}>
              <Link
                to={`/users/${c.username}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '6px 4px',
                  borderRadius: 8,
                  textDecoration: 'none',
                  color: 'var(--sh-text)',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--sh-soft)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                <UserAvatar
                  username={c.username}
                  avatarUrl={c.avatarUrl}
                  role={c.role}
                  plan={c.plan}
                  size={32}
                  border="1px solid var(--sh-border)"
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 13,
                      color: 'var(--sh-heading)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {c.displayName || c.username}
                  </div>
                  {typeof c.contributionCount === 'number' ? (
                    <div style={{ fontSize: 11, color: 'var(--sh-muted)', marginTop: 1 }}>
                      {c.contributionCount} contribution{c.contributionCount === 1 ? '' : 's'}
                      {c.contextLabel ? ` · ${c.contextLabel}` : ''}
                    </div>
                  ) : c.contextLabel ? (
                    <div style={{ fontSize: 11, color: 'var(--sh-muted)', marginTop: 1 }}>
                      {c.contextLabel}
                    </div>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
