# Privacy Controls v2 — Granular Sharing & View-Only Watermarking

Implemented March 30, 2026. This document describes the sharing and privacy control endpoints for StudyHub.

## Overview

Privacy Controls v2 adds two complementary sharing mechanisms:

1. **Share Links** — Public, URL-based sharing with optional expiry, view limits, and password protection
2. **Direct Shares** — User-to-user permission grants that appear in the recipient's dashboard

Both support permission levels: `view` (read-only), `comment` (read + comment), `edit` (full edit access).

## Database Schema

### ShareLink

```prisma
model ShareLink {
  id          Int       @id @default(autoincrement())
  token       String    @unique @default(uuid())
  contentType String    // "sheet" or "note"
  contentId   Int
  createdById Int
  permission  String    @default("view")      // "view", "comment", "edit"
  expiresAt   DateTime? // null = never expires
  maxViews    Int?      // null = unlimited
  viewCount   Int       @default(0)
  password    String?   // optional password protection
  active      Boolean   @default(true)
  createdAt   DateTime  @default(now())

  createdBy User @relation("ShareLinkCreator", fields: [createdById], references: [id])

  @@index([token])
  @@index([contentType, contentId])
  @@index([createdById])
}
```

### ContentShare

```prisma
model ContentShare {
  id          Int      @id @default(autoincrement())
  contentType String   // "sheet" or "note"
  contentId   Int
  sharedById  Int
  sharedWithId Int
  permission  String   @default("view")      // "view", "comment", "edit"
  createdAt   DateTime @default(now())

  sharedBy   User @relation("ContentSharedBy", fields: [sharedById], references: [id])
  sharedWith User @relation("ContentSharedWith", fields: [sharedWithId], references: [id])

  @@unique([contentType, contentId, sharedWithId])
  @@index([sharedWithId, contentType])
}
```

## API Endpoints

### Share Links

#### POST /api/sharing/links

Create a new shareable link for a sheet or note.

**Authentication:** Required (owner only)

**Request Body:**

```json
{
  "contentType": "sheet",  // "sheet" | "note"
  "contentId": 123,
  "permission": "view",    // "view" | "comment" | "edit"
  "expiresAt": "2026-04-30T23:59:59Z",  // optional, must be future
  "maxViews": 50,                       // optional, null = unlimited
  "password": "secret123"               // optional
}
```

**Response:**

```json
{
  "id": 1,
  "token": "550e8400-e29b-41d4-a716-446655440000",
  "url": "/api/sharing/access/550e8400-e29b-41d4-a716-446655440000",
  "permission": "view",
  "expiresAt": "2026-04-30T23:59:59.000Z",
  "maxViews": 50,
  "viewCount": 0,
  "active": true,
  "createdAt": "2026-03-30T21:30:00.000Z"
}
```

**Status Codes:**
- 201: Link created
- 400: Invalid input
- 403: Not authorized (not owner)
- 404: Content not found
- 500: Server error

#### GET /api/sharing/links

List user's share links with optional filtering.

**Authentication:** Required

**Query Parameters:**

```
?contentType=sheet    // optional: "sheet" | "note"
&contentId=123        // optional
```

**Response:**

```json
[
  {
    "id": 1,
    "token": "550e8400-e29b-41d4-a716-446655440000",
    "contentType": "sheet",
    "contentId": 123,
    "permission": "view",
    "expiresAt": "2026-04-30T23:59:59.000Z",
    "maxViews": 50,
    "viewCount": 23,
    "active": true,
    "createdAt": "2026-03-30T21:30:00.000Z"
  }
]
```

#### DELETE /api/sharing/links/:id

Revoke (deactivate) a share link.

**Authentication:** Required (creator only)

**Response:**

```json
{ "success": true }
```

### Access via Share Link

#### GET /api/sharing/access/:token

Resolve a share link and return content with metadata.

**Authentication:** Optional

**Query Parameters:**

```
?password=secret123    // required if link is password-protected
```

**Response:**

