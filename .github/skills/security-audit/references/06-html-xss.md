# Reference 06 — HTML Injection & XSS

## Files to Read

- `backend/src/lib/htmlSecurity.js` (or equivalent) — `detectHtmlFeatures`, `classifyHtmlRisk`
- `backend/src/lib/editorSanitize.js` (or `frontend/studyhub-app/src/lib/editorSanitize.js`)
- `frontend/studyhub-app/src/lib/domPurify.js` (or wherever DOMPurify is configured)
- `backend/src/modules/sheets/sheets.service.js` — HTML scan pipeline trigger
- Any frontend component that uses `dangerouslySetInnerHTML`

---

## Check 6.1 — HTML Scan Pipeline Enforcement (Backend)

**Rule per CLAUDE.md:** All HTML goes through `detectHtmlFeatures` → `classifyHtmlRisk` → tier routing.

| Tier   | Condition                                                                        | Action                |
| ------ | -------------------------------------------------------------------------------- | --------------------- |
| Tier 0 | Clean                                                                            | Publish immediately   |
| Tier 1 | Mild risk (external resource loading)                                            | Publish with warning  |
| Tier 2 | Elevated risk                                                                    | Hold for admin review |
| Tier 3 | Critical (credential capture, 3+ high-risk categories, obfuscated miner, ClamAV) | Quarantine            |

**Verify:** Every sheet submission (create + update) triggers the scan pipeline BEFORE writing to DB.

**Grep:**

```
classifyHtmlRisk\|detectHtmlFeatures
```

**Violations:**

- Sheet stored without running through scan pipeline → Tier 3 content (XSS/phishing) published live → CRITICAL
- Scan pipeline bypassed when `req.user.role === 'admin'` → CRITICAL (Decision #7 per content moderation rules)

---

## Check 6.2 — AI-Generated Sheet Security

**Rule per CLAUDE.md:** AI-generated sheets flow through the SAME scan pipeline as user-uploaded sheets.

**Verify in `ai.service.js`:**

```js
// CORRECT
const { tier, findings } = await classifyHtmlRisk(generatedHtml)
if (tier >= 3) throw new Error('AI sheet quarantined')
// store with tier flag
```

**Additional constraint:** AI is instructed NEVER to include `<script>` tags. But the pipeline must also enforce it — do not rely solely on the prompt.

**Grep:**

```
ai.*sheet.*create\|generateSheet.*prisma.*create
```

For each match, verify `classifyHtmlRisk` is called first.

---

## Check 6.3 — `dangerouslySetInnerHTML` Must Use DOMPurify

**Rule:** Any React component using `dangerouslySetInnerHTML` on user-controlled content MUST sanitize with DOMPurify first.

**Violation pattern:**

```jsx
// WRONG
<div dangerouslySetInnerHTML={{ __html: post.content }} />
```

**Correct pattern:**

```jsx
// CORRECT
import DOMPurify from 'dompurify'
;<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(post.content) }} />
```

**Grep (frontend):**

```
dangerouslySetInnerHTML
```

For every match, verify DOMPurify is called in the same expression or that the value is pre-sanitized server-side.

**Exceptions:** Sheet preview inside an `<iframe>` served from `sheets.getstudyhub.org` does NOT need DOMPurify on the outer page (the iframe boundary is the security boundary).

---

## Check 6.4 — DOMPurify Configuration

**Verify DOMPurify config is strict:**

```js
// CORRECT
const PURIFY_CONFIG = {
  ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'code', 'pre'],
  ALLOWED_ATTR: ['href', 'target', 'rel'],
  FORBID_TAGS: ['style', 'script', 'iframe'],
  FORCE_BODY: true,
}
DOMPurify.sanitize(input, PURIFY_CONFIG)
```

**Check:** Is `FORBID_TAGS` strict enough to prevent CSS injection via `<style>` tags in user comments/bios?

---

## Check 6.5 — SVG Upload Sanitization

**Rule per CLAUDE.md:** Server-side scan for `<script>` and `<foreignObject>` in uploaded SVGs.

**Verify:** Avatar / resource upload handler checks SVG content for malicious payloads.

**Grep:**

```
foreignObject\|svg.*script
```

**Violation:** SVG stored without `<script>`/`<foreignObject>` check → stored XSS when SVG served directly → HIGH

---

## Check 6.6 — Markdown Rendering Safety

**Rule per CLAUDE.md:** Markdown rendering must use a known-safe library combination: `marked` + DOMPurify.

**Verify in frontend:**

```js
// CORRECT
import { marked } from 'marked'
import DOMPurify from 'dompurify'
const rendered = DOMPurify.sanitize(marked.parse(markdownInput))
```

**Violation:** `marked.parse()` output injected into DOM without DOMPurify → stored XSS via markdown → HIGH

---

## Check 6.7 — User Bio / Display Name HTML Stripping

**Rule:** User bios and display names must not contain HTML. Strip tags server-side on create/update.

**Verify in users service:**

```js
// CORRECT
import { stripHtml } from '../../lib/inputSanitizer.js'
const bio = stripHtml(req.body.bio)
```

---

## Check 6.8 — Multi-File Sheet Subdomain Isolation (Decision #13)

**Rule (LOCKED):** Multi-file sheets MUST be served from `sheets.getstudyhub.org` subdomain (separate origin). This is the primary XSS isolation boundary for HTML/CSS sheets.

**Status:** NOT YET BUILT (pre-req before multi-file ships).

**If any PR adds multi-file sheet rendering on the main domain** → CRITICAL finding — violates locked decision #13.

---

## Severity Reference for XSS Issues

| Issue                                       | OWASP | Severity |
| ------------------------------------------- | ----- | -------- |
| Sheet stored without scan pipeline          | A03   | CRITICAL |
| Admin bypasses scan pipeline                | A03   | CRITICAL |
| `dangerouslySetInnerHTML` without DOMPurify | A03   | CRITICAL |
| Multi-file sheets on main domain            | A03   | CRITICAL |
| AI sheet skips scan pipeline                | A03   | HIGH     |
| SVG stored without script check             | A03   | HIGH     |
| Markdown without DOMPurify                  | A03   | HIGH     |
| Bio / display name allows HTML tags         | A03   | HIGH     |
| DOMPurify config too permissive             | A03   | MEDIUM   |
