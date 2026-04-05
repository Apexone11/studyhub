import { useState, useEffect, useCallback } from 'react'
import { StatsGrid, ModerationOverview, ModerationActivityLog } from './AdminWidgets'
import UserAvatar from '../../components/UserAvatar'
import { API } from '../../config'
import { FONT } from './adminConstants'

/* ── Active Users Widget ───────────────────────────────────────────────── */
function ActiveUsersWidget() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/admin/active-users`, { credentials: 'include' })
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    void load()
    const timer = setInterval(load, 60000)
    return () => clearInterval(timer)
  }, [load])

  const count = data?.count ?? 0
  const users = data?.users ?? []

  return (
    <div style={{
      border: '1px solid var(--sh-border)', borderRadius: 14, padding: '16px 18px',
      background: 'var(--sh-soft)', marginTop: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--sh-heading)' }}>
          Active Users
        </h3>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px',
          borderRadius: 999, background: 'var(--sh-success-bg)', border: '1px solid var(--sh-success-border)',
          color: 'var(--sh-success-text)', fontSize: 12, fontWeight: 700,
        }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--sh-success-text)' }} />
          {loading ? '...' : count} online
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', gap: 8 }}>
          {[1, 2, 3].map((n) => (
            <div key={n} className="sh-skeleton" style={{ width: 32, height: 32, borderRadius: '50%' }} />
          ))}
        </div>
      ) : users.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {users.slice(0, 10).map((u) => (
            <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px 4px 4px', borderRadius: 20, background: 'var(--sh-surface)', border: '1px solid var(--sh-border)' }}>
              <UserAvatar user={u} size={24} />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--sh-text)' }}>{u.username}</span>
            </div>
          ))}
          {count > 10 && (
            <span style={{ fontSize: 12, color: 'var(--sh-muted)', fontWeight: 600 }}>
              +{count - 10} more
            </span>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--sh-muted)' }}>No active users right now.</div>
      )}
    </div>
  )
}

export default function OverviewTab({ overview, loadOverview }) {
  return (
    <section
      style={{
        background: 'var(--sh-surface)',
        borderRadius: 18,
        border: '1px solid var(--sh-border)',
        padding: '22px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, color: 'var(--sh-heading)' }}>Admin Overview</h1>
          <div style={{ fontSize: 12, color: 'var(--sh-subtext)', marginTop: 4 }}>
            This tab polls lightly in the background. Other tabs load only when you open them.
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadOverview()}
          style={{
            padding: '7px 12px',
            borderRadius: 8,
            border: '1px solid var(--sh-border)',
            background: 'var(--sh-surface)',
            color: 'var(--sh-subtext)',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Refresh
        </button>
      </div>

      {overview.error ? (
        <div style={{ color: 'var(--sh-danger)', background: 'var(--sh-danger-bg)', border: '1px solid var(--sh-danger-border)', borderRadius: 12, padding: '12px 14px', fontSize: 13 }}>
          {overview.error}
        </div>
      ) : null}

      {!overview.stats && overview.loading ? (
        <div style={{ color: 'var(--sh-subtext)', fontSize: 13 }}>Loading admin stats…</div>
      ) : overview.stats ? (
        <>
          <StatsGrid stats={overview.stats} />
          <ActiveUsersWidget />
          <ModerationOverview stats={overview.stats} />
          <ModerationActivityLog actions={overview.stats.recentModerationActions} />
        </>
      ) : null}
    </section>
  )
}
