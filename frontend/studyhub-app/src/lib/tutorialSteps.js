/* ═══════════════════════════════════════════════════════════════════════════
 * tutorialSteps.js — Per-page tutorial step definitions for react-joyride
 *
 * Each page gets 3-5 steps max (Hick's Law — don't overwhelm users).
 * Steps target CSS selectors that exist on the page.
 * Keep content short and actionable.
 * ═══════════════════════════════════════════════════════════════════════════ */

export const FEED_STEPS = [
  {
    target: '[data-tutorial="feed-composer"]',
    title: 'Share with classmates',
    content: 'Post updates, questions, or links to your latest study sheets here. Mention classmates with @username.',
    disableBeacon: true,
  },
  {
    target: '[data-tutorial="feed-filters"]',
    title: 'Filter the feed',
    content: 'Filter by posts, sheets, or announcements to find exactly what you need.',
  },
  {
    target: '[data-tutorial="feed-search"]',
    title: 'Search the feed',
    content: 'Search for specific topics, users, or course content across all feed items.',
  },
  {
    target: '[data-tutorial="feed-leaderboards"]',
    title: 'Leaderboards',
    content: 'See top starred sheets, most downloaded content, and top contributors in your courses.',
  },
]

export const SHEETS_STEPS = [
  {
    target: '[data-tutorial="sheets-search"]',
    title: 'Search sheets',
    content: 'Search sheets by title, description, or content keywords.',
    disableBeacon: true,
  },
  {
    target: '[data-tutorial="sheets-filters"]',
    title: 'Filter and sort',
    content: 'Filter by school, course, or sort by stars, downloads, and more.',
  },
  {
    target: '[data-tutorial="sheets-upload"]',
    title: 'Upload a sheet',
    content: 'Share your own study sheets with classmates. You can upload PDFs and images.',
  },
  {
    target: '[data-tutorial="sheets-toggles"]',
    title: 'Your sheets and favorites',
    content: 'Toggle "Mine" to see sheets you uploaded, or "Starred" to find your saved favorites.',
  },
]

export const DASHBOARD_STEPS = [
  {
    target: '[data-tutorial="dashboard-hero"]',
    title: 'Welcome to your dashboard',
    content: 'This is your personal study hub. See your stats, recent activity, and quick actions at a glance.',
    disableBeacon: true,
  },
  {
    target: '[data-tutorial="dashboard-stats"]',
    title: 'Your stats',
    content: 'Track your enrolled courses, uploaded sheets, and starred content.',
  },
  {
    target: '[data-tutorial="dashboard-sheets"]',
    title: 'Recent sheets',
    content: 'Quick access to the latest sheets in your enrolled courses.',
  },
  {
    target: '[data-tutorial="dashboard-actions"]',
    title: 'Quick actions',
    content: 'Jump to common tasks like uploading sheets, taking practice tests, or reviewing notes.',
  },
]

export const NOTES_STEPS = [
  {
    target: '[data-tutorial="notes-filters"]',
    title: 'Filter your notes',
    content: 'View all notes, or filter by private and shared notes.',
    disableBeacon: true,
  },
  {
    target: '[data-tutorial="notes-create"]',
    title: 'Create a note',
    content: 'Start a new markdown note. Notes are private by default and auto-save as you type.',
  },
]
