/* ═══════════════════════════════════════════════════════════════════════════
 * tutorialSteps.js — Per-page tutorial step definitions for react-joyride
 *
 * Each page gets 3-5 steps max (Hick's Law — don't overwhelm users).
 * Steps target CSS selectors that exist on the page.
 * Keep content short and actionable.
 *
 * v2: Updated for all current features (Messages, Study Groups, Sheet Lab,
 *     My Courses, Discovery, Contributions).
 * ═══════════════════════════════════════════════════════════════════════════ */

export const TUTORIAL_VERSIONS = {
  feed: 2,
  sheets: 2,
  dashboard: 2,
  notes: 2,
  settings: 3,
  profile: 2,
  viewer: 2,
  announcements: 3,
  upload: 2,
  messages: 2,
  studyGroups: 2,
  sheetLab: 1,
  myCourses: 1,
}

export const FEED_STEPS = [
  {
    target: '[data-tutorial="feed-composer"]',
    title: 'Share with classmates',
    content:
      'Post updates, questions, or links to your latest study sheets. Mention classmates with @username.',
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
    title: 'Trending and leaderboards',
    content: 'See trending sheets, top contributors, and follow suggestions in the sidebar.',
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
    content:
      'Share your own study sheets. You can write in Markdown, paste HTML, or attach PDFs and images.',
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
    content: 'Your personal study hub. See stats, recent activity, and quick actions at a glance.',
    disableBeacon: true,
  },
  {
    target: '[data-tutorial="dashboard-stats"]',
    title: 'Your stats',
    content: 'Track enrolled courses, uploaded sheets, starred content, and contributions.',
  },
  {
    target: '[data-tutorial="dashboard-sheets"]',
    title: 'Recent sheets',
    content: 'Quick access to the latest sheets in your enrolled courses.',
  },
  {
    target: '[data-tutorial="dashboard-actions"]',
    title: 'Quick actions',
    content:
      'Jump to common tasks like uploading sheets, messaging classmates, or reviewing notes.',
  },
]

export const NOTES_STEPS = [
  {
    target: '[data-tutorial="notes-filters"]',
    title: 'Filter your notes',
    content: 'View all notes, or filter by private, shared, and starred notes.',
    disableBeacon: true,
  },
  {
    target: '[data-tutorial="notes-create"]',
    title: 'Create a note',
    content: 'Start a new markdown note. Notes are private by default and auto-save as you type.',
  },
  {
    target: '[data-tutorial="notes-editor"]',
    title: 'Rich editing',
    content: 'Notes support full markdown with live preview. Assign a course to organize them.',
  },
]

export const SETTINGS_STEPS = [
  {
    target: '[data-tutorial="settings-avatar"]',
    title: 'Upload a profile photo',
    content: 'Add a photo so other students can recognize you. Drag and zoom to crop.',
    disableBeacon: true,
  },
  {
    target: '[data-tutorial="settings-tabs"]',
    title: 'Settings categories',
    content:
      'Move between profile, account, security, sessions, notifications, privacy, appearance, subscription, legal, and moderation tools from one nav.',
  },
  {
    target: '[data-tutorial="settings-appearance"]',
    title: 'Customize appearance',
    content:
      'Theme, font size, and tutorial controls live here. You can disable auto-tutorials or reset every walkthrough at once.',
  },
  {
    target: '[data-tutorial="settings-notifications"]',
    title: 'Notification preferences',
    content:
      'Choose email and in-app alerts for comments, mentions, social activity, study groups, contributions, and other account updates.',
  },
]

export const PROFILE_STEPS = [
  {
    target: '[data-tutorial="profile-avatar"]',
    title: 'Your profile',
    content: 'Click your avatar to upload and crop a profile photo.',
    disableBeacon: true,
  },
  {
    target: '[data-tutorial="profile-stats"]',
    title: 'Profile stats',
    content: 'See sheets, stars received, followers, and a detailed activity breakdown.',
  },
  {
    target: '[data-tutorial="profile-sheets"]',
    title: 'Sheets and contributions',
    content: 'Browse published sheets, pinned content, and contribution history.',
  },
  {
    target: '[data-tutorial="profile-follow"]',
    title: 'Follow and connect',
    content: 'Follow users to stay updated. Check out follow suggestions based on shared courses.',
  },
]

export const VIEWER_STEPS = [
  {
    target: '[data-tutorial="viewer-actions"]',
    title: 'Sheet actions',
    content: 'Star, fork, download, or contribute improvements back to the author.',
    disableBeacon: true,
  },
  {
    target: '[data-tutorial="viewer-content"]',
    title: 'Sheet content',
    content: 'Read the study material. HTML sheets have Safe and Interactive preview modes.',
  },
  {
    target: '[data-tutorial="viewer-comments"]',
    title: 'Discussion',
    content: 'Ask questions and discuss with classmates. Use @mentions to notify someone.',
  },
  {
    target: '[data-tutorial="viewer-sheetlab"]',
    title: 'Edit in Sheet Lab',
    content:
      'Open Sheet Lab to view version history, compare changes, track lineage, and see analytics.',
  },
]