```json
{
  "contentType": "sheet",
  "content": {
    "id": 123,
    "title": "Biology Study Guide",
    "content": "<html>...</html>",
    "author": {
      "id": 1,
      "username": "alice"
    },
    "course": {
      "id": 5,
      "code": "BIO101"
    },
    "createdAt": "2026-03-20T10:00:00.000Z"
  },
  "permission": "view",
  "viewCount": 24,
  "maxViews": 50
}
```

**Status Codes:**
- 200: Success
- 403: Password required or invalid
- 404: Link not found or content not found
- 410: Link expired or view limit reached
- 500: Server error

#### GET /api/sharing/access/:token/watermarked

Resolve a share link and return content with text watermark overlay (view-only indicator).

**Authentication:** Optional

**Query Parameters:**

```
?password=secret123    // required if link is password-protected
```

**Response:** Same as `/access/:token`, but `content.content` includes watermark.

For HTML content, injects a fixed-position diagonal watermark overlay with opacity 0.15.
For plain text, prepends and appends watermark lines.

Watermark format: `View Only - {username} - {date}`

**Status Codes:** Same as `/access/:token`

### Direct Shares

#### POST /api/sharing/direct

Grant a user direct access to a sheet or note.

**Authentication:** Required (owner only)

**Request Body:**

```json
{
  "contentType": "sheet",  // "sheet" | "note"
  "contentId": 123,
  "sharedWithId": 42,
  "permission": "view"     // "view" | "comment" | "edit"
}
```

**Response:**

```json
{
  "id": 5,
  "contentType": "sheet",
  "contentId": 123,
  "permission": "view",
  "createdAt": "2026-03-30T21:30:00.000Z"
}
```

**Status Codes:**
- 201: Share created or updated
- 400: Invalid input or self-share attempt
- 403: Not authorized or blocked user
- 404: User or content not found
- 500: Server error

#### GET /api/sharing/shared-with-me

List content shared with the current user.

**Authentication:** Required

**Query Parameters:**

```
?contentType=sheet    // optional: "sheet" | "note"
```

**Response:**

```json
[
  {
    "id": 5,
    "contentType": "sheet",
    "contentId": 123,
    "permission": "view",
    "sharedBy": {
      "id": 1,
      "username": "alice"
    },
    "createdAt": "2026-03-30T21:30:00.000Z"
  }
]
```

#### DELETE /api/sharing/direct/:id

Revoke a direct share.

**Authentication:** Required (sharer only)

**Response:**

```json
{ "success": true }
```

**Status Codes:**
- 200: Share revoked
- 400: Invalid share id
- 403: Not authorized (not sharer)
- 404: Share not found
- 500: Server error

## Implementation Details

### Watermarking

Watermark utilities in `backend/src/lib/watermark.js`:

- **watermarkHtml(html, watermarkText)** — Injects diagonal overlay via CSS
- **watermarkText(text, watermarkText)** — Prepends/appends watermark lines

### Authorization

- Owner-only operations validate via `assertOwnerOrAdmin()`
- Block filtering prevents sharing with blocked users via `isBlockedEitherWay()`
- Password protection is stored plaintext (consider hashing in v3)

### Rate Limiting

- Mutation endpoints (POST, DELETE): 30 requests per 60s
- Read endpoints (GET): 120 requests per 60s

### Permissions

Three levels of granularity:

1. **view** — Read-only access
2. **comment** — Read + comment (future: implements notes/highlights)
3. **edit** — Full content edit access

Frontend should enforce these via UI state and API validation.

## Migration

Run `npx prisma migrate deploy` to apply migration `20260330000002_add_privacy_controls_v2`.

This creates `ShareLink` and `ContentShare` tables with appropriate indexes and foreign keys.

## Future Enhancements

1. **Hashed passwords** for share links (bcrypt)
2. **Audit logging** for share access (when viewed, by whom)
3. **Expiring share links via cron job** (clean up expired links)
4. **Share link analytics** (view timeline, geography, devices)
5. **Comment permission level** — enforce full implementation
6. **Notification system** — notify user when content is shared with them
7. **Share link customization** — custom slug instead of UUID
