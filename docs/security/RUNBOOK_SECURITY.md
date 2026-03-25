# Runbook: Security Incident (Suspected Breach / Data Exposure)

> **When to use:** You suspect unauthorized access, data exposure, account takeover, or malicious content executing in production.
> **Last updated:** 2026-03-24

---

## Indicators of Compromise

Watch for these signals:

### In Sentry / Logs
- Spike in `403` responses (brute-force attempts)
- Spike in `429` responses (rate limit hits from a single IP)
- Spike in `500` errors on auth routes
- `AUTH_EXPIRED` or `CSRF_INVALID` errors from unexpected sources
- Admin endpoints being hit by non-admin users

### In User Reports
- "My account was accessed from a device I don't recognize"
- "Sheets I didn't create appeared on my profile"
- "I got logged out and my password doesn't work"

### In Admin Panel
- Unusual admin actions (mass approvals, bulk deletions)
- New admin accounts you didn't create
- Sheets published that bypass the review queue

### In HTML Security Pipeline
- Tier 3 (quarantined) sheets appearing frequently
- ClamAV detecting payloads
- `validateHtmlForRuntime` blocking sheets with credential-capture patterns
- Users reporting suspicious content in published sheets

---

## Immediate Containment (First 5 Minutes)

### Severity Assessment

| Signal | Severity | Action |
|--------|----------|--------|
| JWT secret possibly leaked | **SEV0** | Rotate immediately → [Secrets Rotation](RUNBOOK_SECRETS_ROTATION.md) |
| Account takeover reports | **SEV0** | Rotate JWT, investigate affected accounts |
| Malicious HTML sheet live in production | **SEV0** | Kill switch: `STUDYHUB_HTML_UPLOADS=disabled` |
| DB credentials exposed | **SEV0** | Rotate DB password, check for data exfiltration |
| Brute-force login attempts | **SEV2** | Rate limiting should handle it — verify `429` responses are firing |
| Single spam account | **SEV3** | Ban via admin panel, no emergency action needed |

### Containment Actions (pick what fits)

**Lock down writes:**
```
Railway → Backend → Variables → GUARDED_MODE=true → Save
```
This blocks all non-admin write operations (503). Users can still read.

**Disable HTML uploads and preview:**
```
Railway → Backend → Variables → STUDYHUB_HTML_UPLOADS=disabled → Save
```

**Force logout all users (nuclear option):**
```
Railway → Backend → Variables → Change JWT_SECRET to a new 64-char hex → Save
```
Every active session becomes invalid. Users must log in again.

**Disable interactive preview only:**
The `html-runtime` endpoint is already gated to owner/admin. To fully disable, set `STUDYHUB_HTML_UPLOADS=disabled` which blocks all HTML preview token generation.

---

## Evidence Capture

**Before you fix anything, capture evidence:**

1. **Sentry:** Screenshot the error timeline, note event IDs for the suspicious activity
2. **Railway Logs:** Export or screenshot backend logs around the incident timestamp
3. **Admin Audit:** Check the admin panel for recent review actions, user modifications
4. **Database:** If safe to query, check `studySheet` records with recent `reviewedAt` or `status` changes
5. **Timestamps:** Note everything in UTC

**What to save:**
- Sentry event IDs and stack traces
- Railway deployment IDs around the incident window
- IP addresses from rate limit logs (if available)
- Affected user IDs and usernames
- The specific request patterns (which endpoints, what payloads)

---

## Investigation

### Check for JWT Secret Compromise
- Was `JWT_SECRET` ever committed to git? → `git log -p --all -S "JWT_SECRET" -- .env`
- Is the secret in any public place? (GitHub, Sentry breadcrumbs, client-side code)
- Is it shorter than 32 characters? (startup validation should catch this, but check)

### Check for Account Takeover
- Query affected users: check `lastLoginAt`, `loginCount` in the database
- Check if password was changed (look for recent settings updates)
- Check if Google OAuth was linked/unlinked

### Check for Malicious Content
- Admin panel → Review Queue → look for Tier 2-3 sheets
- Check `htmlScanFindings` for recent sheets with critical severity
- If a malicious sheet is live: delete it via admin panel, then investigate how it passed review

### Check for Unauthorized Admin Access
- Query `User` table: `SELECT id, username, role FROM "User" WHERE role = 'admin'`
- Verify each admin account is expected
- Check `reviewedBy` on recently published sheets

---

## Recovery

### After Containment
1. **Rotate compromised credentials** → [Secrets Rotation](RUNBOOK_SECRETS_ROTATION.md)
2. **Remove malicious content** → Admin panel → delete affected sheets
3. **Ban compromised/malicious accounts** → Admin panel → restrict user
4. **Re-enable features** → Remove kill switch env vars → Save → Redeploy
5. **Verify** → Test login, upload, preview, review flows

### If Data Was Exposed
1. Identify what data was accessible (emails, usernames, sheet content, passwords)
2. Passwords are bcrypt-hashed — if only hashes were exposed, users don't need to rotate immediately
3. If email addresses were exposed, notify affected users
4. If sheet content was copied/exfiltrated, there's limited remediation for public content

---

## User Communication

### During Investigation
> **[StudyHub Security Notice]** We're investigating a potential security issue. As a precaution, you may be asked to log in again. Your password and personal data remain secure. We'll provide an update within [timeframe].

### After Resolution (No Data Exposure)
> **[StudyHub Security Notice]** We identified and resolved a security issue on [date]. No user data was accessed or compromised. We've taken steps to prevent recurrence. No action is needed from you.

### After Resolution (Data Exposure)
> **[StudyHub Security Notice]** On [date], we identified a security issue that may have exposed [type of data] for [scope of users]. We've resolved the issue and rotated all credentials. As a precaution, we recommend [action for users]. We apologize and are committed to protecting your data.

---

## Post-Incident

1. Write a post-mortem (see [INCIDENT_PLAYBOOK.md](INCIDENT_PLAYBOOK.md))
2. Update security rules if the attack vector was novel
3. Add regression tests for the vulnerability
4. Review and tighten rate limits if brute-force was involved
5. Update this runbook with any missing steps you discovered
