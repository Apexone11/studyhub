# Admin Analytics Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace custom SVG charts with Recharts, add 3 pie charts, improve stats card spacing, and fix settings sidebar scroll.

**Architecture:** Install Recharts library, add 2 backend endpoints for pie chart data, rewrite AnalyticsTab.jsx to use Recharts components, update StatsGrid spacing in AdminWidgets.jsx, move Admin Panel link in SettingsPage.jsx.

**Tech Stack:** Recharts, React 19, Express 5, Prisma 6.x

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/studyhub-app/package.json` | Modify | Add recharts dependency |
| `frontend/studyhub-app/src/pages/admin/AnalyticsTab.jsx` | Modify | Replace all charts with Recharts |
| `frontend/studyhub-app/src/pages/admin/AdminWidgets.jsx` | Modify | StatsGrid spacing improvements |
| `frontend/studyhub-app/src/pages/settings/SettingsPage.jsx` | Modify | Move Admin Panel link to top |
| `backend/src/modules/admin/admin.analytics.controller.js` | Modify | Add 2 new endpoints |

---

### Task 1: Install Recharts + Backend Endpoints

**Files:**
- Modify: `frontend/studyhub-app/package.json`
- Modify: `backend/src/modules/admin/admin.analytics.controller.js`

- [ ] **Step 1: Install recharts**

```bash
cd "c:/Users/Abdul PC/OneDrive/Desktop/studyhub/frontend/studyhub-app" && npm install recharts
```

- [ ] **Step 2: Add user-roles endpoint to backend**

In `backend/src/modules/admin/admin.analytics.controller.js`, add before `module.exports = router` (before line 456):

```javascript
// ── GET /analytics/user-roles ── user count by role
router.get('/analytics/user-roles', async (req, res) => {
  try {
    const groups = await prisma.user.groupBy({
      by: ['role'],
      _count: true,
    })
    const roles = groups.map(g => ({ role: g.role, count: g._count }))
    res.json({ roles })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Failed to fetch user roles.' })
  }
})
```

- [ ] **Step 3: Add engagement-totals endpoint to backend**

In the same file, add after the user-roles endpoint:

```javascript
// ── GET /analytics/engagement-totals ── aggregate engagement counts for pie chart
router.get('/analytics/engagement-totals', async (req, res) => {
  try {
    const start = periodStartDate(req.query.period)

    const [likes, comments, stars, follows] = await Promise.all([
      prisma.reaction.count({ where: { createdAt: { gte: start } } }),
      prisma.feedPostComment.count({ where: { createdAt: { gte: start } } }),
      prisma.starredSheet.count({ where: { createdAt: { gte: start } } }),
      prisma.follow.count({ where: { createdAt: { gte: start } } }),
    ])

    res.json({ totals: { likes, comments, stars, follows } })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Failed to fetch engagement totals.' })
  }
})
```

- [ ] **Step 4: Run backend lint**

Run: `npm --prefix backend run lint`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add frontend/studyhub-app/package.json frontend/studyhub-app/package-lock.json backend/src/modules/admin/admin.analytics.controller.js
git commit -m "feat: install recharts and add user-roles + engagement-totals admin endpoints"
```

---

### Task 2: Rewrite AnalyticsTab with Recharts

**Files:**
- Modify: `frontend/studyhub-app/src/pages/admin/AnalyticsTab.jsx`

This is the main task. The entire file (724 lines) needs its chart components replaced with Recharts.

- [ ] **Step 1: Replace imports and remove custom chart components**

Replace lines 1-4 with:

```javascript
import { useCallback, useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line,
} from 'recharts'
import { API } from '../../config'
import { FONT } from './adminConstants'
import UserAvatar from '../../components/UserAvatar'
```

Remove the custom `BarChart` (lines 53-142), `Sparkline` (lines 146-170), and `EngagementChart` (lines 174-301) components entirely. They are replaced by Recharts.

- [ ] **Step 2: Add chart color constants and helper**

After the existing constants (PERIODS, SECTION_STYLE, etc.), add:

