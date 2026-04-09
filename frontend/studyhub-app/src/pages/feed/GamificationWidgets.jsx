/**
 * GamificationWidgets — Streak, weekly progress, and leaderboard widgets.
 *
 * Exports:
 * - StreakWidget: Current and longest streak display
 * - WeeklyProgressWidget: 7-day activity bar chart
 * - LeaderboardWidget: Top 5 users with rankings
 *
 * Fetches from:
 * - GET /api/users/me/streak
 * - GET /api/users/me/weekly-activity
 * - GET /api/feed/leaderboard?period=weekly
 */
import { Link } from 'react-router-dom'
import { Panel } from './FeedWidgets'
import UserAvatar from '../../components/UserAvatar'
import useFetch from '../../lib/useFetch'

const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"

/**
 * StreakWidget — Shows current streak, longest streak, and today's activity status.
 */
export function StreakWidget() {
  const {
    data: streak,
    loading,
    error,
  } = useFetch('/api/users/me/streak', {
    initialData: { currentStreak: 0, longestStreak: 0, lastActiveDate: null, todayActive: false },
    swr: 5 * 60 * 1000,
  })

  if (loading) {
    return (
      <Panel title="Your Streak" helper="Stay consistent">
        <div style={{ color: 'var(--sh-muted)', fontSize: 13 }}>Loading...</div>
      </Panel>
    )
  }

  if (error) {
    return (
      <Panel title="Your Streak" helper="Stay consistent">
        <div style={{ color: 'var(--sh-muted)', fontSize: 12 }}>Could not load streak data.</div>
      </Panel>
    )
  }

  return (
    <Panel title="Your Streak" helper="Stay consistent">
      <div style={{ display: 'grid', gap: 14 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
          }}
        >
          <div style={streakBoxStyle}>
            <div style={streakNumberStyle}>{streak.currentStreak}</div>
            <div style={streakLabelStyle}>Current Streak</div>
          </div>
          <div style={streakBoxStyle}>
            <div style={streakNumberStyle}>{streak.longestStreak}</div>
            <div style={streakLabelStyle}>Longest Streak</div>
          </div>
        </div>
        {streak.todayActive && (
          <div
            style={{
              padding: '8px 12px',
              borderRadius: 10,
              background: 'var(--sh-success-bg)',
              border: '1px solid var(--sh-success-border)',
              color: 'var(--sh-success-text)',
              fontSize: 12,
              fontWeight: 600,
              textAlign: 'center',
            }}
          >
            Active today
          </div>
        )}
      </div>
    </Panel>
  )
}

/**
 * WeeklyProgressWidget — 7-day bar chart showing activity progress.
 */
export function WeeklyProgressWidget() {
  const {
    data: weekly,
    loading,
    error,
  } = useFetch('/api/users/me/weekly-activity', {
    initialData: {
      daysActive: 0,
      totalActions: 0,
      goal: 0,
      goalMet: false,
      dailyBreakdown: [],
    },
    swr: 5 * 60 * 1000,
  })

  if (loading) {
    return (
      <Panel title="This Week" helper="Activity goal">
        <div style={{ color: 'var(--sh-muted)', fontSize: 13 }}>Loading...</div>
      </Panel>
    )
  }

  if (error) {
    return (
      <Panel title="This Week" helper="Activity goal">
        <div style={{ color: 'var(--sh-muted)', fontSize: 12 }}>Could not load activity data.</div>
      </Panel>
    )
  }

  const goalProgress = weekly.goal > 0 ? (weekly.daysActive / weekly.goal) * 100 : 0
  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const maxDaily =
    weekly.dailyBreakdown.length > 0
      ? Math.max(...weekly.dailyBreakdown.map((d) => d.actions || 0))
      : 1

  // Circle progress ring dimensions
  const ringRadius = 32
  const circumference = 2 * Math.PI * ringRadius
  const strokeDashoffset = circumference - (Math.min(goalProgress, 100) / 100) * circumference
  const ringColor = weekly.goalMet ? 'var(--sh-success)' : 'var(--sh-brand)'

  return (
    <Panel title="This Week" helper="Activity goal">
      <div style={{ display: 'grid', gap: 16 }}>
        {/* Circular progress ring */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              position: 'relative',
              width: 80,
              height: 80,
            }}
          >
            <svg
              width="80"
              height="80"
              viewBox="0 0 80 80"
              style={{ transform: 'rotate(-90deg)', display: 'block' }}
            >
              {/* Background track */}
              <circle
                cx="40"
                cy="40"
                r={ringRadius}
                fill="none"
                stroke="var(--sh-soft)"
                strokeWidth="4"
              />
              {/* Progress ring */}
              <circle
                cx="40"
                cy="40"
                r={ringRadius}
                fill="none"
                stroke={ringColor}
                strokeWidth="4"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                style={{
                  transition: 'stroke-dashoffset 0.3s ease, stroke 0.3s ease',
                }}
              />
            </svg>
            {/* Center text overlaid on ring */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: 80,
                height: 80,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: 'var(--sh-heading)',
                  fontFamily: FONT,
                  lineHeight: 1,
                }}
              >
                {weekly.daysActive}/{weekly.goal}
              </div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: 'var(--sh-muted)',
                  fontFamily: FONT,
                }}
              >
                {weekly.goalMet ? 'Goal met' : 'days'}
              </div>
            </div>
          </div>
        </div>

        {/* Daily breakdown bars */}
        {weekly.dailyBreakdown.length > 0 && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 90 }}>
            {weekly.dailyBreakdown.map((day, idx) => {
              const dayHeight = maxDaily > 0 ? (day.actions / maxDaily) * 100 : 0
              const isActive = day.actions > 0
              return (
                <div
                  key={idx}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <div
                    title={`${day.actions} action${day.actions !== 1 ? 's' : ''}`}
                    style={{
                      width: '100%',
                      height: `${dayHeight}%`,
                      minHeight: isActive ? 4 : 2,
                      borderRadius: '4px 4px 0 0',
                      background: isActive ? 'var(--sh-brand)' : 'var(--sh-border)',
                      transition: 'background 0.15s, height 0.15s',
                      cursor: 'pointer',
                    }}
                  />
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: 'var(--sh-muted)',
                      fontFamily: FONT,
                    }}
                  >
                    {dayLabels[idx]}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Total actions count */}
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--sh-subtext)',
            textAlign: 'center',
            paddingTop: 4,
            borderTop: '1px solid var(--sh-border)',
            fontFamily: FONT,
          }}
        >
          {weekly.totalActions} action{weekly.totalActions !== 1 ? 's' : ''} this week
        </div>
      </div>
    </Panel>
  )
}

