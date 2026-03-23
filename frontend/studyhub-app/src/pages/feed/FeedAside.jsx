/* ═══════════════════════════════════════════════════════════════════════════
 * FeedAside.jsx — Leaderboard sidebar for the feed page
 * ═══════════════════════════════════════════════════════════════════════════ */
import { Link } from 'react-router-dom'
import { IconPlus } from '../../components/Icons'
import { linkButton } from './feedConstants'
import { Panel, LeaderboardPanel } from './FeedWidgets'

export default function FeedAside({ leaderboards }) {
  return (
    <aside className="feed-aside" data-tutorial="feed-leaderboards" style={{ display: 'grid', gap: 16 }}>
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
