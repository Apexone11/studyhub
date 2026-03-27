# Contacts & Resources

> **When to use:** Quick reference during an incident for links, support channels, and escalation.
> **Last updated:** 2026-03-24

---

## Internal

| Role | Contact | Notes |
|------|---------|-------|
| Project Owner / Admin | You (Abdul) | Sole maintainer — all approval authority |
| Support Email | (configure in `VITE_SUPPORT_EMAIL`) | User-facing contact |

---

## Service Dashboards

| Service | Link | What to Check |
|---------|------|---------------|
| Railway Dashboard | [railway.app/dashboard](https://railway.app/dashboard) | Deploy status, logs, metrics, env vars |
| Railway Status Page | [status.railway.app](https://status.railway.app) | Platform-wide incidents |
| Sentry (Backend) | Project URL in `SENTRY_DSN` → open Sentry dashboard | Error spikes, stack traces, breadcrumbs |
| Sentry (Frontend) | Project URL in `VITE_SENTRY_DSN` | Client-side errors, user impact |
| PostHog | Configured via `VITE_POSTHOG_KEY` | User analytics, feature adoption |
| Google Cloud Console | [console.cloud.google.com](https://console.cloud.google.com) | OAuth credentials, API quotas |
| Resend Dashboard | [resend.com/overview](https://resend.com/overview) | Email delivery status, API keys, webhooks |
| OpenAI Dashboard | [platform.openai.com](https://platform.openai.com) | Moderation API usage, API keys |

---

## Vendor Support

| Vendor | Support Channel | SLA / Notes |
|--------|----------------|-------------|
| Railway | [help.railway.app](https://help.railway.app) / Discord | Community + paid support depending on plan |
| Resend | [resend.com/support](https://resend.com/support) | Email delivery issues |
| Google Cloud | [cloud.google.com/support](https://cloud.google.com/support) | OAuth / API issues |
| OpenAI | [help.openai.com](https://help.openai.com) | Moderation API issues |
| Sentry | [sentry.io/support](https://sentry.io/support) | Error tracking issues |

---

## Approval Authority

Since StudyHub is currently a solo project:

| Action | Who Can Approve |
|--------|----------------|
| Rotate `JWT_SECRET` (logs out all users) | You |
| Enable Guarded Mode (read-only) | You |
| Disable HTML uploads (kill switch) | You |
| Restore database from backup | You |
| Delete user accounts | You |
| Publish security notice to users | You |
| Deploy to production | You |

As the team grows, update this table with role-based approvals.

---

## Quick Copy-Paste: Status Message Templates

### Investigating
```
[StudyHub Status] We're aware of an issue affecting [description].
We're investigating and will update within [timeframe].
```

### Mitigating
```
[StudyHub Status] We've identified the cause of [description] and are
working on a fix. Some features may be temporarily unavailable.
```

### Resolved
```
[StudyHub Status] The issue with [description] has been resolved as of
[time UTC]. All services are operating normally. We apologize for
the disruption.
```

### Security Notice
```
[StudyHub Security Notice] We identified and resolved a security issue
on [date]. [Details about impact]. We've taken steps to prevent
recurrence. [Any required user action].
```

---

## Related Runbooks

- [Incident Playbook](INCIDENT_PLAYBOOK.md) — start here during any incident
- [Outage Runbook](RUNBOOK_OUTAGE.md) — Railway / availability issues
- [Security Runbook](RUNBOOK_SECURITY.md) — suspected breach
- [Secrets Rotation](RUNBOOK_SECRETS_ROTATION.md) — credential rotation
- [DB Restore](RUNBOOK_DB_RESTORE.md) — database backup and recovery
