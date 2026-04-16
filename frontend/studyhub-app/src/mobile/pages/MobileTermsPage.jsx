// src/mobile/pages/MobileTermsPage.jsx
// Native in-app Terms of Service page for the Capacitor mobile app.

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

export default function MobileTermsPage() {
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
      <MobileTopBar title="Terms of Service" showBack />

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
          <h2 style={headingStyle}>1. Acceptance of Terms</h2>
          <p style={paragraphStyle}>
            By creating an account or using StudyHub, you agree to be bound by these Terms of
            Service. If you do not agree to these terms, please do not use the platform. We may
            update these terms from time to time, and continued use constitutes acceptance of any
            changes.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>2. Eligibility</h2>
          <p style={paragraphStyle}>
            StudyHub is designed for college and university students. You must be at least 16 years
            old to create an account. By registering, you represent that you meet this age
            requirement and that the information you provide is accurate.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>3. User Accounts</h2>
          <p style={paragraphStyle}>
            You are responsible for maintaining the confidentiality of your account credentials and
            for all activity that occurs under your account. You agree to notify us immediately of
            any unauthorized access. StudyHub reserves the right to suspend or terminate accounts
            that violate these terms.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>4. User Content</h2>
          <h3 style={subheadingStyle}>Ownership</h3>
          <p style={paragraphStyle}>
            You retain ownership of study materials, notes, and other content you upload to
            StudyHub. By sharing content on the platform, you grant StudyHub a non-exclusive,
            royalty-free license to host, display, and distribute that content to other users in
            accordance with your sharing settings.
          </p>
          <h3 style={subheadingStyle}>Prohibited Content</h3>
          <p style={paragraphStyle}>You agree not to upload or share content that:</p>
          <ul style={listStyle}>
            <li>Infringes on the intellectual property rights of others</li>
            <li>Contains malicious code, scripts, or harmful material</li>
            <li>Violates your institution's academic integrity policies</li>
            <li>Is harassing, threatening, or discriminatory</li>
            <li>Constitutes spam or unsolicited advertising</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>5. Academic Integrity</h2>
          <p style={paragraphStyle}>
            StudyHub is a platform for collaborative learning. You are responsible for ensuring that
            your use of shared materials complies with your institution's academic honesty policies.
            StudyHub does not condone plagiarism or cheating and may remove content or suspend
            accounts involved in academic dishonesty.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>6. Subscriptions and Payments</h2>
          <p style={paragraphStyle}>
            Certain features may require a paid subscription. Subscription fees are billed in
            advance on a monthly or yearly basis. You may cancel at any time through your account
            settings. Refunds are handled in accordance with applicable law and the terms displayed
            at the time of purchase.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>7. Termination</h2>
          <p style={paragraphStyle}>
            We reserve the right to suspend or terminate your access to StudyHub at our discretion
            if you violate these terms. You may delete your account at any time through your account
            settings. Upon termination, your right to use the platform ceases immediately.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>8. Disclaimers</h2>
          <p style={paragraphStyle}>
            StudyHub is provided on an "as is" and "as available" basis. We make no warranties
            regarding the accuracy, completeness, or reliability of any content shared by users.
            StudyHub is not responsible for academic outcomes resulting from the use of materials
            found on the platform.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>9. Limitation of Liability</h2>
          <p style={paragraphStyle}>
            To the fullest extent permitted by law, StudyHub and its operators shall not be liable
            for any indirect, incidental, or consequential damages arising from your use of the
            platform, including but not limited to loss of data, academic penalties, or
            interruptions in service.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={headingStyle}>10. Contact</h2>
          <p style={paragraphStyle}>
            If you have questions about these Terms of Service, please reach out to us through the
            support channel in the app or by email at support@studyhub.app.
          </p>
        </div>
      </div>
    </div>
  )
}
