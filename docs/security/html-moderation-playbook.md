# HTML Moderation Playbook

Step-by-step guide for administrators reviewing HTML study sheets in the StudyHub admin panel.

---

## When Reviews Are Triggered

| Tier | Label | What Happens |
|------|-------|-------------|
| 0 | Clean | Published immediately. No admin action needed. |
| 1 | Flagged | Published with warning badge. Author must acknowledge. No admin action needed. |
| 2 | High Risk | Held in `pending_review` status. Admin must approve or reject. |
| 3 | Quarantined | Isolated. Preview disabled. Admin must review. |

Tier 2 and Tier 3 sheets appear in the **Admin Panel > Sheet Reviews** tab. Email alerts and in-app notifications are sent when a sheet enters the review queue.

---

## Review Queue Overview

Navigate to **Admin Panel > Sheet Reviews**. The queue shows:

- **Status filters**: Pending review, Rejected, Draft, Published
- **Format filter**: All, HTML only, Markdown only
- **Scan status filter**: All, Queued, Running, Passed, Failed

Each queue card displays:
- Sheet title, course, author, format
- **Tier badge** (color-coded: green/amber/red/dark red)
- **Preview mode badge** (Interactive / Safe / Restricted / Disabled)
- **Finding count** with inline summary
- Quick action buttons: Open, Review HTML, Quick Approve, Quick Reject

---

## Review Workflow

### Step 1: Open the Review Panel

Click **Review HTML** on a queue card. The review panel opens with:

- **Header**: Title, course, author, format, status
- **Tier summary**: "Tier N: [Label]" with risk summary text
- **Tier explanation**: Why this tier was assigned

### Step 2: Inspect Content (3 Tabs)

| Tab | Purpose | Safety |
|-----|---------|--------|
| **Safe Preview** | Sandboxed iframe with all scripts stripped | Safe to view |
| **Raw HTML (text)** | Plain-text source code, never rendered | Safe to view |
| **Findings (N)** | Grouped scan findings by category with severity | Informational |

**Safe Preview** renders the sheet's sanitized HTML in an iframe with empty `sandbox` attribute (maximum restriction). No JavaScript executes.

**Raw HTML** shows the complete source as plain text. Look for:
- `<script>` blocks with suspicious code
- External URLs in `action=`, `src=`, `href=` attributes
- Obfuscated strings (hex escapes, base64, `String.fromCharCode`)
- Hidden elements or zero-size iframes

**Findings** tab shows grouped findings sorted by severity (critical > high > medium). Each category group lists:
- Severity badge (critical/high/medium)
- Category label (e.g., "Risky JavaScript", "Code Obfuscation")
- Individual finding messages

### Step 3: Evaluate Risk

Ask these questions:

1. **Is the content educational?** Study sheets legitimately use interactive HTML features (charts, animations, quizzes).
2. **Do the findings match the content?** A sheet about JavaScript that contains `eval()` for demonstration may be legitimate.
3. **Are there external data flows?** Forms submitting to external URLs, fetch calls to unknown domains, or beacon requests are high-risk regardless of educational intent.
4. **Is there obfuscation?** Legitimate educational content rarely needs obfuscated code. Heavy obfuscation is a strong red flag.
5. **Does the author have history?** Check the author's profile and prior submissions for patterns.

### Step 4: Choose an Action

| Action | When to Use | Result |
|--------|-------------|--------|
| **Approve & Publish** | Content is safe or risk is acceptable | Sheet status → `published`, preview mode set by tier |
| **Reject** | Content violates guidelines or poses real risk | Sheet status → `rejected`, author notified |
| **Quick Approve** | Obvious false positive, minimal risk | Same as Approve (from queue card) |
| **Quick Reject** | Obvious violation, no detailed review needed | Same as Reject (from queue card) |

### Step 5: Add a Review Reason

Use the reason templates or write a custom reason. Templates:

| Template | Best For |
|----------|----------|
| "Allowed advanced HTML; safe preview only." | Tier 2 approvals where content uses advanced features legitimately |
| "Content is clean, no security issues found." | False positives or borderline Tier 1→2 escalations |
| "Pending due to obfuscated script behavior." | Holding for further investigation |
| "Quarantined due to phishing/exfiltration indicators." | Tier 3 sheets with credential capture or data exfiltration |
| "Rejected — content violates community guidelines." | Clear policy violations |

Reasons are stored in the review record and visible in audit history.

---

## Decision Matrix by Finding Category

| Category | Typical Action | Notes |
|----------|---------------|-------|
| Suspicious Tags | Approve | Scripts/iframes are common in interactive study materials |
| Inline Event Handlers | Approve | Common in interactive HTML (quizzes, toggles) |
| Dangerous URLs | Investigate | Check if `javascript:` URLs are used maliciously or as demos |
| Risky JavaScript | Investigate | Check if network APIs or eval are educational or exfiltrating |
| Code Obfuscation | Likely Reject | Legitimate content rarely needs obfuscation |
| Page Redirects | Likely Reject | Redirects have no educational purpose in study sheets |
| Data Exfiltration | Reject | External form submissions are not appropriate for study sheets |
| Keylogging | Reject | Keystroke capture + network has no legitimate use case |
| Crypto Mining | Reject | Mining on user devices is never acceptable |
| Credential Capture | Reject | Phishing forms are always a violation |
| Antivirus Detection | Reject | AV-flagged content should not be published |

---

## Preview Modes After Approval

When approving, the sheet's preview mode is determined by its tier:

| Tier | Preview Mode | Behavior |
|------|-------------|----------|
| 0 | Interactive | Full HTML rendering with inline scripts in sandboxed iframe |
| 1 | Safe | Scripts stripped, static HTML only |
| 2 | Restricted | Scripts stripped, additional restrictions, warning displayed |
| 3 | Disabled | No preview available, admin-only access |

---

## Escalation

If you're unsure about a sheet:
- Leave it in `pending_review` status
- Use the "Pending due to obfuscated script behavior." template
- Contact the project owner (Abdul) for guidance on edge cases
- Check `docs/security/html-finding-categories.md` for detailed category documentation

---

## Source Files

- Admin queue: `frontend/studyhub-app/src/pages/admin/SheetReviewsTab.jsx`
- Review panel: `frontend/studyhub-app/src/pages/admin/SheetReviewPanel.jsx`
- Panel sub-components: `frontend/studyhub-app/src/pages/admin/SheetReviewDetails.jsx`
- Review API: `backend/src/modules/admin/admin.routes.js`
- Scanner pipeline: `backend/src/lib/htmlSecurityScanner.js`
