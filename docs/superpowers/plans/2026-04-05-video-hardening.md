# Video Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce download blocking, add ffmpeg watermarking during transcoding, and implement SHA-256 plagiarism detection with auto-block and appeal system.

**Architecture:** Backend-heavy changes to the video module. Download enforcement is a one-line guard in the stream endpoint. Watermarking extends the existing ffmpeg `-vf` filter chain. Plagiarism detection computes a SHA-256 hash after upload completion and checks for duplicates. Appeal system adds a new DB model and two endpoints. A database migration covers all schema changes.

**Tech Stack:** Node.js, Express 5, Prisma 6, ffmpeg (drawtext filter), crypto (SHA-256), R2 storage

---

### Task 1: Database Migration

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260405000001_add_video_hardening/migration.sql`

- [ ] **Step 1: Add fields to Video model and create VideoAppeal model in schema.prisma**

In `backend/prisma/schema.prisma`, find the Video model (line 1414). Add two new fields before `createdAt`:

```prisma
  contentHash       String?
  watermarkPosition String?
```

Add an index on contentHash. Change the indexes block to:

```prisma
  @@index([userId, createdAt(sort: Desc)])
  @@index([status])
  @@index([contentHash])
```

Add the VideoAppeal relations to the Video model (after the existing relations):

```prisma
  appeals           VideoAppeal[] @relation("VideoAppealVideo")
  appealOriginals   VideoAppeal[] @relation("VideoAppealOriginal")
```

Add VideoAppeal relations to the User model. Find the User model and add:

```prisma
  videoAppeals         VideoAppeal[] @relation("VideoAppealUploader")
  videoAppealReviews   VideoAppeal[] @relation("VideoAppealReviewer")