```javascript
const CHART_COLORS = {
  brand: '#6366f1',
  blue: '#2563eb',
  amber: '#f59e0b',
  pink: '#ec4899',
  green: '#10b981',
  slate: '#64748b',
}

const PIE_LABEL = ({ name, percent }) => (
  `${name} ${(percent * 100).toFixed(0)}%`
)

const TOOLTIP_STYLE = {
  contentStyle: {
    background: 'var(--sh-surface)',
    border: '1px solid var(--sh-border)',
    borderRadius: 8,
    fontFamily: FONT,
    fontSize: 13,
  },
}
```

- [ ] **Step 3: Add state for new pie chart data and fetch calls**

In the main `AnalyticsTab` component, add two new state variables after existing ones:

```javascript
const [userRoles, setUserRoles] = useState(null)
const [engagementTotals, setEngagementTotals] = useState(null)
```

Inside `fetchAnalytics`, add two more fetch calls to the existing `Promise.all` (or after it):

```javascript
fetch(`${API}/api/admin/analytics/user-roles`, { credentials: 'include' })
  .then(r => r.json()).then(setUserRoles).catch(() => {}),
fetch(`${API}/api/admin/analytics/engagement-totals?period=${p}`, { credentials: 'include' })
  .then(r => r.json()).then(setEngagementTotals).catch(() => {}),
```

- [ ] **Step 4: Replace the User Growth chart section**

Replace the current `<BarChart data={userGrowth?.data}` rendering (around lines 562-571) with:

```jsx
<div style={SECTION_STYLE}>
  <h3 style={SECTION_HEADING}>New User Signups</h3>
  <p style={SECTION_DESC}>{userGrowth?.totalUsers ?? 0} new users in this period</p>
  <ResponsiveContainer width="100%" height={300}>
    <BarChart data={userGrowth?.data || []}>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--sh-border)" />
      <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--sh-muted)' }} angle={-45} textAnchor="end" height={60} />
      <YAxis tick={{ fontSize: 11, fill: 'var(--sh-muted)' }} allowDecimals={false} />
      <Tooltip {...TOOLTIP_STYLE} />
      <Bar dataKey="count" fill={CHART_COLORS.brand} radius={[4, 4, 0, 0]} name="Signups" />
    </BarChart>
  </ResponsiveContainer>
</div>
```

- [ ] **Step 5: Replace the Engagement Trends chart section**

Replace the current `<EngagementChart engagement={engagement}` rendering (around lines 574-582) with:

```jsx
<div style={SECTION_STYLE}>
  <h3 style={SECTION_HEADING}>Engagement Trends</h3>
  <p style={SECTION_DESC}>Daily activity across posts, comments, stars, and reactions</p>
  <ResponsiveContainer width="100%" height={400}>
    <BarChart data={(() => {
      if (!engagement) return []
      const dates = engagement.posts?.map(p => p.date) || []
      return dates.map((date, i) => ({
        date,
        Posts: engagement.posts?.[i]?.count || 0,
        Comments: engagement.comments?.[i]?.count || 0,
        Stars: engagement.stars?.[i]?.count || 0,
        Reactions: engagement.reactions?.[i]?.count || 0,
      }))
    })()}>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--sh-border)" />
      <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--sh-muted)' }} angle={-45} textAnchor="end" height={60} />
      <YAxis tick={{ fontSize: 11, fill: 'var(--sh-muted)' }} allowDecimals={false} />
      <Tooltip {...TOOLTIP_STYLE} />
      <Legend />
      <Bar dataKey="Posts" fill={CHART_COLORS.brand} radius={[4, 4, 0, 0]} />
      <Bar dataKey="Comments" fill={CHART_COLORS.blue} radius={[4, 4, 0, 0]} />
      <Bar dataKey="Stars" fill={CHART_COLORS.amber} radius={[4, 4, 0, 0]} />
      <Bar dataKey="Reactions" fill={CHART_COLORS.pink} radius={[4, 4, 0, 0]} />
    </BarChart>
  </ResponsiveContainer>
</div>
```

- [ ] **Step 6: Replace the Content Creation charts section**

Replace the 3 small custom BarCharts for Sheets/Notes/FeedPosts (around lines 585-637) with:

