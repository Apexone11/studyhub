# StudyHub Gamification System

## Overview

This implementation adds a comprehensive gamification system to StudyHub with three main components:

1. **Streaks** - Track consecutive days of study activity
2. **Weekly Goals** - Monitor progress against weekly activity targets
3. **Enhanced Leaderboard** - Campus-wide activity rankings with weighted scoring

## Architecture

### Core Modules

#### 1. `backend/src/lib/streaks.js`

Provides streak calculation and weekly activity tracking.

**Exported Functions:**

- `getUserStreak(prisma, userId)` - Returns current and longest streaks
  - Walks through UserDailyActivity records in reverse chronological order
  - Counts consecutive days with any activity (commits + sheets + reviews + comments > 0)
  - Returns: `{ currentStreak, longestStreak, lastActiveDate, todayActive }`

- `getWeeklyActivity(prisma, userId, weeklyGoal = 5)` - Returns weekly summary
  - Aggregates activity for current week (Monday-Sunday)
  - Returns: `{ daysActive, totalActions, goal, goalMet, dailyBreakdown }`
  - dailyBreakdown is an array of 7 objects (one per day) with activity counts

#### 2. `backend/src/lib/leaderboard.js`

Calculates campus-wide activity leaderboards with time-period filters.

**Activity Weights:**
- Commits: 2 points
- Sheets: 5 points
- Reviews: 3 points
- Comments: 1 point

**Exported Functions:**

- `getLeaderboard(prisma, period, limit = 20)` - Returns ranked leaderboard
  - Period: "weekly" | "monthly" | "alltime"
  - Returns: Array of users with `{ userId, username, avatarUrl, score, rank, breakdown }`
  - breakdown contains: `{ commits, sheets, reviews, comments }`

#### 3. Badge Updates

Added three new streak badges to `backend/src/lib/badges.js`:

- `streak-3` (bronze) - Threshold: 3-day streak
- `streak-7` (silver) - Threshold: 7-day streak
- `streak-30` (gold) - Threshold: 30-day streak

Updated `checkAndAwardBadges()` to:
- Call `getUserStreak()` for each user
- Award streak badges when currentStreak >= threshold
- Non-blocking with error logging via Sentry

### API Endpoints

#### 1. Personal Endpoints (Authenticated)

**GET /api/users/me/streak**
- Returns user's current streak data
- Response: `{ currentStreak, longestStreak, lastActiveDate, todayActive }`

**GET /api/users/me/weekly-activity**
- Returns user's weekly activity summary
- Response: `{ daysActive, totalActions, goal, goalMet, dailyBreakdown }`

#### 2. Public Leaderboard Endpoint

**GET /api/feed/leaderboard?period=weekly&limit=20**
- Public endpoint, rate-limited to 120 requests per minute
- Query parameters:
  - `period`: "weekly" | "monthly" | "alltime" (default: "weekly")
  - `limit`: 1-100, default 20
- Response: Array of leaderboard entries with rank and breakdown
- Example:
  ```json
  [
    {
      "rank": 1,
      "userId": 42,
      "username": "alice",
      "avatarUrl": "https://...",
      "score": 287,
      "breakdown": {
        "commits": 10,
        "sheets": 15,
        "reviews": 8,
        "comments": 45
      }
    }
  ]
  ```

## Implementation Details

### Streak Calculation

The streak calculation:
1. Fetches up to 366 days of UserDailyActivity records in reverse order
2. Walks through each day checking if total activity > 0
3. Counts consecutive active days from most recent backward
4. Handles "streak still alive" logic: if today has no activity, checks if yesterday was active
5. Tracks longest streak separately for achievement tracking

### Weekly Activity

The weekly summary:
1. Gets the week start date (Monday of current week)
2. Fetches activity for current calendar week (Monday-Sunday)
3. Returns 7-day breakdown with daily totals
4. Compares daysActive against weeklyGoal (default 5 days)

### Leaderboard Aggregation

For time-period filtering:
- **weekly**: Last 7 days of activity
- **monthly**: Last 30 days of activity
- **alltime**: All historical activity

Process:
1. Groups UserDailyActivity by userId
2. Aggregates commits, sheets, reviews, comments for the period
3. Fetches user details for each active user
4. Calculates weighted score using activity weights
5. Sorts by score (descending) and applies limit
6. Assigns rank (1-based index)

## Testing

Comprehensive test suite in `backend/test/gamification.test.js`:

- Streak calculation with gaps and continuous activity
- Weekly activity aggregation and goal tracking
- Leaderboard scoring and ranking
- Activity weight validation
- Edge cases (no activity, partial weeks, ties)

Run tests: `npm --prefix backend test gamification`

## Data Model

Relies on existing `UserDailyActivity` model:
```prisma
model UserDailyActivity {
  id       Int      @id @default(autoincrement())
  userId   Int
  date     DateTime @db.Date
  commits  Int      @default(0)
  sheets   Int      @default(0)
  reviews  Int      @default(0)
  comments Int      @default(0)
  user     User     @relation(...)
  @@unique([userId, date])
}
```

Activity is tracked by `backend/src/lib/activityTracker.js`:
```javascript
await trackActivity(prisma, userId, 'commits')  // or 'sheets', 'reviews', 'comments'
```

## Rate Limiting

- Leaderboard endpoint: 120 requests/minute (public, cached-friendly)
- Personal streak/weekly endpoints: Protected by auth middleware, standard auth rate limits apply

## Error Handling

All functions:
- Catch errors and log via Sentry with context
- Return safe defaults (empty arrays, zero values) on failure
- Never break caller functionality

## Integration Points

The gamification system integrates with:

1. **Activity Tracking**: Leverages existing `trackActivity()` calls throughout the app
2. **Badge System**: Streak badges awarded via existing `checkAndAwardBadges()` flow
3. **User Routes**: New endpoints under `/api/users/me/`
4. **Feed Routes**: Leaderboard endpoint under `/api/feed/`

## Future Enhancements

Potential extensions:

- Weekly goal customization per user
- Achievement notifications when streaks hit milestones
- Leaderboard filters by course or school
- Historical streak data (weekly/monthly streak counts)
- Social features (compare streaks with friends, team challenges)
- Streak freeze power-ups (skip one day without breaking streak)
