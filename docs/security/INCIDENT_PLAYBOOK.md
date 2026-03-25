# StudyHub Incident Playbook

> **Audience:** anyone with production access (you, future co-maintainers, on-call).
> **Last updated:** 2026-03-24

This is the front-door document. When something breaks, start here, assess severity, then follow the linked runbook.

---

## Severity Levels

| Level | Description | Examples | Target Response |
|-------|-------------|----------|-----------------|
| **SEV0** | Active breach or data exposure | JWT secret leaked, DB credentials exposed, account takeover reports, malicious sheet executing in production | **Immediate** — drop everything |
| **SEV1** | App down or login broken | Railway backend 502, DB unreachable, auth flow returns 500, all uploads failing | **< 15 min** to acknowledge |
| **SEV2** | Partial outage or degraded | Search broken, email delivery failing, ClamAV scanner down, one API route 500ing | **< 1 hour** to acknowledge |
| **SEV3** | Minor bug, cosmetic issue | UI glitch, wrong error message, non-critical lint warning in logs | Next working session |

---

## First 5 Minutes Checklist

When you get an alert or a user report, walk through these steps in order:

### 1. Confirm Scope
- **What is affected?** One user? All users? One feature? The whole app?
- **When did it start?** Check Sentry timeline, Railway deploy history, recent git pushes.
- **Is it still happening?** Hit the health check: `curl https://<backend-domain>/health`

### 2. Stop the Bleeding
Pick the least-destructive containment action that matches the scope:

| Scope | Action |
|-------|--------|
| Malicious HTML sheet live | Set `STUDYHUB_HTML_UPLOADS=disabled` in Railway env vars → instant kill switch |
| Suspicious admin actions | Rotate `JWT_SECRET` → all sessions invalidated → see [Secrets Rotation](RUNBOOK_SECRETS_ROTATION.md) |
| Uploads serving malware | Enable Guarded Mode: set `GUARDED_MODE=true` → blocks all non-admin writes (503) |
| Single broken route | Identify the route, check Sentry for the error, deploy a hotfix |
| Full app down | Follow [Outage Runbook](RUNBOOK_OUTAGE.md) |
| Suspected breach | Follow [Security Runbook](RUNBOOK_SECURITY.md) |

### 3. Preserve Evidence
Before fixing anything:
- Screenshot the Sentry error or dashboard
- Note the timestamp (UTC) and affected request IDs
- If Railway, note the deployment ID
- If security: **do not delete logs, do not redeploy yet** — you need the evidence

### 4. Communicate
Post a short status update. Template:

> **[StudyHub Status]** We're aware of [brief description]. We're investigating and will update within [timeframe]. No action needed from you right now.

Where to post: Discord admin channel, support email auto-reply if needed.

### 5. Start Recovery
Follow the appropriate runbook:

| Situation | Runbook |
|-----------|---------|
| App down / Railway issue | [RUNBOOK_OUTAGE.md](RUNBOOK_OUTAGE.md) |
| Suspected breach / data exposure | [RUNBOOK_SECURITY.md](RUNBOOK_SECURITY.md) |
| Need to rotate secrets | [RUNBOOK_SECRETS_ROTATION.md](RUNBOOK_SECRETS_ROTATION.md) |
| Need to restore database | [RUNBOOK_DB_RESTORE.md](RUNBOOK_DB_RESTORE.md) |

---

## Kill Switches (Quick Reference)

These environment variables act as immediate circuit breakers. Set them in the Railway dashboard under your backend service's Variables tab.

| Variable | Value | Effect |
|----------|-------|--------|
| `GUARDED_MODE` | `true` | Blocks ALL non-admin write operations (503 response). Read-only mode. |
| `STUDYHUB_HTML_UPLOADS` | `disabled` | Blocks all HTML sheet uploads and disables HTML preview endpoints. |
| `CLAMAV_DISABLED` | `true` | Disables malware scanning. Use only if ClamAV is causing failures — leaves a security gap. |

**To activate:** Railway Dashboard → Backend Service → Variables → Add/Edit → Save → Auto-redeploy triggers.

**To deactivate:** Remove the variable or set to empty string → Save.

---

## Post-Incident

After the incident is resolved:

1. **Verify recovery** — confirm health check, test affected feature, check Sentry for new errors
2. **Update status** — post resolution message:
   > **[StudyHub Status]** The issue with [description] has been resolved as of [time UTC]. All services are operating normally. We apologize for the disruption.
3. **Write a brief post-mortem** (even just 5 bullet points):
   - What happened
   - When it started / when it was detected / when it was resolved
   - Root cause
   - What we did to fix it
   - What we'll do to prevent recurrence
4. **File follow-up tasks** — if the runbook had missing steps, update it now while it's fresh

---

## Related Documents

- [Outage Runbook](RUNBOOK_OUTAGE.md)
- [Security Runbook](RUNBOOK_SECURITY.md)
- [Secrets Rotation Runbook](RUNBOOK_SECRETS_ROTATION.md)
- [DB Restore Runbook](RUNBOOK_DB_RESTORE.md)
- [Contacts](CONTACTS.md)
- [Security Overview](security-overview.md)
- [HTML Moderation Playbook](html-moderation-playbook.md)
