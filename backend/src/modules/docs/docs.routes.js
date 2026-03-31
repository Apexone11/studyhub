const express = require('express')

const router = express.Router()

const API_SPEC = {
  name: 'StudyHub API',
  version: '1.5.0',
  baseUrl: '/api',
  description: 'Collaborative study platform API for college students',
  endpoints: [
    // ============================================
    // Authentication
    // ============================================
    {
      category: 'Authentication',
      method: 'POST',
      path: '/api/auth/register',
      description: 'Register a new user account',
      auth: 'none',
      params: {
        body: [
          { name: 'email', type: 'string', required: true, description: 'User email address' },
          { name: 'username', type: 'string', required: true, description: 'Unique username' },
          { name: 'password', type: 'string', required: true, description: 'User password' },
        ],
      },
      response: {
        type: 'object',
        description: 'User object with session token',
        example: { id: 1, email: 'user@example.com', username: 'johndoe', token: '...' },
      },
    },
    {
      category: 'Authentication',
      method: 'POST',
      path: '/api/auth/login',
      description: 'Login and create a session',
      auth: 'none',
      params: {
        body: [
          { name: 'email', type: 'string', required: true, description: 'User email or username' },
          { name: 'password', type: 'string', required: true, description: 'User password' },
        ],
      },
      response: {
        type: 'object',
        description: 'Session established with auth token',
      },
    },
    {
      category: 'Authentication',
      method: 'POST',
      path: '/api/auth/logout',
      description: 'Logout and destroy session',
      auth: 'required',
      params: { body: [] },
      response: { type: 'object', description: 'Logout confirmation' },
    },
    {
      category: 'Authentication',
      method: 'GET',
      path: '/api/auth/me',
      description: 'Get current authenticated user',
      auth: 'required',
      params: { query: [] },
      response: { type: 'object', description: 'Current user object' },
    },
    {
      category: 'Authentication',
      method: 'POST',
      path: '/api/auth/password-reset',
      description: 'Request password reset email',
      auth: 'none',
      params: {
        body: [
          { name: 'email', type: 'string', required: true, description: 'User email' },
        ],
      },
      response: { type: 'object', description: 'Reset email sent confirmation' },
    },
    {
      category: 'Authentication',
      method: 'POST',
      path: '/api/auth/password-reset/confirm',
      description: 'Confirm password reset with token',
      auth: 'none',
      params: {
        body: [
          { name: 'token', type: 'string', required: true, description: 'Reset token from email' },
          { name: 'password', type: 'string', required: true, description: 'New password' },
        ],
      },
      response: { type: 'object', description: 'Password reset successful' },
    },
    {
      category: 'Authentication',
      method: 'POST',
      path: '/api/auth/google',
      description: 'Google OAuth authentication',
      auth: 'none',
      params: {
        body: [
          { name: 'token', type: 'string', required: true, description: 'Google ID token' },
        ],
      },
      response: { type: 'object', description: 'User session from Google auth' },
    },

    // ============================================
    // Study Sheets
    // ============================================
    {
      category: 'Study Sheets',
      method: 'GET',
      path: '/api/sheets',
      description: 'List study sheets with search, filters, and pagination',
      auth: 'optional',
      params: {
        query: [
          { name: 'search', type: 'string', required: false, description: 'Search sheets by title, description, content' },
          { name: 'courseId', type: 'integer', required: false, description: 'Filter by course ID' },
          { name: 'schoolId', type: 'integer', required: false, description: 'Filter by school ID' },
          { name: 'mine', type: 'boolean', required: false, description: 'Show only user sheets (requires auth)' },
          { name: 'starred', type: 'boolean', required: false, description: 'Show only starred sheets (requires auth)' },
          { name: 'sort', type: 'string', required: false, description: 'Sort by: recent, popular, stars' },
          { name: 'page', type: 'integer', required: false, description: 'Page number (default 1)' },
          { name: 'limit', type: 'integer', required: false, description: 'Results per page (max 100)' },
        ],
      },
      response: {
        type: 'object',
        description: 'Paginated list of study sheets',
        example: { sheets: [], total: 100, page: 1, limit: 20 },
      },
    },
    {
      category: 'Study Sheets',
      method: 'GET',
      path: '/api/sheets/leaderboard',
      description: 'Get top study sheets (most starred)',
      auth: 'optional',
      params: {
        query: [
          { name: 'limit', type: 'integer', required: false, description: 'Number of results (max 100)' },
        ],
      },
      response: { type: 'array', description: 'List of top study sheets' },
    },
    {
      category: 'Study Sheets',
      method: 'GET',
      path: '/api/sheets/:id',
      description: 'Get a single study sheet by ID',
      auth: 'optional',
      params: {
        path: [
          { name: 'id', type: 'integer', required: true, description: 'Sheet ID' },
        ],
      },
      response: { type: 'object', description: 'Study sheet object with full content' },
    },
    {
      category: 'Study Sheets',
      method: 'POST',
      path: '/api/sheets',
      description: 'Create a new study sheet',
      auth: 'required',
      params: {
        body: [
          { name: 'title', type: 'string', required: true, description: 'Sheet title (max 200 chars)' },
          { name: 'description', type: 'string', required: false, description: 'Short description' },
          { name: 'content', type: 'string', required: true, description: 'Sheet content (HTML rich text)' },
          { name: 'courseId', type: 'integer', required: false, description: 'Associated course ID' },
        ],
      },
      response: { type: 'object', description: 'Created study sheet' },
    },
    {
      category: 'Study Sheets',
      method: 'PATCH',
      path: '/api/sheets/:id',
      description: 'Update an existing study sheet',
      auth: 'required',
      params: {
        path: [
          { name: 'id', type: 'integer', required: true, description: 'Sheet ID' },
        ],
        body: [
          { name: 'title', type: 'string', required: false, description: 'New title' },
          { name: 'description', type: 'string', required: false, description: 'New description' },
          { name: 'content', type: 'string', required: false, description: 'New content' },
        ],
      },
      response: { type: 'object', description: 'Updated study sheet' },
    },
    {
      category: 'Study Sheets',
      method: 'DELETE',
      path: '/api/sheets/:id',
      description: 'Delete a study sheet',
      auth: 'required',
      params: {
        path: [
          { name: 'id', type: 'integer', required: true, description: 'Sheet ID' },
        ],
      },
      response: { type: 'object', description: 'Deletion confirmation' },
    },
    {
      category: 'Study Sheets',
      method: 'POST',
      path: '/api/sheets/:id/fork',
      description: 'Fork a study sheet',
      auth: 'required',
      params: {
        path: [
          { name: 'id', type: 'integer', required: true, description: 'Source sheet ID' },
        ],
      },
      response: { type: 'object', description: 'Forked study sheet' },
    },
    {
      category: 'Study Sheets',
      method: 'POST',
      path: '/api/sheets/:id/star',
      description: 'Star a study sheet',
      auth: 'required',
      params: {
        path: [
          { name: 'id', type: 'integer', required: true, description: 'Sheet ID' },
        ],
      },
      response: { type: 'object', description: 'Star count and status' },
    },
    {
      category: 'Study Sheets',
      method: 'DELETE',
      path: '/api/sheets/:id/star',
      description: 'Unstar a study sheet',
      auth: 'required',
      params: {
        path: [
          { name: 'id', type: 'integer', required: true, description: 'Sheet ID' },
        ],
      },
      response: { type: 'object', description: 'Star count and status' },
    },

    // ============================================
    // Sheet Comments
    // ============================================
    {
      category: 'Study Sheets',
      method: 'GET',
      path: '/api/sheets/:id/comments',
      description: 'Get comments on a study sheet',
      auth: 'optional',
      params: {
        path: [
          { name: 'id', type: 'integer', required: true, description: 'Sheet ID' },
        ],
        query: [
          { name: 'limit', type: 'integer', required: false, description: 'Number of comments (default 50)' },
          { name: 'offset', type: 'integer', required: false, description: 'Pagination offset (default 0)' },
        ],
      },
      response: { type: 'object', description: 'Comments array and pagination' },
    },
    {
      category: 'Study Sheets',
      method: 'POST',
      path: '/api/sheets/:id/comments',
      description: 'Add a comment to a study sheet',
      auth: 'required',
      params: {
        path: [
          { name: 'id', type: 'integer', required: true, description: 'Sheet ID' },
        ],
        body: [
          { name: 'content', type: 'string', required: true, description: 'Comment text (max 500 chars)' },
        ],
      },
      response: { type: 'object', description: 'Created comment' },
    },
    {
      category: 'Study Sheets',
      method: 'DELETE',
      path: '/api/sheets/:id/comments/:commentId',
      description: 'Delete a comment',
      auth: 'required',
      params: {
        path: [
          { name: 'id', type: 'integer', required: true, description: 'Sheet ID' },
          { name: 'commentId', type: 'integer', required: true, description: 'Comment ID' },
        ],
      },
      response: { type: 'object', description: 'Deletion confirmation' },
    },

    // ============================================
    // Notes
    // ============================================
    {
      category: 'Notes',
      method: 'GET',
      path: '/api/notes',
      description: 'List notes (own or shared)',
      auth: 'required',
      params: {
        query: [
          { name: 'q', type: 'string', required: false, description: 'Search query' },
          { name: 'courseId', type: 'integer', required: false, description: 'Filter by course' },
          { name: 'shared', type: 'boolean', required: false, description: 'Show shared notes' },
          { name: 'private', type: 'boolean', required: false, description: 'Filter by private status' },
          { name: 'page', type: 'integer', required: false, description: 'Page number' },
          { name: 'limit', type: 'integer', required: false, description: 'Results per page' },
        ],
      },
      response: { type: 'object', description: 'Paginated notes' },
    },
    {
      category: 'Notes',
      method: 'GET',
      path: '/api/notes/:id',
      description: 'Get a single note',
      auth: 'optional',
      params: {
        path: [
          { name: 'id', type: 'integer', required: true, description: 'Note ID' },
        ],
      },
      response: { type: 'object', description: 'Note object' },
    },
    {
      category: 'Notes',
      method: 'POST',
      path: '/api/notes',
      description: 'Create a new note',
      auth: 'required',
      params: {
        body: [
          { name: 'title', type: 'string', required: true, description: 'Note title (max 120 chars)' },
          { name: 'content', type: 'string', required: true, description: 'Note content (max 50000 chars)' },
          { name: 'courseId', type: 'integer', required: false, description: 'Associated course' },
          { name: 'private', type: 'boolean', required: false, description: 'Private note (default true)' },
        ],
      },
      response: { type: 'object', description: 'Created note' },
    },
    {
      category: 'Notes',
      method: 'PATCH',
      path: '/api/notes/:id',
      description: 'Update a note',
      auth: 'required',
      params: {
        path: [
          { name: 'id', type: 'integer', required: true, description: 'Note ID' },
        ],
        body: [
          { name: 'title', type: 'string', required: false, description: 'New title' },
          { name: 'content', type: 'string', required: false, description: 'New content' },
          { name: 'private', type: 'boolean', required: false, description: 'Privacy status' },
        ],
      },
      response: { type: 'object', description: 'Updated note' },
    },
    {
      category: 'Notes',
      method: 'DELETE',
      path: '/api/notes/:id',
      description: 'Delete a note',
      auth: 'required',
      params: {
        path: [
          { name: 'id', type: 'integer', required: true, description: 'Note ID' },
        ],
      },
      response: { type: 'object', description: 'Deletion confirmation' },
    },

    // ============================================
    // Courses
    // ============================================
    {
      category: 'Courses',
      method: 'GET',
      path: '/api/courses',
      description: 'List courses',
      auth: 'optional',
      params: {
        query: [
          { name: 'search', type: 'string', required: false, description: 'Search by code or name' },
          { name: 'schoolId', type: 'integer', required: false, description: 'Filter by school' },
          { name: 'limit', type: 'integer', required: false, description: 'Results limit' },
        ],
      },
      response: { type: 'array', description: 'List of courses' },
    },
    {
      category: 'Courses',
      method: 'GET',
      path: '/api/courses/:id',
      description: 'Get a single course',
      auth: 'optional',
      params: {
        path: [
          { name: 'id', type: 'integer', required: true, description: 'Course ID' },
        ],
      },
      response: { type: 'object', description: 'Course object with enrollment info' },
    },
    {
      category: 'Courses',
      method: 'POST',
      path: '/api/courses/:id/enroll',
      description: 'Enroll in a course',
      auth: 'required',
      params: {
        path: [
          { name: 'id', type: 'integer', required: true, description: 'Course ID' },
        ],
      },
      response: { type: 'object', description: 'Enrollment confirmation' },
    },
    {
      category: 'Courses',
      method: 'DELETE',
      path: '/api/courses/:id/enroll',
      description: 'Drop from a course',
      auth: 'required',
      params: {
        path: [
          { name: 'id', type: 'integer', required: true, description: 'Course ID' },
        ],
      },
      response: { type: 'object', description: 'Unenrollment confirmation' },
    },

    // ============================================
    // Users & Profiles
    // ============================================
    {
      category: 'Users',
      method: 'GET',
      path: '/api/users/:username',
      description: 'Get user profile',
      auth: 'optional',
      params: {
        path: [
          { name: 'username', type: 'string', required: true, description: 'Username' },
        ],
      },
      response: { type: 'object', description: 'User profile with stats' },
    },
    {
      category: 'Users',
      method: 'GET',
      path: '/api/users/:username/activity',
      description: 'Get user activity history',
      auth: 'optional',
      params: {
        path: [
          { name: 'username', type: 'string', required: true, description: 'Username' },
        ],
        query: [
          { name: 'weeks', type: 'integer', required: false, description: 'Number of weeks (max 52)' },
        ],
      },
      response: { type: 'array', description: 'Daily activity records' },
    },
    {
      category: 'Users',
      method: 'GET',
      path: '/api/users/:username/stats',
      description: 'Get user contribution statistics',
      auth: 'optional',
      params: {
        path: [
          { name: 'username', type: 'string', required: true, description: 'Username' },
        ],
      },
      response: { type: 'object', description: 'Contribution stats' },
    },
    {
      category: 'Users',
      method: 'GET',
      path: '/api/users/:username/followers',
      description: 'Get user followers',
      auth: 'optional',
      params: {
        path: [
          { name: 'username', type: 'string', required: true, description: 'Username' },
        ],
      },
      response: { type: 'array', description: 'List of followers' },
    },
    {
      category: 'Users',
      method: 'POST',
      path: '/api/users/:username/follow',
      description: 'Follow a user',
      auth: 'required',
      params: {
        path: [
          { name: 'username', type: 'string', required: true, description: 'Username to follow' },
        ],
      },
      response: { type: 'object', description: 'Follow status' },
    },
    {
      category: 'Users',
      method: 'DELETE',
      path: '/api/users/:username/follow',
      description: 'Unfollow a user',
      auth: 'required',
      params: {
        path: [
          { name: 'username', type: 'string', required: true, description: 'Username to unfollow' },
        ],
      },
      response: { type: 'object', description: 'Follow status' },
    },
    {
      category: 'Users',
      method: 'POST',
      path: '/api/users/:username/block',
      description: 'Block a user',
      auth: 'required',
      params: {
        path: [
          { name: 'username', type: 'string', required: true, description: 'Username to block' },
        ],
        body: [
          { name: 'reason', type: 'string', required: false, description: 'Block reason (max 500 chars)' },
        ],
      },
      response: { type: 'object', description: 'Block status' },
    },

    // ============================================
    // Feed
    // ============================================
    {
      category: 'Feed',
      method: 'GET',
      path: '/api/feed',
      description: 'Get personalized study feed',
      auth: 'required',
      params: {
        query: [
          { name: 'page', type: 'integer', required: false, description: 'Page number' },
          { name: 'limit', type: 'integer', required: false, description: 'Results per page' },
        ],
      },
      response: { type: 'object', description: 'Paginated feed items' },
    },
    {
      category: 'Feed',
      method: 'GET',
      path: '/api/feed/trending',
      description: 'Get trending study sheets',
      auth: 'optional',
      params: {
        query: [
          { name: 'courseId', type: 'integer', required: false, description: 'Filter by course' },
          { name: 'limit', type: 'integer', required: false, description: 'Results limit' },
        ],
      },
      response: { type: 'array', description: 'Trending sheets' },
    },
    {
      category: 'Feed',
      method: 'GET',
      path: '/api/feed/recommended',
      description: 'Get recommended sheets for user',
      auth: 'required',
      params: {
        query: [
          { name: 'limit', type: 'integer', required: false, description: 'Results limit' },
        ],
      },
      response: { type: 'array', description: 'Recommended sheets' },
    },

    // ============================================
    // Search
    // ============================================
    {
      category: 'Search',
      method: 'GET',
      path: '/api/search',
      description: 'Global search across sheets, courses, users, notes, groups',
      auth: 'optional',
      params: {
        query: [
          { name: 'q', type: 'string', required: true, description: 'Search query (2-200 chars)' },
          { name: 'type', type: 'string', required: false, description: 'Type filter: all, sheets, courses, users, notes, groups' },
          { name: 'limit', type: 'integer', required: false, description: 'Results per type (max 20)' },
          { name: 'fts', type: 'boolean', required: false, description: 'Use full-text search' },
        ],
      },
      response: {
        type: 'object',
        description: 'Search results grouped by type',
        example: { results: { sheets: [], courses: [], users: [], notes: [], groups: [] } },
      },
    },

    // ============================================
    // Notifications
    // ============================================
    {
      category: 'Notifications',
      method: 'GET',
      path: '/api/notifications',
      description: 'Get user notifications',
      auth: 'required',
      params: {
        query: [
          { name: 'limit', type: 'integer', required: false, description: 'Results limit' },
          { name: 'offset', type: 'integer', required: false, description: 'Pagination offset' },
        ],
      },
      response: { type: 'object', description: 'Notifications list' },
    },
    {
      category: 'Notifications',
      method: 'PATCH',
      path: '/api/notifications/:id/read',
      description: 'Mark notification as read',
      auth: 'required',
      params: {
        path: [
          { name: 'id', type: 'integer', required: true, description: 'Notification ID' },
        ],
      },
      response: { type: 'object', description: 'Updated notification' },
    },

    // ============================================
    // Messaging
    // ============================================
    {
      category: 'Messaging',
      method: 'GET',
      path: '/api/messages/conversations',
      description: 'List user conversations',
      auth: 'required',
      params: {
        query: [
          { name: 'limit', type: 'integer', required: false, description: 'Results limit' },
          { name: 'offset', type: 'integer', required: false, description: 'Pagination offset' },
        ],
      },
      response: { type: 'array', description: 'List of conversations' },
    },
    {
      category: 'Messaging',
      method: 'GET',
      path: '/api/messages/conversations/:id/messages',
      description: 'Get messages in a conversation',
      auth: 'required',
      params: {
        path: [
          { name: 'id', type: 'string', required: true, description: 'Conversation ID' },
        ],
        query: [
          { name: 'limit', type: 'integer', required: false, description: 'Results limit' },
          { name: 'offset', type: 'integer', required: false, description: 'Pagination offset' },
        ],
      },
      response: { type: 'array', description: 'Messages in conversation' },
    },
    {
      category: 'Messaging',
      method: 'POST',
      path: '/api/messages/conversations/:id/messages',
      description: 'Send a message in conversation',
      auth: 'required',
      params: {
        path: [
          { name: 'id', type: 'string', required: true, description: 'Conversation ID' },
        ],
        body: [
          { name: 'content', type: 'string', required: true, description: 'Message text' },
        ],
      },
      response: { type: 'object', description: 'Created message' },
    },

    // ============================================
    // Study Groups
    // ============================================
    {
      category: 'Study Groups',
      method: 'GET',
      path: '/api/study-groups',
      description: 'List study groups',
      auth: 'optional',
      params: {
        query: [
          { name: 'courseId', type: 'integer', required: false, description: 'Filter by course' },
          { name: 'limit', type: 'integer', required: false, description: 'Results limit' },
        ],
      },
      response: { type: 'array', description: 'List of study groups' },
    },
    {
      category: 'Study Groups',
      method: 'GET',
      path: '/api/study-groups/:id',
      description: 'Get a study group',
      auth: 'optional',
      params: {
        path: [
          { name: 'id', type: 'string', required: true, description: 'Group ID' },
        ],
      },
      response: { type: 'object', description: 'Study group details' },
    },
    {
      category: 'Study Groups',
      method: 'POST',
      path: '/api/study-groups',
      description: 'Create a study group',
      auth: 'required',
      params: {
        body: [
          { name: 'name', type: 'string', required: true, description: 'Group name' },
          { name: 'description', type: 'string', required: false, description: 'Group description' },
          { name: 'privacy', type: 'string', required: false, description: 'public or private' },
          { name: 'courseId', type: 'integer', required: false, description: 'Associated course' },
        ],
      },
      response: { type: 'object', description: 'Created group' },
    },
    {
      category: 'Study Groups',
      method: 'POST',
      path: '/api/study-groups/:id/join',
      description: 'Join a study group',
      auth: 'required',
      params: {
        path: [
          { name: 'id', type: 'string', required: true, description: 'Group ID' },
        ],
      },
      response: { type: 'object', description: 'Join confirmation' },
    },

    // ============================================
    // Admin
    // ============================================
    {
      category: 'Admin',
      method: 'GET',
      path: '/api/admin/users',
      description: 'List all users (admin only)',
      auth: 'required',
      params: {
        query: [
          { name: 'search', type: 'string', required: false, description: 'Search query' },
          { name: 'limit', type: 'integer', required: false, description: 'Results limit' },
        ],
      },
      response: { type: 'array', description: 'User list' },
    },
    {
      category: 'Admin',
      method: 'PATCH',
      path: '/api/admin/users/:id/role',
      description: 'Update user role (admin only)',
      auth: 'required',
      params: {
        path: [
          { name: 'id', type: 'integer', required: true, description: 'User ID' },
        ],
        body: [
          { name: 'role', type: 'string', required: true, description: 'user, moderator, admin' },
        ],
      },
      response: { type: 'object', description: 'Updated user' },
    },
    {
      category: 'Admin',
      method: 'GET',
      path: '/api/admin/moderation/queue',
      description: 'Get content moderation queue (admin only)',
      auth: 'required',
      params: {
        query: [
          { name: 'limit', type: 'integer', required: false, description: 'Results limit' },
        ],
      },
      response: { type: 'array', description: 'Items pending review' },
    },

    // ============================================
    // Public Data
    // ============================================
    {
      category: 'Public',
      method: 'GET',
      path: '/api/public/stats',
      description: 'Get public platform statistics',
      auth: 'none',
      params: { query: [] },
      response: {
        type: 'object',
        description: 'Platform stats (sheet count, user count, etc)',
      },
    },
  ],
}

router.get('/', (req, res) => {
  res.json(API_SPEC)
})

module.exports = router
