/* ═══════════════════════════════════════════════════════════════════════════
 * FeedAside.jsx — Leaderboard sidebar for the feed page
 * ═══════════════════════════════════════════════════════════════════════════ */
import { Link } from 'react-router-dom'
import { IconPlus } from '../../components/Icons'
import { linkButton } from './feedConstants'
import { Panel, LeaderboardPanel } from './FeedWidgets'
import { timeAgo } from '../sheets/sheetsPageConstants'
import TrendingSection from './TrendingSection'

export default function FeedAside({ leaderboards, starredUpdates, recentlyViewed = [] }) {
  return (
    <aside className="feed-aside" data-tutorial="feed-leaderboards" style={{ display: 'grid', gap: 16 }}>
      {recentlyViewed.length > 0 ? (
        <Panel title="Resume studying" helper="Recently viewed sheets">
          <div style={{ display: 'grid', gap: 8 }}>
            {recentlyViewed.slice(0, 3).map((entry) => (
              <Link
                key={entry.id}
                to={`/sheets/${entry.id}`}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  borderRadius: 10,
                  background: 'var(--sh-soft)',
                  border: '1px solid var(--sh-border)',
                  textDecoration: 'none',
                  transition: 'border-color 0.12s',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sh-heading)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {entry.title}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--sh-muted)' }}>
                    {entry.courseCode || 'General'} · {entry.authorUsername || 'unknown'}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--sh-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {timeAgo(entry.viewedAt)}
                </div>
              </Link>
            ))}
          </div>
        </Panel>
      ) : null}
      {starredUpdates.length > 0 ? (
        <Panel title="Your starred sheets" helper="Recently updated">
          <div style={{ display: 'grid', gap: 8 }}>
            {starredUpdates.map((sheet) => (
              <Link
                key={sheet.id}
                to={`/sheets/${sheet.id}`}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  borderRadius: 10,
                  background: 'var(--sh-soft)',
                  border: '1px solid var(--sh-border)',
                  textDecoration: 'none',
                  transition: 'border-color 0.12s',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sh-heading)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {sheet.title}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--sh-muted)' }}>
                    {sheet.course?.code || 'General'} · {sheet.author?.username || 'unknown'}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 3 }}>
                    {sheet.commentCount > 0 ? (
                      <span style={{ fontSize: 10, color: 'var(--sh-brand)', fontWeight: 700 }}>
                        {sheet.commentCount} {sheet.commentCount === 1 ? 'comment' : 'comments'}
                      </span>
                    ) : null}
                    {sheet.forks > 0 ? (
                      <span style={{ fontSize: 10, color: 'var(--sh-success-text)', fontWeight: 700 }}>
                        {sheet.forks} {sheet.forks === 1 ? 'fork' : 'forks'}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--sh-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {timeAgo(sheet.updatedAt)}
                </div>
              </Link>
            ))}
          </div>
          <Link to="/sheets?starred=1" style={{ display: 'block', marginTop: 10, fontSize: 12, fontWeight: 700, color: 'var(--sh-brand)', textDecoration: 'none' }}>
            View all starred
          </Link>
        </Panel>
      ) : null}
      <TrendingSection period="7d" limit={6} />
      <LeaderboardPanel title="Top Starred" items={leaderboards.stars} empty="No starred sheets yet." renderLabel={(item) => item.title} />
      <LeaderboardPanel title="Most Downloaded" items={leaderboards.downloads} empty="No downloads yet." renderLabel={(item) => item.title} />
      <LeaderboardPanel title="Top Contributors" items={leaderboards.contributors} empty="No contributor activity yet." renderLabel={(item) => item.username} />
      <Panel title="Version 1 collaboration tips">
        <div style={{ display: 'grid', gap: 10, color: 'var(--sh-subtext)', fontSize: 13, lineHeight: 1.7 }}>
          <div>Post updates with @mentions, fork a sheet before improving it, and send contributions back from your fork so the original author can review safely.</div>
          <Link to="/sheets/upload" style={{ ...linkButton(), justifyContent: 'center' }}><IconPlus size={13} /> New Sheet</Link>
        </div>
      </Panel>
      {leaderboards.error ? <div style={{ color: 'var(--sh-danger)', fontSize: 13 }}>{leaderboards.error}</div> : null}
    </aside>
  )
}
