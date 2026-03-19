# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.5.x   | :white_check_mark: |
| < 1.5   | :x:                |

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
- SQL injection
- Remote code execution
- Server-side request forgery (SSRF)
- Information disclosure
- Privilege escalation

Out of scope:

- Rate limiting on public pages
- Denial of Service attacks
- Social engineering
- Physical security

## Security Measures

- All passwords hashed with bcrypt (cost factor 12)
- JWT tokens with short expiry and httpOnly cookies
- CSRF protection on all state-changing endpoints
- Content Security Policy headers via Helmet
- Input sanitization with sanitize-html
- File upload validation (MIME + magic byte verification)
- Rate limiting on authentication endpoints
- Content moderation via AI scanning
- WebAuthn passkey support for admin accounts

## Responsible Disclosure

We appreciate the security research community. Researchers who report valid vulnerabilities will be acknowledged (with permission) in our release notes.
