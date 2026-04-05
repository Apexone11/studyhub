# Sub-project B: Video Hardening

**Date:** 2026-04-05
**Scope:** Enforce download blocking, add watermarking during transcoding, SHA-256 plagiarism detection with auto-block and appeal system

---

## 1. Download Enforcement

**Problem:** `GET /api/video/:id/stream` returns signed R2 URLs regardless of the `downloadable` flag. Anyone can download any video.

**Backend fix (`video.routes.js`):**
- In the `/api/video/:id/stream` endpoint, after fetching the video, check `video.downloadable`.
- If `downloadable === false` and the requester is NOT the video owner (`req.user?.id !== video.userId`), return 403 with `{ error: 'Downloads are disabled for this video.' }`.
- Owners can always access their own videos.
- HLS manifest and variant streaming for in-browser playback are unaffected -- only the explicit `/stream` download endpoint is gated.

**Frontend fix:**
- In the video player/card component, hide the Download button when `downloadable === false` and the current user is not the video owner.
- Find all places where a Download button/link is rendered for videos and gate on `video.downloadable && (video.userId === currentUser?.id || video.downloadable)`.

**Files:**
- Modify: `backend/src/modules/video/video.routes.js` (stream endpoint)
- Modify: Frontend video card/player component (wherever Download button is rendered)

---

## 2. Watermarking via ffmpeg

**Approach:** Add `drawtext` filter to the ffmpeg `-vf` chain during transcoding in `video.service.js`.

**Watermark spec:**
- Text: `@{username}` (creator's username)
- Font size: Proportional to video height -- `h*0.03` (3% of height)
- Color: White at 40% opacity (`fontcolor=white@0.4`)
- Shadow: Black at 30% opacity, offset 1px (`shadowcolor=black@0.3:shadowx=1:shadowy=1`)
- Position: One of 4 corners, chosen randomly at processing time:
  - top-left: `x=w*0.03:y=h*0.03`
  - top-right: `x=w*0.97-tw:y=h*0.03`
  - bottom-left: `x=w*0.03:y=h*0.95`
  - bottom-right: `x=w*0.97-tw:y=h*0.95`
- Same position used for all quality presets of the same video

**Database change:**
- Add `watermarkPosition String?` to Video model (stores: `top-left`, `top-right`, `bottom-left`, `bottom-right`)

**Implementation in `video.service.js`:**
- In `processVideo()`, after fetching the video record, look up the creator's username
- Choose a random corner position and store it in the Video record
- Pass the username and position to `transcodeToPreset()` 
- In `transcodeToPreset()`, append the `drawtext` filter to the existing `-vf` chain:
  ```
  scale=...,pad=...,drawtext=text='@username':fontsize=h*0.03:fontcolor=white@0.4:shadowcolor=black@0.3:shadowx=1:shadowy=1:x=<pos_x>:y=<pos_y>
  ```

**Files:**
- Modify: `backend/src/modules/video/video.service.js` (processVideo + transcodeToPreset)
- Modify: `backend/prisma/schema.prisma` (add watermarkPosition field)
- Create: Migration for watermarkPosition column

---

## 3. Content Hash for Plagiarism Detection

**Approach:** SHA-256 hash of the raw uploaded file, computed after chunked upload completes, checked against existing videos.

### 3a. Hash Computation

- In the upload completion handler (`POST /api/video/upload/complete` in `video.routes.js`), after the multipart upload is completed on R2, compute a SHA-256 hash of the file.
- Since the file is on R2, download it to compute the hash (or compute it from the chunks during upload). The simplest approach: compute hash from the chunk buffers as they arrive during `POST /api/video/upload/chunk`, accumulating a running hash. Final hash is available at complete time.
- Store the hash in the Video record's new `contentHash` field.

### 3b. Duplicate Check

- After hash computation, query: `prisma.video.findFirst({ where: { contentHash: hash, userId: { not: uploaderId }, status: 'ready' } })`
- If match found:
  1. Delete the uploaded R2 object
  2. Update the Video record status to `blocked`
  3. Return error: `{ error: 'This video appears to belong to another user.', originalCreator: originalVideo.user.username, videoId: video.id, canAppeal: true }`
  4. Send notification to original creator: "Someone attempted to upload a copy of your video '{title}'"
  5. Create a `VideoFlag` record for admin visibility

### 3c. Appeal System

- New endpoint: `POST /api/video/:id/appeal` with `{ reason: "..." }`
- Creates a `VideoAppeal` record (pending status)
- Admin can review in admin panel and approve (unblocks the video) or reject (deletes it)
- On approval: set video status back to `processing` and re-run the pipeline
- On rejection: delete R2 objects and send notification to uploader

### 3d. Database Changes

Add to Video model:
```prisma
contentHash        String?
watermarkPosition  String?

@@index([contentHash])
```

New VideoAppeal model:
```prisma
model VideoAppeal {
  id              Int      @id @default(autoincrement())
  videoId         Int
  uploaderId      Int
  originalVideoId Int
  status          String   @default("pending")  // pending, approved, rejected
  reason          String?
  reviewedBy      Int?
  reviewNote      String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  video           Video    @relation("VideoAppealVideo", fields: [videoId], references: [id], onDelete: Cascade)
  uploader        User     @relation("VideoAppealUploader", fields: [uploaderId], references: [id])
  originalVideo   Video    @relation("VideoAppealOriginal", fields: [originalVideoId], references: [id])
  reviewer        User?    @relation("VideoAppealReviewer", fields: [reviewedBy], references: [id])

  @@index([videoId])
  @@index([uploaderId])
  @@index([status])
}
```

**Files:**
- Modify: `backend/src/modules/video/video.routes.js` (upload complete handler, new appeal endpoint)
- Modify: `backend/src/modules/video/video.service.js` (hash computation)
- Modify: `backend/prisma/schema.prisma` (Video fields + VideoAppeal model)
- Create: Migration SQL for new fields and table
- Modify: Frontend video upload error handling (show appeal option)

---

## 4. Notification Integration

- Use existing notification system to notify:
  - Original creator when their video is copied
  - Uploader when their appeal is approved/rejected
- Notification types: `video_copy_detected`, `video_appeal_approved`, `video_appeal_rejected`

---

## Migration Required

Single migration adding:
- `watermarkPosition` column to `Video` table
- `contentHash` column to `Video` table with index
- `VideoAppeal` table

---

## Testing Plan

- Backend: Test download enforcement (owner vs non-owner, downloadable true/false)
- Backend: Test hash computation and duplicate detection
- Backend: Test appeal creation and admin review endpoints
- Manual: Verify watermark appears in transcoded videos
- Run: `npm --prefix backend run lint`
- Run: `npm --prefix frontend/studyhub-app run lint`
- Run: `npm --prefix frontend/studyhub-app run build`
