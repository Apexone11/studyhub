# Privacy Controls v2 — Implementation Checklist

Status: COMPLETE

## Task 1: Prisma Models

- [x] Add `ShareLink` model to schema
  - [x] UUID token field with unique constraint
  - [x] contentType and contentId fields
  - [x] createdById with relation to User
  - [x] permission field (view/comment/edit)
  - [x] expiresAt optional field
  - [x] maxViews optional field
  - [x] viewCount counter
  - [x] password optional field
  - [x] active boolean flag
  - [x] createdAt timestamp
  - [x] Indexes on token, contentType/contentId, createdById

- [x] Add `ContentShare` model to schema
  - [x] contentType and contentId fields
  - [x] sharedById with relation to User
  - [x] sharedWithId with relation to User
  - [x] permission field (view/comment/edit)
  - [x] createdAt timestamp
  - [x] Unique constraint on contentType/contentId/sharedWithId
  - [x] Index on sharedWithId/contentType

- [x] Add relations to User model
  - [x] shareLinksCreated relation
  - [x] contentSharedBy relation
  - [x] contentSharedWith relation

## Task 2: Database Migration

- [x] Create migration file: `20260330000002_add_privacy_controls_v2/migration.sql`
- [x] CREATE TABLE "ShareLink" with all fields and indexes
- [x] CREATE TABLE "ContentShare" with all fields and indexes
- [x] Add foreign key constraints
  - [x] ShareLink.createdById -> User.id (RESTRICT)
  - [x] ContentShare.sharedById -> User.id (RESTRICT)
  - [x] ContentShare.sharedWithId -> User.id (CASCADE)
- [x] Create unique indexes
- [x] Create performance indexes

## Task 3: API Routes — Share Links

- [x] `POST /api/sharing/links`
  - [x] Validate contentType (sheet/note)
  - [x] Validate contentId
  - [x] Validate permission (view/comment/edit)
  - [x] Validate expiresAt (must be future)
  - [x] Validate maxViews (positive integer)
  - [x] Check owner authorization
  - [x] Create ShareLink in database
  - [x] Return token and metadata
  - [x] Rate limit (30/min)
  - [x] Error handling and Sentry capture

- [x] `GET /api/sharing/links`
  - [x] Optional contentType filter
  - [x] Optional contentId filter
  - [x] List user's share links
  - [x] Return with all fields
  - [x] Rate limit (120/min)

- [x] `DELETE /api/sharing/links/:id`
  - [x] Validate link id
  - [x] Check creator authorization
  - [x] Delete share link
  - [x] Return success response
  - [x] Rate limit (30/min)

- [x] `GET /api/sharing/access/:token`
  - [x] Find share link by token
  - [x] Check active flag
  - [x] Check expiry
  - [x] Check view count limit
  - [x] Validate password if required
  - [x] Fetch content (sheet/note)
  - [x] Increment viewCount
  - [x] Return content with metadata
  - [x] Rate limit (120/min)
  - [x] Allow unauthenticated access

- [x] `GET /api/sharing/access/:token/watermarked`
  - [x] Same validation as non-watermarked endpoint
  - [x] Fetch content
  - [x] Apply watermark (HTML or text)
  - [x] Include watermark text: "View Only - {username} - {date}"
  - [x] Return watermarked content
  - [x] Allow unauthenticated access

## Task 4: API Routes — Direct Shares

- [x] `POST /api/sharing/direct`
  - [x] Validate contentType (sheet/note)
  - [x] Validate contentId
  - [x] Validate sharedWithId
  - [x] Validate permission
  - [x] Check owner authorization
  - [x] Prevent self-sharing
  - [x] Verify recipient exists
  - [x] Check block status (isBlockedEitherWay)
  - [x] Create or update ContentShare
  - [x] Return share metadata
  - [x] Rate limit (30/min)

