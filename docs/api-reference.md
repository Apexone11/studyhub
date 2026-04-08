# StudyHub API Reference

**Version:** 1.5.0
**Base URL:** `/api`

## Overview

StudyHub is a collaborative study platform API for college students. This document provides comprehensive documentation of all available endpoints.

All responses include HTTP status codes and standard error envelopes. Authentication is via bearer tokens or cookies.

---

## Table of Contents

1. [Authentication](#authentication)
2. [Study Sheets](#study-sheets)
3. [Notes](#notes)
4. [Courses](#courses)
5. [Users & Profiles](#users--profiles)
6. [Feed](#feed)
7. [Search](#search)
8. [Notifications](#notifications)
9. [Messaging](#messaging)
10. [Study Groups](#study-groups)
11. [Admin](#admin)
12. [Public Data](#public-data)

---

## Authentication

### Register

**POST** `/api/auth/register`

Register a new user account.

**Request Body:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| email | string | true | User email address |
| username | string | true | Unique username |
| password | string | true | User password |

**Response:** User object with session token

---

### Login

**POST** `/api/auth/login`

Login and create a session. Returns auth token that can be used for subsequent requests.

**Request Body:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| email | string | true | User email or username |
| password | string | true | User password |

**Response:** Session established with auth token

---

### Logout

**POST** `/api/auth/logout`

Logout and destroy session.

**Authentication:** Required

**Response:** Logout confirmation

---

### Get Current User

**GET** `/api/auth/me`

Get current authenticated user details.

**Authentication:** Required

**Response:** Current user object

---

### Password Reset

**POST** `/api/auth/password-reset`

Request password reset email.

**Request Body:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| email | string | true | User email |

**Response:** Reset email sent confirmation

---

### Confirm Password Reset

**POST** `/api/auth/password-reset/confirm`

Confirm password reset with token from email.

**Request Body:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| token | string | true | Reset token from email |
| password | string | true | New password |

**Response:** Password reset successful

---

### Google OAuth

**POST** `/api/auth/google`

Authenticate using Google OAuth.

**Request Body:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| token | string | true | Google ID token |

**Response:** User session from Google auth

---

## Study Sheets

### List Sheets

**GET** `/api/sheets`

List study sheets with search, filters, and pagination.

**Authentication:** Optional

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| search | string | Search sheets by title, description, content |
| courseId | integer | Filter by course ID |
| schoolId | integer | Filter by school ID |
| mine | boolean | Show only user sheets (requires auth) |
| starred | boolean | Show only starred sheets (requires auth) |
| sort | string | Sort by: recent, popular, stars |
| page | integer | Page number (default 1) |
| limit | integer | Results per page (max 100) |

**Response:** Paginated list of study sheets
```json
{
  "sheets": [...],
  "total": 100,
  "page": 1,
  "limit": 20
}
```

---

### Get Leaderboard

**GET** `/api/sheets/leaderboard`

Get top study sheets (most starred).

**Authentication:** Optional

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| limit | integer | Number of results (max 100) |

**Response:** Array of top study sheets

---

### Get Sheet

**GET** `/api/sheets/:id`

Get a single study sheet by ID.

**Authentication:** Optional

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | integer | Sheet ID |

**Response:** Study sheet object with full content

---

### Create Sheet

**POST** `/api/sheets`

Create a new study sheet.

**Authentication:** Required

**Request Body:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| title | string | true | Sheet title (max 200 chars) |
| description | string | false | Short description |
| content | string | true | Sheet content (HTML rich text) |
| courseId | integer | false | Associated course ID |

**Response:** Created study sheet

---

### Update Sheet

**PATCH** `/api/sheets/:id`

Update an existing study sheet.

**Authentication:** Required

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | integer | Sheet ID |

**Request Body:**
| Parameter | Type | Description |
|-----------|------|-------------|
| title | string | New title |
| description | string | New description |
| content | string | New content |

**Response:** Updated study sheet

---

### Delete Sheet

**DELETE** `/api/sheets/:id`

Delete a study sheet.

**Authentication:** Required

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | integer | Sheet ID |

**Response:** Deletion confirmation

---

### Fork Sheet

**POST** `/api/sheets/:id/fork`

Fork a study sheet.

**Authentication:** Required

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | integer | Source sheet ID |

**Response:** Forked study sheet

---

### Star Sheet

**POST** `/api/sheets/:id/star`

Star a study sheet.

**Authentication:** Required

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | integer | Sheet ID |

**Response:** Star count and status

---

### Unstar Sheet

**DELETE** `/api/sheets/:id/star`

Unstar a study sheet.

**Authentication:** Required

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | integer | Sheet ID |

**Response:** Star count and status

---

### Get Sheet Comments

**GET** `/api/sheets/:id/comments`

Get comments on a study sheet.

**Authentication:** Optional

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | integer | Sheet ID |

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| limit | integer | Number of comments (default 50) |
| offset | integer | Pagination offset (default 0) |

**Response:** Comments array and pagination

---

### Add Comment

**POST** `/api/sheets/:id/comments`

Add a comment to a study sheet.

**Authentication:** Required

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | integer | Sheet ID |

**Request Body:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| content | string | true | Comment text (max 500 chars) |

**Response:** Created comment

---

### Delete Comment

**DELETE** `/api/sheets/:id/comments/:commentId`

Delete a comment.

**Authentication:** Required

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | integer | Sheet ID |
| commentId | integer | Comment ID |

**Response:** Deletion confirmation

---

## Notes

### List Notes

**GET** `/api/notes`

List notes (own or shared).

**Authentication:** Required

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| q | string | Search query |
| courseId | integer | Filter by course |
| shared | boolean | Show shared notes |
| private | boolean | Filter by private status |
| page | integer | Page number |
| limit | integer | Results per page |

**Response:** Paginated notes

---

### Get Note

**GET** `/api/notes/:id`

Get a single note.

**Authentication:** Optional

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | integer | Note ID |

**Response:** Note object

---

### Create Note

**POST** `/api/notes`

Create a new note.

**Authentication:** Required

**Request Body:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| title | string | true | Note title (max 120 chars) |
| content | string | true | Note content (max 50000 chars) |
| courseId | integer | false | Associated course |
| private | boolean | false | Private note (default true) |

**Response:** Created note

---

### Update Note

**PATCH** `/api/notes/:id`

Update a note.

**Authentication:** Required

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | integer | Note ID |

**Request Body:**
| Parameter | Type | Description |
|-----------|------|-------------|
| title | string | New title |
| content | string | New content |
| private | boolean | Privacy status |

**Response:** Updated note

---

### Delete Note

**DELETE** `/api/notes/:id`

Delete a note.

**Authentication:** Required

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | integer | Note ID |

**Response:** Deletion confirmation

---

## Courses

### List Courses

**GET** `/api/courses`

List courses.

**Authentication:** Optional

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| search | string | Search by code or name |
| schoolId | integer | Filter by school |
| limit | integer | Results limit |

**Response:** Array of courses

---

### Get Course

**GET** `/api/courses/:id`

Get a single course.

**Authentication:** Optional

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | integer | Course ID |

**Response:** Course object with enrollment info

---

### Enroll in Course

**POST** `/api/courses/:id/enroll`

Enroll in a course.

**Authentication:** Required

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | integer | Course ID |

**Response:** Enrollment confirmation

---

### Drop Course

**DELETE** `/api/courses/:id/enroll`

Drop from a course.

**Authentication:** Required

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | integer | Course ID |

**Response:** Unenrollment confirmation

---

## Users & Profiles

### Get User Profile

**GET** `/api/users/:username`

Get user profile.

**Authentication:** Optional

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| username | string | Username |

**Response:** User profile with stats

---

### Get User Activity

**GET** `/api/users/:username/activity`

Get user activity history.

**Authentication:** Optional

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| username | string | Username |

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| weeks | integer | Number of weeks (max 52) |

**Response:** Array of daily activity records

---

### Get User Stats

**GET** `/api/users/:username/stats`

Get user contribution statistics.

**Authentication:** Optional

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| username | string | Username |

**Response:** Contribution stats

---

### Get Followers

**GET** `/api/users/:username/followers`

Get user followers.

**Authentication:** Optional

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| username | string | Username |

**Response:** Array of followers

---

### Follow User

**POST** `/api/users/:username/follow`

Follow a user.

**Authentication:** Required

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| username | string | Username to follow |

**Response:** Follow status

---

### Unfollow User

**DELETE** `/api/users/:username/follow`

Unfollow a user.

**Authentication:** Required

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| username | string | Username to unfollow |

**Response:** Follow status

---

### Block User

**POST** `/api/users/:username/block`

Block a user.

**Authentication:** Required

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| username | string | Username to block |

**Request Body:**
| Parameter | Type | Description |
|-----------|------|-------------|
| reason | string | Block reason (max 500 chars) |

**Response:** Block status

---

## Feed

### Get Feed

**GET** `/api/feed`

Get personalized study feed.

**Authentication:** Required

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| page | integer | Page number |
| limit | integer | Results per page |

**Response:** Paginated feed items

---

### Get Trending

**GET** `/api/feed/trending`

Get trending study sheets.

**Authentication:** Optional

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| courseId | integer | Filter by course |
| limit | integer | Results limit |

**Response:** Array of trending sheets

---

### Get Recommended

**GET** `/api/feed/recommended`

Get recommended sheets for user.

**Authentication:** Required

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| limit | integer | Results limit |

**Response:** Array of recommended sheets

---

## Search

### Global Search

**GET** `/api/search`

Global search across sheets, courses, users, notes, groups.

**Authentication:** Optional

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| q | string | true | Search query (2-200 chars) |
| type | string | false | Type filter: all, sheets, courses, users, notes, groups |
| limit | integer | false | Results per type (max 20) |
| fts | boolean | false | Use full-text search |

**Response:** Search results grouped by type
```json
{
  "results": {
    "sheets": [...],
    "courses": [...],
    "users": [...],
    "notes": [...],
    "groups": [...]
  }
}
```

---

## Notifications

### Get Notifications

**GET** `/api/notifications`

Get user notifications.

**Authentication:** Required

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| limit | integer | Results limit |
| offset | integer | Pagination offset |

**Response:** Notifications list

---

### Mark as Read

**PATCH** `/api/notifications/:id/read`

Mark notification as read.

**Authentication:** Required

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | integer | Notification ID |

**Response:** Updated notification

---

## Messaging

### List Conversations

**GET** `/api/messages/conversations`

List user conversations.

**Authentication:** Required

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| limit | integer | Results limit |
| offset | integer | Pagination offset |

**Response:** Array of conversations

---

### Get Conversation Messages

**GET** `/api/messages/conversations/:id/messages`

Get messages in a conversation.

**Authentication:** Required

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | string | Conversation ID |

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| limit | integer | Results limit |
| offset | integer | Pagination offset |

**Response:** Array of messages in conversation

---

### Send Message

**POST** `/api/messages/conversations/:id/messages`

Send a message in conversation.

**Authentication:** Required

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | string | Conversation ID |

**Request Body:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| content | string | true | Message text |

**Response:** Created message

---

## Study Groups

### List Groups

**GET** `/api/study-groups`

List study groups.

**Authentication:** Optional

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| courseId | integer | Filter by course |
| limit | integer | Results limit |

**Response:** Array of study groups

---

### Get Group

**GET** `/api/study-groups/:id`

Get a study group.

**Authentication:** Optional

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | string | Group ID |

**Response:** Study group details

---

### Create Group

**POST** `/api/study-groups`

Create a study group.

**Authentication:** Required

**Request Body:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| name | string | true | Group name |
| description | string | false | Group description |
| privacy | string | false | public or private |
| courseId | integer | false | Associated course |

**Response:** Created group

---

### Join Group

**POST** `/api/study-groups/:id/join`

Join a study group.

**Authentication:** Required

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | string | Group ID |

**Response:** Join confirmation

---

## Admin

### List Users

**GET** `/api/admin/users`

List all users (admin only).

**Authentication:** Required (Admin)

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| search | string | Search query |
| limit | integer | Results limit |

**Response:** User list

---

### Update User Role

**PATCH** `/api/admin/users/:id/role`

Update user role (admin only).

**Authentication:** Required (Admin)

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | integer | User ID |

**Request Body:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| role | string | true | user, moderator, admin |

**Response:** Updated user

---

### Get Moderation Queue

**GET** `/api/admin/moderation/queue`

Get content moderation queue (admin only).

**Authentication:** Required (Admin)

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| limit | integer | Results limit |

**Response:** Array of items pending review

---

## Public Data

### Get Platform Stats

**GET** `/api/public/stats`

Get public platform statistics.

**Authentication:** Not required

**Response:** Platform stats
```json
{
  "sheetCount": 1000,
  "userCount": 500,
  "courseCount": 200,
  "totalStars": 5000
}
```

---

## Error Handling

All endpoints return errors with the following structure:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

Common HTTP status codes:
- **200** - OK
- **201** - Created
- **400** - Bad Request
- **401** - Unauthorized
- **403** - Forbidden
- **404** - Not Found
- **409** - Conflict
- **500** - Server Error

---

## Rate Limiting

API requests are rate-limited by IP address:
- **Global:** 1000 requests per 15 minutes
- **Auth:** 15 requests per 15 minutes per IP
- **Sheets Read:** 200 requests per minute
- **Sheets Write:** 60 requests per minute

Rate limit headers are included in responses:
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`

---

## Headers

### Response Headers

All responses include:
- `X-API-Version`: Current API version (e.g., 1.5.0)
- `X-API-Deprecated`: Set to "true" for deprecated endpoints

### Request Headers

For authenticated requests, include:
```
Authorization: Bearer <token>
```

Or use session cookies (automatically sent by browsers).

---

## Changelog

### Version 1.5.0
- Initial API documentation release
- Comprehensive endpoint catalog
- Authentication, sheets, notes, courses, users, feed, search, notifications, messaging, groups, and admin endpoints
- API version headers for all responses
