# Reference 12 — File Upload Security

## Files to Read

- `backend/src/lib/storage.js` or `r2Storage.js` — file storage
- `backend/src/modules/users/users.routes.js` — avatar upload endpoint
- `backend/src/modules/sheets/sheets.routes.js` — sheet upload endpoint
- `backend/src/lib/multerConfig.js` (or wherever Multer is configured)
- Any `upload.*single` or `upload.*array` middleware usage

---

## Check 12.1 — File Size Limits Enforced

**Rule:** Multer MUST configure `limits.fileSize`. Without it, an attacker can upload multi-GB files to exhaust disk or memory.

**Verify:**

```js
// CORRECT
const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter: validateFileType,
})
```

**Grep:**

```
multer\({[^}]*limits
```

If `multer({` appears without `limits:` nearby → MEDIUM.

---

## Check 12.2 — MIME Type Validation (Magic Bytes, Not Just Extension)

**Rule:** File type must be validated by reading magic bytes (file header), NOT by file extension and NOT by trusting the `Content-Type` header.

**Violation:**

```js
// WRONG — extension check only
if (!file.originalname.endsWith('.html')) reject('Invalid file type')

// ALSO WRONG — Content-Type from client is attacker-controlled
if (file.mimetype !== 'text/html') reject('Invalid file type')
```

**Correct pattern using `file-type` or `magic-bytes`:**

```js
// CORRECT — magic byte check
import { fileTypeFromBuffer } from 'file-type'
const detected = await fileTypeFromBuffer(fileBuffer)
const ALLOWED_TYPES = ['text/html', 'image/jpeg', 'image/png', 'image/webp', 'image/gif']
if (!ALLOWED_TYPES.includes(detected?.mime)) {
  throw new Error('File type not allowed')
}
```

**For HTML files:** `file-type` won't detect text/html by magic bytes (there's no magic byte for HTML). Use a text heuristic: check for `<!DOCTYPE` or `<html` at start, then run through the scan pipeline.

---

## Check 12.3 — Path Traversal Prevention

**Rule:** Never use `req.file.originalname` directly as the storage key or filename. Attackers can submit `../../../etc/passwd` or `../../config.js` as the filename.

**Correct pattern:**

```js
// CORRECT — generate safe filename
import { randomUUID } from 'crypto'
const ext = path
  .extname(file.originalname)
  .toLowerCase()
  .replace(/[^.a-z0-9]/g, '')
const safeFilename = `${randomUUID()}${ext}`
```

---

## Check 12.4 — SVG Upload Malicious Payload Scan

**Rule per CLAUDE.md:** Uploaded SVGs must be scanned server-side for `<script>` and `<foreignObject>` tags.

**Verify:**

```js
// CORRECT
if (ext === '.svg') {
  const content = await fs.readFile(filePath, 'utf-8')
  if (/<script|<foreignObject/i.test(content)) {
    throw new Error('SVG contains disallowed content')
  }
}
```

---

## Check 12.5 — Video Length Enforcement (Decision #5)

**Rule (LOCKED):** Max video length is 10 minutes. Videos longer than 10 minutes must be rejected.

**Verify in video upload handler:**

```js
// CORRECT
const MAX_VIDEO_SECONDS = 600 // 10 min
if (videoDuration > MAX_VIDEO_SECONDS) {
  return sendError(res, 400, 'Video exceeds maximum length of 10 minutes', ERROR_CODES.BAD_REQUEST)
}
```

**Status:** Video module is listed as untested in CLAUDE.md. Verify the limit is enforced.

---

## Check 12.6 — No Video URL Embeds (Decision #15)

**Rule (LOCKED):** Video embeds by URL are NOT allowed in v1. Uploads only. URL embeds create SSRF surface.

**Verify:** Any video-related endpoint that accepts a URL parameter for embedding → CRITICAL.

**Grep:**

```
videoUrl\|embed.*url\|video.*https\?://
```

If any endpoint stores or serves a user-supplied video URL as an embed source → CRITICAL.

---

## Check 12.7 — Uploaded File Served with Correct Content-Type

**Rule:** Files served from storage must set `Content-Type` and `Content-Disposition` to prevent browser execution of uploaded content.

**For HTML files** served outside of `sheets.getstudyhub.org`: serve with `Content-Disposition: attachment` to prevent direct browser rendering that would execute JavaScript.

---

## Severity Reference for File Upload Issues

| Issue                                         | OWASP | Severity |
| --------------------------------------------- | ----- | -------- |
| Video URL embed endpoint exists               | A10   | CRITICAL |
| No Multer file size limit                     | A05   | HIGH     |
| File type check via extension only            | A03   | HIGH     |
| SVG served without script scan                | A03   | HIGH     |
| Path traversal via `originalname`             | A01   | HIGH     |
| Video longer than 10 min accepted             | A05   | MEDIUM   |
| Missing `Content-Disposition` on served files | A03   | MEDIUM   |