export const ANNOUNCEMENTS_STEPS = [
  {
    target: '[data-tutorial="announcements-header"]',
    title: 'Announcements',
    content:
      'Official StudyHub updates live here. Pinned announcements stay at the top and new posts flow into this feed.',
    disableBeacon: true,
  },
  {
    target: '[data-tutorial="announcements-form"]',
    title: 'Publish updates with media',
    content:
      'Admins can post announcements with images, background-processed video, and pinning directly from this composer.',
  },
  {
    target: '[data-tutorial="announcements-list"]',
    title: 'Stay up to date',
    content:
      'Pinned cards are highlighted, media renders inline, and author links let readers jump straight to the poster profile.',
  },
]

export const UPLOAD_STEPS = [
  {
    target: '[data-tutorial="upload-info"]',
    title: 'Sheet details',
    content: 'Give your sheet a clear title and select the relevant course.',
    disableBeacon: true,
  },
  {
    target: '[data-tutorial="upload-content"]',
    title: 'Add content',
    content: 'Write or paste your study material. Choose between Markdown and HTML formats.',
  },
  {
    target: '[data-tutorial="upload-attachment"]',
    title: 'Attach files',
    content: 'Optionally attach a PDF or image (10MB max) for classmates to preview and download.',
  },
]

/* ── New page tutorials ──────────────────────────────────────────────── */

export const MESSAGES_STEPS = [
  {
    target: '[data-tutorial="messages-conversations"]',
    title: 'Your conversations',
    content:
      'Jump between direct messages, group chats, message requests, and archived threads from one inbox. Unread counts update in real time.',
    disableBeacon: true,
  },
  {
    target: '[data-tutorial="messages-compose"]',
    title: 'Send a message',
    content:
      'The active thread updates live. Send messages, edit recent posts, react, and watch typing indicators without leaving the conversation.',
  },
  {
    target: '[data-tutorial="messages-new"]',
    title: 'Start a conversation',
    content:
      'Start a new DM or group chat from here. You can search classmates, pick participants, and name group chats in one flow.',
  },
]

export const STUDY_GROUPS_STEPS = [
  {
    target: '[data-tutorial="groups-list"]',
    title: 'Your study groups',
    content:
      'Browse public groups or open a group to request access, accept invites, and follow group activity around a shared course.',
    disableBeacon: true,
  },
  {
    target: '[data-tutorial="groups-filters"]',
    title: 'Search and narrow the list',
    content:
      'Search by name or narrow by school, course, or My Groups to find the right study space quickly.',
  },
  {
    target: '[data-tutorial="groups-create"]',
    title: 'Create a group',
    content:
      'Choose a course and privacy level when you create a group. Private and invite-only groups support approvals and invitations.',
  },
  {
    target: '[data-tutorial="groups-resources"]',
    title: 'Shared resources',
    content:
      'Each group page includes shared resources, scheduled sessions, discussions, and moderation tools for the group team.',
  },
]

export const SHEET_LAB_STEPS = [
  {
    target: '[data-tutorial="sheetlab-editor"]',
    title: 'Edit your sheet',
    content:
      'Make changes in the editor tab. Each save creates a new version you can compare later.',
    disableBeacon: true,
  },
  {
    target: '[data-tutorial="sheetlab-tabs"]',
    title: 'Lab tabs',
    content: 'Switch between Editor, Changes, History, Lineage, Reviews, and Analytics.',
  },
  {
    target: '[data-tutorial="sheetlab-history"]',
    title: 'Version history',
    content:
      'View all snapshots, restore previous versions, or browse content at any point in time.',
  },
  {
    target: '[data-tutorial="sheetlab-analytics"]',
    title: 'Sheet analytics',
    content: 'Track stars, downloads, forks, and engagement trends for your sheet.',
  },
]

export const MY_COURSES_STEPS = [
  {
    target: '[data-tutorial="courses-list"]',
    title: 'Your enrolled courses',
    content: 'All your courses appear here. Each course shows sheets shared by classmates.',
    disableBeacon: true,
  },
  {
    target: '[data-tutorial="courses-add"]',
    title: 'Add a course',
    content:
      'Search for courses at your school and enroll to see relevant study sheets in your feed.',
  },
  {
    target: '[data-tutorial="courses-browse"]',
    title: 'Browse course content',
    content: 'Click a course to see all sheets, notes, and classmates enrolled in it.',
  },
]
