/**
 * Sidebar widget: top contributors across the sheet's full lineage.
 * Pulls from GET /api/sheets/:id/contributors which aggregates non-fork_base
 * commits across the root sheet and every fork descending from it.
 *
 * Hidden entirely when the list is empty (avoids visual clutter on brand-new
 * sheets). Each contributor links to their public profile.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import UserAvatar from '../../../components/UserAvatar'
import { fetchSheetContributors } from '../../../lib/diffService'
import { panelStyle } from './sheetViewerConstants'

const MAX_DISPLAYED = 8

export default function TopContributorsPanel({ sheetId }) {
  const [state, setState] = useState({ loading: true, contributors: [], error: '' })

  useEffect(() => {
    if (!sheetId) return
    let cancelled = false

    fetchSheetContributors(sheetId)
      .then((data) => {
        if (cancelled) return
        setState({
          loading: false,
          contributors: Array.isArray(data.contributors) ? data.contributors.slice(0, MAX_DISPLAYED) : [],
          error: '',
        })
      })
      .catch((err) => {
        if (cancelled) return
        setState({ loading: false, contributors: [], error: err.message || 'Could not load contributors.' })
      })

    return () => { cancelled = true }
  }, [sheetId])

  // Hide the entire panel while loading or when empty — this is a nice-to-have
  // widget, not critical info, so silence is better than noisy empty states.
  if (state.loading || state.error || state.contributors.length === 0) return null

  return (
    <section style={panelStyle()}>
      <h2 style={{ margin: '0 0 10px', fontSize: 15, color: 'var(--sh-heading)' }}>
        Top contributors
      </h2>
      <div style={{ display: 'grid', gap: 10 }}>
        {state.contributors.map(({ user, commits }) => (
          <Link
            key={user.id}
            to={`/users/${user.username}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              textDecoration: 'none',
              color: 'var(--sh-heading)',
            }}
          >
            <UserAvatar username={user.username} avatarUrl={user.avatarUrl} size={28} />
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>
              {user.username}
            </span>
            <span
              title={`${commits} commit${commits === 1 ? '' : 's'}`}
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--sh-brand)',
                background: 'var(--sh-info-bg)',
                padding: '2px 8px',
                borderRadius: 10,
              }}
            >
              {commits}
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}
