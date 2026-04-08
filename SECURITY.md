# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 2.0.x   | Yes       |
| < 2.0   | No        |

## Reporting a Vulnerability

We take security seriously at StudyHub. If you discover a security vulnerability, please report it responsibly.

### How to Report

1. **Email**: Send details to <abdulrfornah@getstudyhub.org>
2. **Include**: Description, steps to reproduce, impact assessment, and any proof of concept
3. **Do NOT** open a public issue for security vulnerabilities

### What to Expect

- **Acknowledgment**: Within 48 hours
- **Initial Assessment**: Within 5 business days
- **Resolution Timeline**: Based on severity
  - Critical: 24-48 hours
  - High: 1 week
  - Medium: 2 weeks
  - Low: Next release cycle

### Scope

In scope:

- Authentication and authorization bypasses
- Cross-site scripting (XSS)
- Cross-site request forgery (CSRF)
- SQL injection and Prisma query injection
- Remote code execution
- Server-side request forgery (SSRF)
- Information disclosure and privacy leaks
- Privilege escalation
- File upload abuse (malicious file execution, path traversal)
- WebAuthn credential theft or replay
- OAuth token leakage

Out of scope:

- Rate limiting on public pages
- Denial of Service attacks
- Social engineering
- Physical security
- Self-XSS (requires user to paste code in their own console)

## Security Architecture

### Authentication

- Passwords hashed with bcrypt (cost factor 12)
- Session tokens issued as JWT in httpOnly, Secure, SameSite cookies
- Short token expiry with credential refresh
- Google OAuth via verified ID tokens
- WebAuthn passkey support for passwordless login
- Account lockout after repeated failed login attempts
- Email verification with time-limited codes and attempt tracking

### Authorization

- Role-based access control (student, admin)
- Owner-or-admin checks on all mutation endpoints
- Profile visibility enforcement (public, classmates-only, private)
- Sheet status gates (draft, published, pending_review, quarantined)

### Input Validation

- Content Security Policy headers via Helmet
- File upload validation with MIME type checking and magic byte verification
- Separate upload directories for avatars, covers, and attachments with path traversal protection
- Request body validation on all endpoints
- Rate limiting on authentication, upload, and write endpoints

### Content Security

- HTML study sheet risk classification (Tier 0-3)
- AI-powered content moderation with category detection
- ClamAV integration for malware scanning
- Admin review pipeline for high-risk content
- Strike/appeal system for policy violations
- User restriction engine (temporary and permanent)

### Data Protection

- Prisma ORM with parameterized queries (no raw SQL injection surface)
- Cascade deletes for user data removal
- Email suppression handling for bounces and complaints
- Sentry error monitoring with PII scrubbing
- No third-party ad networks or data brokers

## Responsible Disclosure

We appreciate the security research community. Researchers who report valid vulnerabilities will be acknowledged (with permission) in our release notes.
