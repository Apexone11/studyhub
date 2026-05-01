/**
 * AchievementGallery.jsx — The main grid component.
 *
 * Used by:
 *   - /achievements (own gallery, full page)
 *   - UserProfilePage AchievementsTab (rendered inside the profile chrome)
 *
 * Shows category filter chips, sort dropdown, locked + secret states, and
 * the level + XP header.
 */

import { useMemo, useState } from 'react'
import AchievementCard from './AchievementCard'
import LevelChip from './LevelChip'
import { TIER_RANK } from './tierStyles'
import { pinAchievement, unpinAchievement } from './useAchievements'

const CATEGORY_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'authoring', label: 'Authoring' },
  { key: 'forking', label: 'Forking' },
  { key: 'reviewing', label: 'Reviewing' },
  { key: 'notes', label: 'Notes' },
  { key: 'groups', label: 'Groups' },
  { key: 'social', label: 'Social' },
  { key: 'ai', label: 'Hub AI' },
  { key: 'streaks', label: 'Streaks' },
  { key: 'special', label: 'Special' },
  { key: 'community', label: 'Community' },
]

const SORTS = {
  recent: { label: 'Recent unlocks', fn: (a, b) => sortDateDesc(a.unlockedAt, b.unlockedAt) },
  rarity: {
    label: 'Rarity (rare → common)',
    fn: (a, b) => (TIER_RANK[b.tier] || 0) - (TIER_RANK[a.tier] || 0),
  },
  tier: {
    label: 'Tier (high → low)',
    fn: (a, b) => (TIER_RANK[b.tier] || 0) - (TIER_RANK[a.tier] || 0),
  },
  display: { label: 'Default', fn: (a, b) => (a.displayOrder || 0) - (b.displayOrder || 0) },
}

function sortDateDesc(a, b) {
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1
  return new Date(b).getTime() - new Date(a).getTime()
}

/**
 * @param {{
 *   items: object[],
 *   stats?: object|null,
 *   ownerView?: boolean,
 *   onMutate?: () => void,
 * }} props
 */
export default function AchievementGallery({ items, stats, ownerView = false, onMutate }) {
  const [category, setCategory] = useState('all')
  const [sortKey, setSortKey] = useState('display')
  const [errorMsg, setErrorMsg] = useState('')

  const visibleItems = useMemo(() => {
    let list = items
    if (category !== 'all') list = list.filter((b) => b.category === category)
    const sortFn = SORTS[sortKey]?.fn || SORTS.display.fn
    return [...list].sort(sortFn)
  }, [items, category, sortKey])

  const totalCount = items.length
  const unlockedCount = items.filter((b) => b.isUnlocked).length
  const secretRemaining = items.filter((b) => b.isSecret && !b.isUnlocked).length

  async function handlePinToggle(slug, willPin) {
    setErrorMsg('')
    try {
      if (willPin) await pinAchievement(slug)
      else await unpinAchievement(slug)
      if (onMutate) onMutate()
    } catch (err) {
      setErrorMsg(err.message || 'Failed to update pin.')
    }
  }

  return (
    <div>
      {/* ── Header: level + XP + counters ───────────────────────────── */}
      {stats && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            flexWrap: 'wrap',
            padding: '14px 18px',
            marginBottom: 18,
            background: 'var(--sh-panel-bg)',
            border: '1px solid var(--sh-panel-border)',
            borderRadius: 14,
          }}
        >
          <LevelChip level={stats.level} highestTier={stats.highestTier} xp={stats.totalXp} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 140 }}>
            <div style={{ fontSize: 12, color: 'var(--sh-muted)' }}>
              {stats.totalXp} XP · {unlockedCount}/{totalCount} unlocked
              {secretRemaining > 0 && ` · ${secretRemaining} secret remaining`}
            </div>
            <XpBar stats={stats} />
          </div>
        </div>
      )}

      {/* ── Filter chips ────────────────────────────────────────────── */}
      <div
        role="tablist"
        aria-label="Achievement categories"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 14,
        }}
      >
        {CATEGORY_FILTERS.map((cat) => {
          const active = category === cat.key
          return (
            <button
              key={cat.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setCategory(cat.key)}
              style={{
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 700,
                borderRadius: 999,
                border: '1px solid var(--sh-panel-border)',
                background: active ? 'var(--sh-brand)' : 'var(--sh-panel-bg)',
                color: active ? 'var(--sh-on-dark)' : 'var(--sh-text)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {cat.label}
            </button>
          )
        })}

        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value)}
          aria-label="Sort achievements"
          style={{
            marginLeft: 'auto',
            padding: '6px 10px',
            fontSize: 12,
            fontWeight: 600,
            borderRadius: 8,
            border: '1px solid var(--sh-panel-border)',
            background: 'var(--sh-panel-bg)',
            color: 'var(--sh-text)',
          }}
        >
          {Object.entries(SORTS).map(([key, def]) => (
            <option key={key} value={key}>
              {def.label}
            </option>
          ))}
        </select>
      </div>

      {/* ── Error banner ────────────────────────────────────────────── */}
      {errorMsg && (
        <div
          role="alert"
          style={{
            padding: '8px 12px',
            marginBottom: 12,
            background: 'var(--sh-warning-bg)',
            color: 'var(--sh-warning-text)',
            border: '1px solid var(--sh-warning-border)',
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          {errorMsg}
        </div>
      )}

      {/* ── Grid ────────────────────────────────────────────────────── */}
      {visibleItems.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '40px 20px',
            color: 'var(--sh-muted)',
            fontSize: 14,
          }}
        >
          No achievements in this category yet.
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: 14,
          }}
        >
          {visibleItems.map((badge) => (
            <AchievementCard
              key={badge.slug}
              badge={badge}
              ownerView={ownerView}
              onPinToggle={ownerView ? handlePinToggle : undefined}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function XpBar({ stats }) {
  if (!stats || stats.nextLevel == null) {
    return <div style={{ fontSize: 11, color: 'var(--sh-muted)' }}>Max level reached.</div>
  }
  const range = stats.nextLevelMinXp - stats.currentLevelMinXp
  const elapsed = Math.max(0, Math.min(range, stats.totalXp - stats.currentLevelMinXp))
  const fraction = range > 0 ? elapsed / range : 0
  return (
    <div
      style={{
        height: 6,
        width: 220,
        background: 'var(--sh-panel-border)',
        borderRadius: 3,
        overflow: 'hidden',
      }}
      aria-label={`Progress to level ${stats.nextLevel}: ${stats.totalXp} of ${stats.nextLevelMinXp} XP`}
      role="progressbar"
      aria-valuenow={stats.totalXp}
      aria-valuemin={stats.currentLevelMinXp}
      aria-valuemax={stats.nextLevelMinXp}
    >
      <div
        style={{
          width: `${Math.round(fraction * 100)}%`,
          height: '100%',
          background: 'var(--sh-brand)',
          transition: 'width 600ms ease',
        }}
      />
    </div>
  )
}