/**
 * LeaderboardWidget — Top 5 users with ranking and score.
 */
export function LeaderboardWidget() {
  const {
    data: leaderboard,
    loading,
    error,
  } = useFetch('/api/feed/leaderboard?period=weekly&limit=5', {
    initialData: [],
    swr: 5 * 60 * 1000,
  })
  const { data: currentUser } = useFetch('/api/users/me', { swr: 2 * 60 * 1000 })

  const currentUserRank =
    leaderboard && Array.isArray(leaderboard) && currentUser && currentUser.id
      ? leaderboard.findIndex((u) => u.userId === currentUser.id)
      : -1

  if (loading) {
    return (
      <Panel title="Weekly Leaderboard" helper="Top performers">
        <div style={{ color: 'var(--sh-muted)', fontSize: 13 }}>Loading...</div>
      </Panel>
    )
  }

  if (error) {
    return (
      <Panel title="Weekly Leaderboard" helper="Top performers">
        <div style={{ color: 'var(--sh-muted)', fontSize: 12 }}>Could not load leaderboard.</div>
      </Panel>
    )
  }

  if (leaderboard.length === 0) {
    return (
      <Panel title="Weekly Leaderboard" helper="Top performers">
        <div style={{ color: 'var(--sh-muted)', fontSize: 13 }}>No leaderboard data yet.</div>
      </Panel>
    )
  }

  return (
    <Panel title="Weekly Leaderboard" helper="Top performers">
      <div style={{ display: 'grid', gap: 10 }}>
        {leaderboard.map((user, idx) => {
          const isCurrentUser = currentUserRank === idx
          return (
            <Link
              key={`${user.userId}-${idx}`}
              to={`/users/${user.username}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                borderRadius: 10,
                background: isCurrentUser ? 'var(--sh-brand-soft)' : 'var(--sh-soft)',
                border: `1px solid ${isCurrentUser ? 'var(--sh-brand-border)' : 'var(--sh-border)'}`,
                textDecoration: 'none',
                transition: 'background 0.15s',
              }}
            >
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  background: 'var(--sh-brand)',
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 800,
                  flexShrink: 0,
                }}
              >
                {user.rank || idx + 1}
              </div>

              <UserAvatar username={user.username} avatarUrl={user.avatarUrl} size={32} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: 'var(--sh-heading)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {user.username}
                </div>
                {user.breakdown && (
                  <div
                    style={{
                      fontSize: 10,
                      color: 'var(--sh-muted)',
                    }}
                  >
                    {user.breakdown.posts || 0} posts
                  </div>
                )}
              </div>

              <div
                style={{
                  fontSize: 13,
                  fontWeight: 800,
                  color: 'var(--sh-brand)',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {user.score || 0}
              </div>
            </Link>
          )
        })}
      </div>
    </Panel>
  )
}

const streakBoxStyle = {
  padding: 14,
  borderRadius: 12,
  background: 'var(--sh-soft)',
  border: '1px solid var(--sh-border)',
  textAlign: 'center',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
}

const streakNumberStyle = {
  fontSize: 28,
  fontWeight: 800,
  color: 'var(--sh-brand)',
  fontFamily: FONT,
  lineHeight: 1,
}

const streakLabelStyle = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--sh-muted)',
  fontFamily: FONT,
}
