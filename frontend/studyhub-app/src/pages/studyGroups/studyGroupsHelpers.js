import { API } from '../../config'

/**
 * Study Groups Helpers
 * Utility functions for formatting, labeling, and processing Study Groups data.
 */

/**
 * Format a date string as relative time (e.g., "2h ago", "3d ago", "just now")
 * @param {string} dateStr - ISO date string
 * @returns {string} Relative time string
 */
export function formatRelativeTime(dateStr) {
  if (!dateStr) return '';

  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now - date;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffWeeks < 4) return `${diffWeeks}w ago`;

  return date.toLocaleDateString();
}

/**
 * Format a date string as a readable session time (e.g., "Mar 15, 2026 at 3:00 PM")
 * @param {string} dateStr - ISO date string
 * @returns {string} Formatted date and time
 */
export function formatSessionTime(dateStr) {
  if (!dateStr) return '';

  const date = new Date(dateStr);
  const options = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  };

  return date.toLocaleDateString('en-US', options);
}

/**
 * Format a duration in minutes as a human-readable string
 * @param {number} mins - Duration in minutes
 * @returns {string} Formatted duration (e.g., "1h", "1h 30m", "30m")
 */
export function formatDuration(mins) {
  if (!mins || mins < 0) return '0m';

  const hours = Math.floor(mins / 60);
  const minutes = mins % 60;

  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;

  return `${hours}h ${minutes}m`;
}

/**
 * Get a label for privacy setting
 * @param {string} privacy - Privacy value ("public", "private", "invite_only")
 * @returns {string} Display label
 */
export function getPrivacyLabel(privacy) {
  const labels = {
    public: 'Public',
    private: 'Private',
    invite_only: 'Invite Only',
  };

  return labels[privacy] || privacy;
}

/**
 * Get a label for member role
 * @param {string} role - Role value ("admin", "moderator", "member")
 * @returns {string} Display label
 */
export function getRoleLabel(role) {
  const labels = {
    admin: 'Admin',
    moderator: 'Moderator',
    member: 'Member',
  };

  return labels[role] || role;
}

/**
 * Get a label for membership status
 * @param {string} status - Status value ("active", "pending", "invited", "banned")
 * @returns {string} Display label
 */
export function getStatusLabel(status) {
  const labels = {
    active: 'Active',
    pending: 'Pending',
    invited: 'Invited',
    banned: 'Banned',
  };

  return labels[status] || status;
}

/**
 * Get member initials from username (first 2 characters, uppercased)
 * @param {string} username - Username string
 * @returns {string} Two-character initials
 */
export function getMemberInitials(username) {
  if (!username || username.length === 0) return 'XX';

  return username.substring(0, 2).toUpperCase();
}

/**
 * Get a label for session status
 * @param {string} status - Status value ("upcoming", "in_progress", "completed", "cancelled")
 * @returns {string} Display label
 */
export function getSessionStatusLabel(status) {
  const labels = {
    upcoming: 'Upcoming',
    in_progress: 'In Progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };

  return labels[status] || status;
}

/**
 * Get a label for post type
 * @param {string} type - Post type value ("discussion", "question", "announcement", "poll")
 * @returns {string} Display label
 */
export function getPostTypeLabel(type) {
  const labels = {
    discussion: 'Discussion',
    question: 'Question',
    announcement: 'Announcement',
    poll: 'Poll',
  };

  return labels[type] || type;
}

/**
 * Truncate text to a maximum length with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLen - Maximum length before truncation
 * @returns {string} Truncated text with "..." if needed
 */
export function truncateText(text, maxLen) {
  if (!text) return '';
  if (text.length <= maxLen) return text;

  return text.substring(0, maxLen) + '...';
}

/**
 * Resolve a group image URL for split-origin environments.
 * @param {string | null | undefined} avatarUrl
 * @returns {string}
 */
export function resolveGroupImageUrl(avatarUrl) {
  if (!avatarUrl) return ''
  return avatarUrl.startsWith('http') ? avatarUrl : `${API}${avatarUrl}`
}
