/**
 * ActivityHeatmap — GitHub-style contribution graph for user profiles.
 *
 * Props:
 *   data: Array<{ date: string, commits: number, sheets: number, reviews: number, comments: number }>
 *   weeks: number (default 12)
 */
import { useMemo, useState } from 'react'

const CELL = 13
const GAP = 3
const DAYS_PER_WEEK = 7
const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', '']

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'study', label: 'Study' },
  { key: 'build', label: 'Build' },
]

function getIntensity(count) {
  if (count === 0) return 0
  if (count <= 1) return 1
  if (count <= 3) return 2
  if (count <= 6) return 3
  return 4
}

const INTENSITY_COLORS = [
  'var(--sh-soft, #f1f5f9)',
  'var(--sh-brand-soft, #c7d2fe)',
  'var(--sh-brand-light, #818cf8)',
  'var(--sh-brand, #6366f1)',
  'var(--sh-brand-dark, #4338ca)',
]

function buildGrid(data, weeks) {
  const totalDays = weeks * DAYS_PER_WEEK
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const dataMap = new Map()
  for (const row of data) {
    const d = new Date(row.date)
    d.setHours(0, 0, 0, 0)
    dataMap.set(d.toISOString().slice(0, 10), row)
  }

  const cells = []
  const startDay = new Date(today)
  startDay.setDate(startDay.getDate() - totalDays + 1)
  // Align to Sunday
  startDay.setDate(startDay.getDate() - startDay.getDay())

  for (let i = 0; i < totalDays + startDay.getDay(); i++) {
    const d = new Date(startDay)
    d.setDate(d.getDate() + i)
    if (d > today) break
    const key = d.toISOString().slice(0, 10)
    const row = dataMap.get(key)
    cells.push({
      date: key,
      dayOfWeek: d.getDay(),
      commits: row?.commits || 0,
      sheets: row?.sheets || 0,
      reviews: row?.reviews || 0,
      comments: row?.comments || 0,
    })
  }

  return cells
}

function getCount(cell, filter) {
  if (filter === 'study') return cell.sheets + cell.comments
  if (filter === 'build') return cell.commits + cell.reviews
  return cell.commits + cell.sheets + cell.reviews + cell.comments
}

export default function ActivityHeatmap({ data, weeks = 12 }) {
  const [filter, setFilter] = useState('all')
  const cells = useMemo(() => buildGrid(data || [], weeks), [data, weeks])

  const gridByWeek = useMemo(() => {
    const result = []
    let currentWeek = []
    for (const cell of cells) {
      if (cell.dayOfWeek === 0 && currentWeek.length > 0) {
        result.push(currentWeek)
        currentWeek = []
      }
      currentWeek.push(cell)
    }
    if (currentWeek.length > 0) result.push(currentWeek)
    return result
  }, [cells])

  const totalCount = useMemo(
    () => cells.reduce((sum, c) => sum + getCount(c, filter), 0),
    [cells, filter],
  )

  const svgWidth = gridByWeek.length * (CELL + GAP) + 30
  const svgHeight = DAYS_PER_WEEK * (CELL + GAP) + 4

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--sh-heading)' }}>
          {totalCount} contribution{totalCount !== 1 ? 's' : ''} in the last {weeks} weeks
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              style={{
                padding: '3px 10px', borderRadius: 99, border: '1px solid var(--sh-border)',
                background: filter === f.key ? 'var(--sh-brand)' : 'var(--sh-soft)',
                color: filter === f.key ? '#fff' : 'var(--sh-muted)',
                fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
        <svg width={svgWidth} height={svgHeight} style={{ display: 'block' }}>
          {/* Day labels */}
          {DAY_LABELS.map((label, i) => (
            label ? (
              <text
                key={i}
                x={0}
                y={i * (CELL + GAP) + CELL - 2}
                fill="var(--sh-muted)"
                fontSize={9}
                fontFamily="inherit"
              >
                {label}
              </text>
            ) : null
          ))}

          {/* Cells */}
          {gridByWeek.map((week, wi) =>
            week.map((cell) => {
              const count = getCount(cell, filter)
              const intensity = getIntensity(count)
              return (
                <rect
                  key={cell.date}
                  x={30 + wi * (CELL + GAP)}
                  y={cell.dayOfWeek * (CELL + GAP)}
                  width={CELL}
                  height={CELL}
                  rx={3}
                  fill={INTENSITY_COLORS[intensity]}
                  style={{ transition: 'fill 0.15s' }}
                >
                  <title>{`${cell.date}: ${count} contribution${count !== 1 ? 's' : ''}`}</title>
                </rect>
              )
            })
          )}
        </svg>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, justifyContent: 'flex-end' }}>
        <span style={{ fontSize: 10, color: 'var(--sh-muted)', marginRight: 4 }}>Less</span>
        {INTENSITY_COLORS.map((color, i) => (
          <div key={i} style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
        ))}
        <span style={{ fontSize: 10, color: 'var(--sh-muted)', marginLeft: 4 }}>More</span>
      </div>
    </div>
  )
}
