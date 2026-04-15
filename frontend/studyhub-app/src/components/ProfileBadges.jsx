import { IconSchool } from './Icons'
import { isSelfLearner } from '../lib/roleCopy'

/**
 * Single-source profile-badge row. Handles the school chip with bidirectional
 * Self-learner suppression (hide if viewer OR profile is 'other'), per plan §7.
 *
 * Accepts an optional children prop so callers can slot role/Pro/donor badges
 * alongside the school chip without duplicating the surrounding flex container.
 */
export default function ProfileBadges({ profile, viewerAccountType, children }) {
  const school = profile?.enrollments?.[0]?.course?.school
  const hideSchool =
    isSelfLearner(viewerAccountType) || isSelfLearner(profile?.accountType) || !school

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {children}
      {hideSchool ? null : (
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: '2px 10px',
            borderRadius: 99,
            background: 'rgba(14,165,233,0.18)',
            color: 'var(--sh-info-text)',
            border: '1px solid rgba(14,165,233,0.3)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <IconSchool size={11} />
          {school.short}
        </span>
      )}
    </div>
  )
}
