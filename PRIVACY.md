# StudyHub Privacy Policy

_Last updated: 2026-04-30_

This document describes what data StudyHub collects, why we collect it, who we share it with, and what controls you have. It is written in plain language; the precise legal contract is the Terms of Service.

If something here is unclear or you have a question we don't answer, email **support@getstudyhub.org**.

## What we collect

We collect only what's needed to run the product:

- **Account information** — email, username, password hash (never the password itself), school/role you select, profile fields you fill in (name, bio, avatar, course list).
- **Content you create** — study sheets, comments, notes, messages, group posts, contributions. You publish this knowing it is visible to the audience you choose (public, school-scoped, group-only, or private).
- **Activity logs** — pages visited, features used, search queries, error reports. Used to debug issues, prevent abuse, and prioritize features.
- **Device and connection metadata** — IP address, user agent, approximate location derived from IP. Used for security (anomaly detection, session integrity) and rate limiting.
- **Payment metadata** (only if you subscribe) — Stripe customer ID, subscription status, last 4 digits and brand of your card. **We never see or store your full card number.**
- **Optional analytics** — if you don't opt out, we collect aggregate engagement signals (page views, click events, session duration) via PostHog. These are not sold or shared.

## What we do NOT collect

- We do not read the contents of your direct messages on behalf of advertisers.
- We do not sell personal data to third parties.
- We do not use your study material to train external AI models without your consent. (StudyHub's own moderation and abuse-detection pipelines run on your content; that processing stays inside StudyHub.)

## Where your data goes

We use a small number of vetted processors. Each has a data-processing agreement with us.

| Processor                                 | Purpose                                              | Data shared                                                                                                  |
| ----------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Railway**                               | Application hosting (backend)                        | All application data                                                                                         |
| **PostgreSQL** (managed by Railway)       | Primary data store                                   | All application data                                                                                         |
| **Anthropic**                             | Hub AI assistant                                     | Only the prompts and attachments you submit to Hub AI, with PII (emails, phone numbers) stripped before send |
| **Stripe**                                | Subscription billing                                 | Email, customer ID, subscription metadata. Card details go directly to Stripe — they never touch our servers |
| **Resend** (or successor SMTP provider)   | Transactional email                                  | Email address, message body for system emails (verification, password reset, notifications you opt in to)    |
| **Sentry**                                | Error monitoring                                     | Stack traces, user ID, URL of the error. PII in logs is scrubbed                                             |
| **PostHog** (optional, opt-out available) | Product analytics                                    | Hashed user ID, page views, click events                                                                     |
| **Cloudflare R2**                         | Media storage (uploaded sheets, attachments, videos) | The files you upload                                                                                         |
| **Google**                                | Sign in with Google (only if you choose this option) | Email, name, profile picture                                                                                 |

## How long we keep it

- **Account data**: until you delete your account. After deletion, account record + content is purged within 30 days; backups are rotated out within 90 days.
- **Server logs**: 30 days for active diagnostic logs; aggregated metrics retained longer.
- **Sentry / error reports**: 90 days, then automatically deleted.
- **Stripe payment records**: retained per Stripe's policies (typically 7 years for tax/audit).

## Your rights

You can do all of this yourself in **Settings → Privacy**:

- **Export** your data as JSON.
- **Delete** your account and all associated content.
- **Disable analytics** (PostHog opt-out).
- **Revoke creator-responsibility consent** (blocks new publishing until re-accepted; existing content is not deleted).
- **Manage your sessions** — view active sessions on other devices and revoke them.

If you live in a jurisdiction that grants additional rights (GDPR, CCPA, FERPA, PIPEDA, LGPD), email **privacy@getstudyhub.org** with your request and we will honor it within 30 days.

## Children

StudyHub is not directed to children under 13. We do not knowingly collect personal information from children under 13. If we learn that we have, we will delete it. School-affiliated accounts that involve minors must be created and managed under FERPA-compliant institutional agreements; reach out before signing up minors.

## Security

We follow industry-standard practices:

- Passwords are hashed with bcrypt (cost factor 12).
- Sessions use HTTP-only, Secure, SameSite cookies in production. (Local development relaxes the Secure flag and uses SameSite=Lax so localhost works without TLS.)
- All connections use TLS in production.
- Sensitive fields (PII vault) are encrypted at rest with a rotated field-encryption key.
- Antivirus scanning runs on every uploaded attachment in production.
- Strict Content Security Policy + standard hardening headers (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy).

Despite our best efforts, no system is perfectly secure. If you find a vulnerability, please follow the responsible-disclosure process in [SECURITY.md](SECURITY.md). We do not file legal action against good-faith security researchers who follow that process.

## Changes to this policy

When we make a material change we will notify you by email and surface a banner in the app. The "Last updated" date at the top of this document always reflects the current revision.

## Contact

- General questions: **support@getstudyhub.org**
- Privacy / data requests: **privacy@getstudyhub.org**
- Security disclosures: see [SECURITY.md](SECURITY.md)
