// src/mobile/pages/MobilePrivacyPage.jsx
// Native in-app Privacy Policy page for the Capacitor mobile app.

import { useEffect, useRef } from 'react'
import anime from '../lib/animeCompat'
import MobileTopBar from '../components/MobileTopBar'

const PREFERS_REDUCED =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const LAST_UPDATED = 'April 16, 2026'

const sectionStyle = {
  marginBottom: 'var(--space-6)',
}

const headingStyle = {
  fontSize: 'var(--type-lg)',
  fontWeight: 600,
  color: 'var(--sh-heading)',
  marginBottom: 'var(--space-4)',
}

const subheadingStyle = {
  fontSize: 'var(--type-base)',
  fontWeight: 600,
  color: 'var(--sh-heading)',
  marginBottom: 'var(--space-2)',
  marginTop: 'var(--space-4)',
}

const paragraphStyle = {
  fontSize: 'var(--type-sm)',
  lineHeight: 1.6,
  color: 'var(--sh-text)',
  marginBottom: 'var(--space-4)',
}

const listStyle = {
  fontSize: 'var(--type-sm)',
  lineHeight: 1.6,
  color: 'var(--sh-text)',
  paddingLeft: 'var(--space-6)',
  marginBottom: 'var(--space-4)',
}

export default function MobilePrivacyPage() {
  const contentRef = useRef(null)

  useEffect(() => {
    if (PREFERS_REDUCED || !contentRef.current) return
    anime({
      targets: contentRef.current,
      opacity: [0, 1],
      translateY: [10, 0],
      duration: 350,
      easing: 'easeOutCubic',
    })
  }, [])

  return (
    <div className="mob-shell">
      <MobileTopBar title="Privacy Policy" showBack />

      <div
        ref={contentRef}
        style={{
          padding: 'var(--space-6)',
          paddingBottom: 'var(--space-8)',
          opacity: PREFERS_REDUCED ? 1 : 0,
        }}
      >
        <p
          style={{ ...paragraphStyle, color: 'var(--sh-subtext)', marginBottom: 'var(--space-6)' }}
        >
          Last updated: {LAST_UPDATED}
        </p>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>1. Information We Collect</h2>
          <h3 style={subheadingStyle}>Account Information</h3>
          <p style={paragraphStyle}>
            When you create an account, we collect your name, email address, university affiliation,
            and profile details you choose to provide. If you sign in with Google, we receive basic
            profile information from your Google account.
          </p>
          <h3 style={subheadingStyle}>Content You Create</h3>
          <p style={paragraphStyle}>
            We store the study sheets, notes, messages, comments, and other content you create or
            upload on the platform. This content is necessary to provide the core StudyHub service.
          </p>
          <h3 style={subheadingStyle}>Usage Data</h3>
          <p style={paragraphStyle}>
            We collect information about how you interact with StudyHub, including pages visited,
            features used, and actions taken. This data helps us improve the platform experience.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>2. How We Use Your Information</h2>
          <p style={paragraphStyle}>We use the information we collect to:</p>
          <ul style={listStyle}>
            <li>Provide, maintain, and improve the StudyHub platform</li>
            <li>Personalize your experience and surface relevant study materials</li>
            <li>Facilitate collaboration between students through messaging and study groups</li>
            <li>Send important account notifications and platform updates</li>
            <li>Process payments for subscription services</li>
            <li>Detect and prevent misuse, fraud, and security threats</li>
            <li>Comply with legal obligations</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>3. Information Sharing</h2>
          <p style={paragraphStyle}>
            We do not sell your personal information. We may share limited information with:
          </p>
          <ul style={listStyle}>
            <li>
              <strong>Other users</strong> -- your profile, shared study materials, and public
              activity are visible based on your privacy settings
            </li>
            <li>
              <strong>Service providers</strong> -- payment processors, hosting providers, and
              analytics services that help us operate the platform
            </li>
            <li>
              <strong>Legal authorities</strong> -- when required by law or to protect the safety of
              our users
            </li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>4. Data Security</h2>
          <p style={paragraphStyle}>
            We implement industry-standard security measures to protect your data, including
            encrypted connections (TLS), secure password hashing, and HTTP-only session cookies.
            However, no method of transmission over the internet is completely secure, and we cannot
            guarantee absolute security.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>5. Data Retention</h2>
          <p style={paragraphStyle}>
            We retain your account data for as long as your account is active. If you delete your
            account, we will remove your personal information within 30 days, except where retention
            is required by law. Some content you shared publicly may remain visible if it was forked
            or referenced by other users.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>6. Your Rights</h2>
          <p style={paragraphStyle}>Depending on your jurisdiction, you may have the right to:</p>
          <ul style={listStyle}>
            <li>Access and download a copy of your personal data</li>
            <li>Correct inaccurate information in your profile</li>
            <li>Request deletion of your account and associated data</li>
            <li>Object to or restrict certain processing of your information</li>
            <li>Withdraw consent where processing is based on consent</li>
          </ul>
          <p style={paragraphStyle}>
            You can exercise most of these rights through your account settings. For additional
            requests, contact our support team.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>7. Cookies and Local Storage</h2>
          <p style={paragraphStyle}>
            StudyHub uses HTTP-only session cookies for authentication. We also use local storage to
            save your preferences and cache data for a faster experience. Third-party analytics
            services may set additional cookies as described in their own privacy policies.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>8. Children's Privacy</h2>
          <p style={paragraphStyle}>
            StudyHub is intended for users aged 16 and older. We do not knowingly collect personal
            information from children under 16. If we discover such data, we will delete it
            promptly.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>9. Changes and Contact</h2>
          <p style={paragraphStyle}>
            We may update this Privacy Policy from time to time. Significant changes will be
            communicated through the app or by email. Continued use after changes constitutes
            acceptance. If you have questions, contact us at support@studyhub.app.
          </p>
        </div>
      </div>
    </div>
  )
}
