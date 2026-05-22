import { useEffect, useState } from 'react'
import { StatsGrid, ModerationOverview, ModerationActivityLog } from './AdminWidgets'
import { Skeleton } from '../../components/Skeleton'
import { API } from '../../config'

// AI prompt-cache telemetry card (Loop A7, 2026-05-12).
// Reads GET /api/admin/ai/cache-stats?days=7 and shows the 7-day
// weighted-average cache-hit fraction. Target is >=60% per the Hub AI
// v2 master plan; <50% suggests a recent system-prompt edit invalidated
// the cache.
function AiCacheHitRateCard() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    fetch(`${API}/api/admin/ai/cache-stats?days=7`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}))
          throw new Error(body.error || 'Failed to load AI cache stats')
        }
        return r.json()
      })
      .then((d) => {
        if (active) setData(d)
      })
      .catch((err) => {
        if (active) setError(err.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const pct = data ? data.averageCacheHitRate * 100 : 0
  // Health bands map to the same semantic tokens the moderation cards
  // use, so the page reads consistently. Anything <50% is danger
  // (likely prompt-drift regression); 50-60% is warning (under target);
  // >=60% hits the Anthropic recommended floor and is success.
  let tone = 'var(--sh-success-text)'
  let bandLabel = 'Healthy (>=60% target met)'
  if (pct < 50) {
    tone = 'var(--sh-danger-text)'
    bandLabel = 'Low — investigate prompt drift'
  } else if (pct < 60) {
    tone = 'var(--sh-warning-text)'
    bandLabel = 'Below 60% target'
  }

  return (
    <div
      style={{
        marginTop: 20,
        background: 'var(--sh-surface)',
        border: '1px solid var(--sh-border)',
        borderRadius: 14,
        padding: '16px 18px',
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 800,
          color: 'var(--sh-heading)',
          marginBottom: 6,
        }}
      >
        AI cache hit rate
      </div>
      <div
        style={{
          fontSize: 12,
          color: 'var(--sh-subtext)',
          marginBottom: 12,
        }}
      >
        7-day weighted average of Anthropic prompt-cache reads versus total input tokens. Higher is
        cheaper.
      </div>
      {loading ? (
        <Skeleton width="100%" height={32} borderRadius={8} aria-label="Loading cache hit rate" />
      ) : error ? (
        <div
          style={{
            color: 'var(--sh-danger-text)',
            background: 'var(--sh-danger-bg)',
            border: '1px solid var(--sh-danger-border)',
            borderRadius: 10,
            padding: '8px 10px',
            fontSize: 12,
          }}
        >
          {error}
        </div>
      ) : data ? (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
          <div
            style={{
              fontSize: 36,
              fontWeight: 800,
              color: tone,
              lineHeight: 1,
            }}
          >
            {pct.toFixed(1)}%
          </div>
          <div style={{ fontSize: 12, color: 'var(--sh-muted)' }}>
            <div style={{ fontWeight: 700, color: tone, marginBottom: 2 }}>{bandLabel}</div>
            <div>
              {data.totalCacheReadTokens.toLocaleString()} cached /{' '}
              {data.totalInputTokens.toLocaleString()} total input tokens
            </div>
          </div>
        </div>
      ) : null}
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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
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
        <div
          style={{
            color: 'var(--sh-danger)',
            background: 'var(--sh-danger-bg)',
            border: '1px solid var(--sh-danger-border)',
            borderRadius: 12,
            padding: '12px 14px',
            fontSize: 13,
          }}
        >
          {overview.error}
        </div>
      ) : null}

      {!overview.stats && overview.loading ? (
        <div style={{ display: 'grid', gap: 12 }} aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading admin stats…</span>
          <Skeleton width="100%" height={100} borderRadius={12} />
          <Skeleton width="100%" height={80} borderRadius={12} />
          <Skeleton width="100%" height={80} borderRadius={12} />
        </div>
      ) : overview.stats ? (
        <>
          <StatsGrid stats={overview.stats} />
          <ModerationOverview stats={overview.stats} />
          <AiCacheHitRateCard />
          <ModerationActivityLog actions={overview.stats.recentModerationActions} />
        </>
      ) : null}
    </section>
  )
}