```jsx
<div style={SECTION_STYLE}>
  <h3 style={SECTION_HEADING}>Content Creation</h3>
  <p style={SECTION_DESC}>Breakdown of new sheets, notes, and feed posts over time</p>
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
    {[
      { key: 'sheets', label: 'Sheets', color: CHART_COLORS.green, data: contentData?.sheets },
      { key: 'notes', label: 'Notes', color: CHART_COLORS.blue, data: contentData?.notes },
      { key: 'feedPosts', label: 'Feed Posts', color: CHART_COLORS.brand, data: contentData?.feedPosts },
    ].map(({ key, label, color, data }) => (
      <div key={key}>
        <h4 style={{ color: 'var(--sh-text)', fontSize: 15, fontWeight: 600, marginBottom: 8, fontFamily: FONT }}>{label}</h4>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data || []}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--sh-border)" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--sh-muted)' }} angle={-45} textAnchor="end" height={50} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--sh-muted)' }} allowDecimals={false} />
            <Tooltip {...TOOLTIP_STYLE} />
            <Bar dataKey="count" fill={color} radius={[4, 4, 0, 0]} name={label} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    ))}
  </div>
</div>
```

- [ ] **Step 7: Replace KPI sparklines with Recharts LineChart**

Replace the `Sparkline` usage inside `KpiCard` component (lines 312-348) with:

```jsx
function KpiCard({ label, value, subtitle, color, sparkData }) {
  return (
    <div style={{
      background: 'var(--sh-surface)', borderRadius: 12, padding: 20,
      border: '1px solid var(--sh-border)',
    }}>
      <div style={{ color: 'var(--sh-muted)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, fontFamily: FONT }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
        <span style={{ fontSize: 32, fontWeight: 700, color: color || 'var(--sh-text)', fontFamily: FONT }}>
          {value ?? '-'}
        </span>
        {sparkData?.length > 1 && (
          <ResponsiveContainer width={120} height={32}>
            <LineChart data={sparkData}>
              <Line type="monotone" dataKey="count" stroke={color || CHART_COLORS.brand} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      {subtitle && (
        <div style={{ color: 'var(--sh-muted)', fontSize: 12, marginTop: 4, fontFamily: FONT }}>{subtitle}</div>
      )}
    </div>
  )
}
```

- [ ] **Step 8: Add Pie Charts section**

Add this new section after the Active Users KPI cards and before User Growth:

```jsx
{/* ── Pie Charts ── */}
<div style={SECTION_STYLE}>
  <h3 style={SECTION_HEADING}>Distribution Overview</h3>
  <p style={SECTION_DESC}>Breakdown of content, users, and engagement</p>
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>

    {/* Content Distribution */}
    <div style={{ background: 'var(--sh-surface)', borderRadius: 12, padding: 20, border: '1px solid var(--sh-border)' }}>
      <h4 style={{ color: 'var(--sh-text)', fontSize: 14, fontWeight: 600, marginBottom: 12, fontFamily: FONT }}>Content Distribution</h4>
      <ResponsiveContainer width="100%" height={250}>
        <PieChart>
          <Pie
            data={[
              { name: 'Sheets', value: contentData?.sheets?.reduce((s, d) => s + d.count, 0) || 0 },
              { name: 'Notes', value: contentData?.notes?.reduce((s, d) => s + d.count, 0) || 0 },
              { name: 'Feed Posts', value: contentData?.feedPosts?.reduce((s, d) => s + d.count, 0) || 0 },
            ].filter(d => d.value > 0)}
            cx="50%" cy="50%" outerRadius={80} label={PIE_LABEL} dataKey="value"
          >
            <Cell fill={CHART_COLORS.brand} />
            <Cell fill={CHART_COLORS.blue} />
            <Cell fill={CHART_COLORS.amber} />
          </Pie>
          <Tooltip {...TOOLTIP_STYLE} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>

    {/* User Roles */}
    <div style={{ background: 'var(--sh-surface)', borderRadius: 12, padding: 20, border: '1px solid var(--sh-border)' }}>
      <h4 style={{ color: 'var(--sh-text)', fontSize: 14, fontWeight: 600, marginBottom: 12, fontFamily: FONT }}>User Roles</h4>
      <ResponsiveContainer width="100%" height={250}>
        <PieChart>
          <Pie
            data={(userRoles?.roles || []).map(r => ({ name: r.role, value: r.count }))}
            cx="50%" cy="50%" outerRadius={80} label={PIE_LABEL} dataKey="value"
          >
            <Cell fill={CHART_COLORS.blue} />
            <Cell fill={CHART_COLORS.amber} />
            <Cell fill={CHART_COLORS.pink} />
          </Pie>
          <Tooltip {...TOOLTIP_STYLE} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>

    {/* Engagement Breakdown */}
    <div style={{ background: 'var(--sh-surface)', borderRadius: 12, padding: 20, border: '1px solid var(--sh-border)' }}>
      <h4 style={{ color: 'var(--sh-text)', fontSize: 14, fontWeight: 600, marginBottom: 12, fontFamily: FONT }}>Engagement Breakdown</h4>
      <ResponsiveContainer width="100%" height={250}>
        <PieChart>
          <Pie
            data={engagementTotals ? [
              { name: 'Likes', value: engagementTotals.totals.likes },
              { name: 'Comments', value: engagementTotals.totals.comments },
              { name: 'Stars', value: engagementTotals.totals.stars },
              { name: 'Follows', value: engagementTotals.totals.follows },
            ].filter(d => d.value > 0) : []}
            cx="50%" cy="50%" outerRadius={80} label={PIE_LABEL} dataKey="value"
          >
            <Cell fill={CHART_COLORS.brand} />
            <Cell fill={CHART_COLORS.blue} />
            <Cell fill={CHART_COLORS.amber} />
            <Cell fill={CHART_COLORS.pink} />
          </Pie>
          <Tooltip {...TOOLTIP_STYLE} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  </div>
</div>
```

