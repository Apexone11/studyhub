# Admin Analytics Upgrade + Settings Scroll Fix

**Date:** 2026-04-05
**Status:** Approved

## Summary

Replace all custom SVG charts in the admin Analytics tab with Recharts components. Add 3 new pie charts (content distribution, user roles, engagement breakdown). Improve engagement trends readability (bigger, tooltips). Improve Overview stats card spacing. Fix settings sidebar by moving Admin Panel link to the top.

## Scope

### In Scope

- Install Recharts library
- Replace all custom SVG charts (BarChart, Sparkline, EngagementChart) with Recharts equivalents
- Add 3 new pie charts: content distribution, user roles, engagement breakdown
- Make engagement trends chart taller (400px), with hover tooltips and readable date labels
- Improve Overview stats card spacing (more padding, larger numbers, subtle borders)
- Move Admin Panel link to top of settings sidebar

### Out of Scope

- Audit log system
- Email suppression fixes
- Pagination changes
- New admin features
- Feed recommendations
- School badges on profiles

## Recharts Installation

Add `recharts` to frontend dependencies. Recharts is ~45KB gzipped, React-native, and provides: `BarChart`, `PieChart`, `LineChart`, `Tooltip`, `Legend`, `ResponsiveContainer`, and more.

## Analytics Tab Overhaul

### Pie Charts Section (new)

Three pie charts displayed in a responsive row (3-column grid, wraps to 2 or 1 on smaller screens). Each chart sits inside a card with title, subtitle, and legend.

**Chart 1: Content Distribution**
- Data: count of sheets, notes, feed posts, announcements
- Source: existing `/api/admin/stats` endpoint already returns these counts (sheets, notes, feedPosts fields)
- Colors: sheets = `#8b5cf6`, notes = `#2563eb`, feed posts = `#f59e0b`, announcements = `#ec4899`

**Chart 2: User Roles**
- Data: count of students, teachers/TAs, admins
- Source: new backend endpoint `GET /api/admin/analytics/user-roles` that does a `groupBy` on `User.role`
- Colors: students = `#2563eb`, teachers = `#f59e0b`, admins = `#ec4899`

**Chart 3: Engagement Breakdown**
- Data: total likes, comments, stars, follows (all-time or period-based matching the period selector)
- Source: new backend endpoint `GET /api/admin/analytics/engagement-totals?period=30d`
- Colors: likes = `#8b5cf6`, comments = `#2563eb`, stars = `#f59e0b`, follows = `#ec4899`

**Pie Chart Design:**
- Recharts `PieChart` with `Pie` component, `outerRadius` 80-100px
- Labels showing percentage on each slice (Recharts custom label)
- `Legend` component below chart
- `Tooltip` showing exact count on hover
- Responsive via `ResponsiveContainer` (width="100%", height={300})

### Engagement Trends Chart (upgraded)

Replace custom `EngagementChart` SVG with Recharts `BarChart`:
- Height: 400px (up from ~200px)
- `ResponsiveContainer` for full-width
- 4 series as stacked or grouped bars: Posts, Comments, Stars, Reactions
- `XAxis` with `dataKey="date"`, auto-formatted labels, `angle={-45}` for readability
- `YAxis` with auto-scaled domain
- `Tooltip` showing all 4 values per day on hover
- `Legend` showing series names with color swatches
- `CartesianGrid` with dashed strokeDasharray for subtle gridlines
- Same 4-color palette as existing

### New User Signups Chart (upgraded)

Replace custom `BarChart` SVG with Recharts `BarChart`:
- Height: 300px
- Single series bar chart with brand color
- Tooltip with exact count per day
- Same `XAxis` date formatting treatment

### Content Creation Charts (upgraded)

Replace 3 small custom SVG bar charts with Recharts versions:
- 3 charts in a row (Sheets, Notes, Feed Posts)
- Each inside `ResponsiveContainer` with height 200px
- Individual color per chart type
- Tooltips and readable date labels

### KPI Sparklines (upgraded)

Replace custom SVG `Sparkline` with tiny Recharts `LineChart`:
- No axes, no grid, no tooltip - just the trend line
- Width 120px, height 32px (matching current dimensions)
- Stroke color matches KPI card accent

## Overview Tab - Stats Card Spacing

Modify `StatsGrid` in `AdminWidgets.jsx`:
- Card padding: increase from 16px to 24px
- Stat number font-size: increase from current to 36px
- Card border: add `1px solid var(--sh-border)`
- Card box-shadow: add `0 1px 3px rgba(0,0,0,0.1)`
- Grid gap: increase from current to 20px
- Label font-size: 12px uppercase with letter-spacing for clarity

## Settings Sidebar - Admin Panel Link

In the settings page sidebar, move the Admin Panel link from the bottom (after all nav items) to the top (before "Profile"). This ensures it's always visible regardless of sidebar height or scroll position.

Keep existing styling: amber warning background, bold text, border.

## Backend Endpoints (new)

### GET /api/admin/analytics/user-roles

Returns user count grouped by role:
```json
{ "roles": [{ "role": "student", "count": 14 }, { "role": "admin", "count": 1 }, { "role": "teacher", "count": 1 }] }
```

Implementation: `prisma.user.groupBy({ by: ['role'], _count: true })`

### GET /api/admin/analytics/engagement-totals

Query param: `period` (7d, 30d, 90d)
Returns total engagement counts for the period:
```json
{ "totals": { "likes": 7, "comments": 0, "stars": 12, "follows": 2 } }
```

Implementation: Count rows in Reaction, FeedPostComment/Comment/NoteComment, StarredSheet, Follow tables within the date range.

Both endpoints use `requireAuth` + `requireAdmin` middleware and `adminLimiter` rate limiter.

## Styling Rules

- All inline style colors use `var(--sh-*)` CSS custom property tokens
- Chart colors use hex values only inside Recharts component props (Recharts doesn't support CSS variables in fill/stroke)
- Card backgrounds, borders, text colors all use CSS tokens
- Font: Plus Jakarta Sans via FONT constant

## Files to Modify

### Frontend

- `frontend/studyhub-app/package.json` - add recharts dependency
- `frontend/studyhub-app/src/pages/admin/AnalyticsTab.jsx` - full rewrite with Recharts
- `frontend/studyhub-app/src/pages/admin/OverviewTab.jsx` - stats card spacing (if styles are here)
- `frontend/studyhub-app/src/pages/admin/AdminWidgets.jsx` - StatsGrid spacing update
- `frontend/studyhub-app/src/pages/settings/SettingsPage.jsx` - move Admin Panel link position

### Backend

- `backend/src/modules/admin/admin.analytics.controller.js` - add 2 new endpoints
- `backend/src/modules/admin/admin.routes.js` - register new routes

## Testing

- All 3 pie charts render with correct data
- Engagement trends chart is 400px tall, shows tooltips on hover
- Date labels are readable (not overlapping)
- Stats cards have visible borders and larger numbers
- Admin Panel link visible at top of settings sidebar without scrolling
- All charts handle empty data gracefully (show "No data" message)
- Period selector (7d/30d/90d) works for all charts including pie charts
- Backend endpoints return correct aggregations
- Responsive: charts resize on window resize