```

After the `VideoCaption` model (around line 1456), add the new model:

```prisma
model VideoAppeal {
  id              Int      @id @default(autoincrement())
  videoId         Int
  uploaderId      Int
  originalVideoId Int
  status          String   @default("pending")
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

- [ ] **Step 2: Create the migration SQL file**

Create `backend/prisma/migrations/20260405000001_add_video_hardening/migration.sql`:

```sql
-- Add content hash and watermark position to Video
ALTER TABLE "Video" ADD COLUMN "contentHash" TEXT;
ALTER TABLE "Video" ADD COLUMN "watermarkPosition" TEXT;

-- Index for fast duplicate lookups
CREATE INDEX "Video_contentHash_idx" ON "Video"("contentHash");

-- VideoAppeal table for plagiarism dispute resolution
CREATE TABLE "VideoAppeal" (
    "id" SERIAL NOT NULL,
    "videoId" INTEGER NOT NULL,
    "uploaderId" INTEGER NOT NULL,
    "originalVideoId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "reviewedBy" INTEGER,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoAppeal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VideoAppeal_videoId_idx" ON "VideoAppeal"("videoId");
CREATE INDEX "VideoAppeal_uploaderId_idx" ON "VideoAppeal"("uploaderId");
CREATE INDEX "VideoAppeal_status_idx" ON "VideoAppeal"("status");

ALTER TABLE "VideoAppeal" ADD CONSTRAINT "VideoAppeal_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VideoAppeal" ADD CONSTRAINT "VideoAppeal_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VideoAppeal" ADD CONSTRAINT "VideoAppeal_originalVideoId_fkey" FOREIGN KEY ("originalVideoId") REFERENCES "Video"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VideoAppeal" ADD CONSTRAINT "VideoAppeal_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 3: Verify schema is valid**

Run: `npx --prefix backend prisma validate`
Expected: "The schema is valid"

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260405000001_add_video_hardening/
git commit -m "chore: add video hardening migration (contentHash, watermarkPosition, VideoAppeal)"
```

---

### Task 2: Download Enforcement

**Files:**
- Modify: `backend/src/modules/video/video.routes.js`

- [ ] **Step 1: Add downloadable check to stream endpoint**

In `backend/src/modules/video/video.routes.js`, find the `GET /:id/stream` handler (line 433). After the status check on line 441, add the download enforcement check. The auth middleware is optional on this route (it uses `readLimiter` not `requireAuth`), so we need to extract the user ID from the cookie if present.

Find this block (lines 440-442):
```javascript
    if (video.status !== VIDEO_STATUS.READY) {
      return res.status(409).json({ error: 'Video is still processing.' })
    }
```

After it, add:
```javascript

    // Enforce download protection — owners can always stream their own videos
    if (video.downloadable === false) {
      const requesterId = req.user?.userId || null
      if (requesterId !== video.userId) {
        return res.status(403).json({ error: 'Downloads are disabled for this video.' })
      }
    }
```

Note: `req.user` may be populated by auth middleware if the user is logged in. If the route doesn't currently run auth middleware, the user will be `undefined` for non-authenticated requests, which is correct — non-authenticated users should not be able to download non-downloadable videos.

- [ ] **Step 2: Run backend lint**

Run: `npm --prefix backend run lint`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/video/video.routes.js
git commit -m "fix: enforce downloadable flag in video stream endpoint"
```

---

### Task 3: Watermarking in ffmpeg Pipeline

**Files:**
- Modify: `backend/src/modules/video/video.service.js`

- [ ] **Step 1: Add watermark position constants and helper**

At the top of `backend/src/modules/video/video.service.js`, after the existing imports and constants, add:

```javascript
// ── Watermark position presets ──────────────────────────────────────────
const WATERMARK_POSITIONS = {
  'top-left':     { x: 'w*0.03', y: 'h*0.03' },
  'top-right':    { x: 'w*0.97-tw', y: 'h*0.03' },
  'bottom-left':  { x: 'w*0.03', y: 'h*0.95' },
  'bottom-right': { x: 'w*0.97-tw', y: 'h*0.95' },
}

const WATERMARK_CORNERS = Object.keys(WATERMARK_POSITIONS)

function pickRandomCorner() {
  return WATERMARK_CORNERS[Math.floor(Math.random() * WATERMARK_CORNERS.length)]
}

function buildWatermarkFilter(username, position) {
  const pos = WATERMARK_POSITIONS[position]
  if (!pos) return null
  // Escape special characters in username for ffmpeg drawtext
  const safeUser = username.replace(/[\\':]/g, '\\$&')
  return `drawtext=text='@${safeUser}':fontsize=h*0.03:fontcolor=white@0.4:shadowcolor=black@0.3:shadowx=1:shadowy=1:x=${pos.x}:y=${pos.y}`
}
```

- [ ] **Step 2: Modify transcodeToPreset to accept watermark filter**

In `transcodeToPreset()` (line 172), add a `watermarkFilter` parameter:

Change the function signature from:
```javascript
function transcodeToPreset(inputPath, outputPath, preset, sourceInfo) {
```
to:
```javascript
function transcodeToPreset(inputPath, outputPath, preset, sourceInfo, watermarkFilter = null) {
```

Then modify the `-vf` filter string (line 194-195). Change:
```javascript
      '-vf',
      `scale=${preset.width}:${preset.height}:force_original_aspect_ratio=decrease,pad=${preset.width}:${preset.height}:(ow-iw)/2:(oh-ih)/2`,
```
to:
```javascript
      '-vf',
      `scale=${preset.width}:${preset.height}:force_original_aspect_ratio=decrease,pad=${preset.width}:${preset.height}:(ow-iw)/2:(oh-ih)/2${watermarkFilter ? ',' + watermarkFilter : ''}`,
```

- [ ] **Step 3: Modify processVideo to look up username and pass watermark**

In `processVideo()` (line 275), after fetching the video record (line 278), look up the creator's username and pick a watermark position:

After line 279 (`if (!video) return`), add:
```javascript

  // Look up creator username for watermarking
  let creatorUsername = null
  let watermarkPosition = null
  let watermarkFilter = null
  try {
    const creator = await prisma.user.findUnique({
      where: { id: video.userId },
      select: { username: true },
    })
    if (creator) {
      creatorUsername = creator.username
      watermarkPosition = pickRandomCorner()
      watermarkFilter = buildWatermarkFilter(creatorUsername, watermarkPosition)
      // Store the chosen position
      await prisma.video.update({
        where: { id: videoId },
        data: { watermarkPosition },
      })
    }
  } catch {
    // Non-fatal — proceed without watermark
  }
```

Then in the transcoding loop (around line 416), pass the watermark filter to `transcodeToPreset`. Change:
```javascript
        const result = await transcodeToPreset(rawPath, outPath, preset, metadata)
```
to:
```javascript
        const result = await transcodeToPreset(rawPath, outPath, preset, metadata, watermarkFilter)
```

- [ ] **Step 4: Run backend lint**

Run: `npm --prefix backend run lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/video/video.service.js
git commit -m "feat: add watermarking to video transcoding pipeline"
```

---

### Task 4: SHA-256 Content Hash and Duplicate Detection

**Files:**
- Modify: `backend/src/modules/video/video.routes.js`
- Modify: `backend/src/modules/video/video.service.js`

- [ ] **Step 1: Add hash computation to processVideo**

In `backend/src/modules/video/video.service.js`, add `crypto` to the imports at the top of the file:

```javascript
const crypto = require('crypto')
```

In `processVideo()`, after the raw video is downloaded from R2 (after line 338, the writeStream finish promise), compute the SHA-256 hash and check for duplicates:

```javascript

    // Compute SHA-256 content hash for plagiarism detection
    let contentHash = null
    try {
      const hashStream = fs.createReadStream(rawPath)
      const hash = crypto.createHash('sha256')
      await new Promise((resolve, reject) => {
        hashStream.on('data', (chunk) => hash.update(chunk))
        hashStream.on('end', resolve)
        hashStream.on('error', reject)
      })
      contentHash = hash.digest('hex')

      // Store hash immediately
      await prisma.video.update({
        where: { id: videoId },
        data: { contentHash },
      })

      // Check for duplicate content from other users
      const duplicate = await prisma.video.findFirst({
        where: {
          contentHash,
          userId: { not: video.userId },
          status: VIDEO_STATUS.READY,
          id: { not: videoId },
        },
        include: {
          user: { select: { id: true, username: true } },
        },
      })

      if (duplicate) {
        // Block this video
        await prisma.video.update({
          where: { id: videoId },
          data: { status: 'blocked' },
        })

        // Notify the original creator
        try {
          await prisma.notification.create({
            data: {
              userId: duplicate.userId,
              type: 'video_copy_detected',
              message: `Someone attempted to upload a copy of your video "${duplicate.title || 'Untitled'}"`,
              actorId: video.userId,
              linkPath: `/feed?filter=videos`,
              priority: 'high',
            },
          })
        } catch {
          // Non-fatal
        }

        cleanup(baseDir)
        return // Stop processing — video is blocked
      }
    } catch (hashErr) {
      captureError(hashErr, { context: 'video-content-hash', videoId })
      // Non-fatal — proceed without hash
    }
```

- [ ] **Step 2: Add appeal endpoint to video.routes.js**

In `backend/src/modules/video/video.routes.js`, after the `DELETE /:id` handler, add the appeal endpoint:

```javascript
/**
 * POST /api/video/:id/appeal
 * Submit an appeal for a blocked video (plagiarism detection).
 * Body: { reason }
 */
router.post('/:id/appeal', requireAuth, async (req, res) => {
  try {
    const videoId = parseInt(req.params.id, 10)
    if (isNaN(videoId)) return res.status(400).json({ error: 'Invalid video ID.' })

    const { reason } = req.body || {}
    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({ error: 'Please provide a reason (at least 10 characters).' })
    }

    const video = await prisma.video.findUnique({ where: { id: videoId } })
    if (!video) return res.status(404).json({ error: 'Video not found.' })
    if (video.userId !== req.user.userId) {
      return res.status(403).json({ error: 'You can only appeal your own videos.' })
    }
    if (video.status !== 'blocked') {
      return res.status(400).json({ error: 'Only blocked videos can be appealed.' })
    }

    // Check for existing pending appeal
    const existingAppeal = await prisma.videoAppeal.findFirst({
      where: { videoId, status: 'pending' },
    })
    if (existingAppeal) {
      return res.status(409).json({ error: 'An appeal is already pending for this video.' })
    }

    // Find the original video this was flagged against
    const original = await prisma.video.findFirst({
      where: {
        contentHash: video.contentHash,
        userId: { not: video.userId },
        status: VIDEO_STATUS.READY,
      },
    })

    if (!original) {
      return res.status(400).json({ error: 'Could not find the original video for appeal.' })
    }

    const appeal = await prisma.videoAppeal.create({
      data: {
        videoId,
        uploaderId: req.user.userId,
        originalVideoId: original.id,
        reason: reason.trim().slice(0, 1000),
      },
    })

    res.json({ appeal, message: 'Appeal submitted. An admin will review it.' })
  } catch (err) {
    captureError(err, { route: req.originalUrl, method: req.method })
    res.status(500).json({ error: 'Failed to submit appeal.' })
  }
})
```

- [ ] **Step 3: Update formatVideoResponse to include new fields**

In `backend/src/modules/video/video.routes.js`, find the `formatVideoResponse` function. Add the new fields to the returned object:

Find the function and add `contentHash` and `watermarkPosition` to its return object. Add these lines alongside the existing fields:
```javascript
    contentHash: video.contentHash || null,
    watermarkPosition: video.watermarkPosition || null,
```

- [ ] **Step 4: Run backend lint**

Run: `npm --prefix backend run lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/video/video.routes.js backend/src/modules/video/video.service.js
git commit -m "feat: add SHA-256 plagiarism detection with auto-block and appeal endpoint"
```

---

### Task 5: Frontend - Appeal Error Handling

**Files:**
- Modify: `frontend/studyhub-app/src/lib/useVideoUpload.js`
- Modify: `frontend/studyhub-app/src/components/video/VideoUploader.jsx`

- [ ] **Step 1: Handle blocked status in VideoProcessingProgress**

In `frontend/studyhub-app/src/components/video/VideoUploader.jsx`, find the `VideoProcessingProgress` component (line 503). In the polling `useEffect`, add handling for `blocked` status.

Find the block that checks `data.status === 'failed'` (around line 540):
```javascript
        if (data.status === 'failed') {
          setStep('failed')
          clearInterval(poll)
          return
        }
```

After it, add:
```javascript
        if (data.status === 'blocked') {
          setStep('blocked')
          clearInterval(poll)
          return
        }
```

Then after the `step === 'failed'` error message JSX (around line 622-625), add the blocked state UI:

```jsx
      {step === 'blocked' && (
        <div style={{ marginTop: 12, padding: '12px 16px', background: 'var(--sh-warning-bg)', border: '1px solid var(--sh-warning-border)', borderRadius: 8 }}>
          <p style={{ color: 'var(--sh-warning-text)', fontSize: 'var(--type-sm)', fontWeight: 600, margin: '0 0 8px' }}>
            This video appears to belong to another user. Upload has been blocked.
          </p>
          <p style={{ color: 'var(--sh-warning-text)', fontSize: 'var(--type-xs)', margin: 0 }}>
            If this is your content, you can submit an appeal from your video settings.
          </p>
        </div>
      )}
```

- [ ] **Step 2: Run frontend lint**

Run: `npm --prefix frontend/studyhub-app run lint`
Expected: PASS

- [ ] **Step 3: Run frontend build**

Run: `npm --prefix frontend/studyhub-app run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/studyhub-app/src/components/video/VideoUploader.jsx
git commit -m "feat: add blocked video status handling with appeal guidance in VideoUploader"
```

---

### Task 6: Final Verification

- [ ] **Step 1: Run full backend lint**

Run: `npm --prefix backend run lint`
Expected: PASS

- [ ] **Step 2: Run full frontend lint**

Run: `npm --prefix frontend/studyhub-app run lint`
Expected: PASS

- [ ] **Step 3: Run full frontend build**

Run: `npm --prefix frontend/studyhub-app run build`
Expected: PASS

- [ ] **Step 4: Verify schema is valid**

Run: `npx --prefix backend prisma validate`
Expected: PASS