- [x] `GET /api/sharing/shared-with-me`
  - [x] Optional contentType filter
  - [x] List content shared with current user
  - [x] Include sharedBy user info
  - [x] Return in correct format
  - [x] Rate limit (120/min)
  - [x] Require authentication

- [x] `DELETE /api/sharing/direct/:id`
  - [x] Validate share id
  - [x] Check sharer authorization
  - [x] Delete ContentShare
  - [x] Return success response
  - [x] Rate limit (30/min)

## Task 5: Module Barrel

- [x] Create `backend/src/modules/sharing/index.js`
- [x] Re-export routes from sharing.routes.js
- [x] Follow existing StudyHub barrel pattern

## Task 6: Main Index Mount

- [x] Import sharingRoutes in `backend/src/index.js`
- [x] Mount at `/api/sharing` path
- [x] Add comment explaining purpose
- [x] Place near other module mounts

## Task 7: Watermark Utility

- [x] Create `backend/src/lib/watermark.js`
- [x] Implement `watermarkHtml(html, watermarkText)`
  - [x] Inject CSS overlay div
  - [x] Fixed position, rotated -45 degrees
  - [x] Low opacity (0.15)
  - [x] Append before closing body tag or at end
  - [x] Non-blocking (pointer-events: none)
- [x] Implement `watermarkText(text, watermarkText)`
  - [x] Prepend watermark line
  - [x] Append watermark line
  - [x] Format: "--- watermarkText ---"
- [x] Export both functions

## Code Quality

- [x] No syntax errors (node -c validation)
- [x] All imports resolve correctly
- [x] No unused imports
- [x] Follow ESLint rules
- [x] Use requireAuth and optionalAuth correctly
- [x] Use rate limiters (mutateLimiter, readLimiter)
- [x] Use parseInt validation with Number.isInteger
- [x] Use block filtering (isBlockedEitherWay)
- [x] Use Sentry error capture (captureError)
- [x] Use assertOwnerOrAdmin authorization
- [x] Use Prisma select/include for query efficiency
- [x] No emoji usage in code

## Security

- [x] Owner-only authorization on all mutations
- [x] Block filtering prevents sharing with blocked users
- [x] Input validation (parseInt, contentType enum, permission enum)
- [x] Rate limiting on all endpoints
- [x] Password protection support for share links
- [x] Active flag for soft-delete
- [x] Error handling doesn't leak sensitive info

## Documentation

- [x] Create `backend/docs/PRIVACY_CONTROLS_V2.md`
  - [x] Schema documentation
  - [x] All 8 endpoints documented
  - [x] Request/response examples
  - [x] Status codes
  - [x] Query parameters
  - [x] Implementation notes
  - [x] Future enhancements

- [x] Create `IMPLEMENTATION_SUMMARY.md`
  - [x] Overview
  - [x] Files created
  - [x] Code quality notes
  - [x] Security considerations
  - [x] Testing recommendations

## Testing Ready

The implementation is ready for:
- [x] Unit tests for watermark functions
- [x] Integration tests for all 8 endpoints
- [x] Authorization and block filtering tests
- [x] Rate limiting validation
- [x] Expiry and view limit enforcement tests
- [x] Password protection tests
- [x] Watermarking tests (HTML vs text)

## Deployment Notes

- [x] Prisma schema is valid
- [x] Migration file is syntactically correct SQL
- [x] No breaking changes to existing schema
- [x] All new tables have proper indexes
- [x] Foreign keys properly configured
- [x] Can be deployed with: `npx prisma migrate deploy`

## Summary

All 6 tasks completed successfully:

1. ✓ Prisma models (ShareLink, ContentShare, User relations)
2. ✓ Database migration (20260330000002)
3. ✓ Sharing routes (8 endpoints)
4. ✓ Module barrel (index.js)
5. ✓ Main index mount (/api/sharing)
6. ✓ Watermark utility (watermarkHtml, watermarkText)

Plus comprehensive documentation and pattern compliance.