- [ ] **Step 9: Lint check**

Run: `npm --prefix frontend/studyhub-app run lint`
Expected: 0 errors

- [ ] **Step 10: Commit**

```bash
git add frontend/studyhub-app/src/pages/admin/AnalyticsTab.jsx
git commit -m "feat: replace custom SVG charts with Recharts, add 3 pie charts for admin analytics"
```

---

### Task 3: Stats Card Spacing + Settings Sidebar Fix

**Files:**
- Modify: `frontend/studyhub-app/src/pages/admin/AdminWidgets.jsx`
- Modify: `frontend/studyhub-app/src/pages/settings/SettingsPage.jsx`

- [ ] **Step 1: Update StatsGrid spacing in AdminWidgets.jsx**

Read the file first, then update the `StatsGrid` component. The grid container style needs more gap, and each card needs more padding, larger numbers, and subtle borders.

Update the grid container (currently uses `display: 'grid'`):
- Change `gap` to `20`
- Keep `gridTemplateColumns: 'repeat(4, 1fr)'`

Update each stat card style:
- `padding: 24` (up from ~16)
- `border: '1px solid var(--sh-border)'`
- `boxShadow: '0 1px 3px rgba(0,0,0,0.08)'`
- `borderRadius: 12`

Update the stat value style:
- `fontSize: 36` (up from current)
- `fontWeight: 700`

Update the stat label style:
- `fontSize: 12`
- `textTransform: 'uppercase'`
- `letterSpacing: '0.5px'`

- [ ] **Step 2: Move Admin Panel link to top in SettingsPage.jsx**

In `SettingsPage.jsx`, move the Admin Panel link block (lines 365-400) from after the `</nav>` to before the `<nav>` tag (before line 336).

The block to move is:
```jsx
{sessionUser?.role === 'admin' && (
  <Link to="/admin" style={{...}}>
    <svg ...>...</svg>
    Admin Panel
  </Link>
)}
```

Move it to just before `<nav className="settings-nav" ...>` and add `marginBottom: 12` to its style (instead of `marginTop: 12`).

- [ ] **Step 3: Lint check**

Run: `npm --prefix frontend/studyhub-app run lint`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add frontend/studyhub-app/src/pages/admin/AdminWidgets.jsx frontend/studyhub-app/src/pages/settings/SettingsPage.jsx
git commit -m "feat: improve stats card spacing and move Admin Panel link to top of settings sidebar"
```

---

### Task 4: Final Validation

- [ ] **Step 1: Run frontend lint**

Run: `npm --prefix frontend/studyhub-app run lint`
Expected: 0 errors

- [ ] **Step 2: Run frontend build**

Run: `npm --prefix frontend/studyhub-app run build`
Expected: Build succeeds

- [ ] **Step 3: Run backend lint**

Run: `npm --prefix backend run lint`
Expected: 0 errors

- [ ] **Step 4: Run backend tests**

Run: `npm --prefix backend test`
Expected: No new test failures

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve lint and build issues from admin analytics upgrade"
```
