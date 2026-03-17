import LegalPageLayout, { LegalSection } from '../../components/LegalPageLayout'
import { IconShield } from '../../components/Icons'
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '../../config'

function PrivacyPage() {
  return (
    <LegalPageLayout
      tone="green"
      title="Privacy Policy"
      updated="Last updated: March 2026"
      summary="How StudyHub collects, stores, and protects account data while keeping the platform useful and lightweight."
      intro="StudyHub is built by students who care about privacy. We collect only what we need to run the platform well, and we do not sell your data."
      icon={<IconShield size={26} />}
    >
      <LegalSection title="1. What We Collect">
        <p>When you create an account, we collect:</p>
        <ul className="legal-list">
          <li><strong>Username</strong> - your chosen display name.</li>
          <li><strong>Password</strong> - stored as a secure hash, never as plain text.</li>
          <li><strong>Email address (optional)</strong> - if you add one in Settings, used only for password reset. Never shared or used for marketing.</li>
          <li><strong>School and course selections</strong> - used to personalize your dashboard.</li>
          <li><strong>Content you upload</strong> - study sheets, notes, and practice tests.</li>
          <li><strong>Activity data</strong> - things like viewed content and test scores.</li>
        </ul>
        <p>We do <strong>not</strong> collect your phone number, real name, or payment information. Email is optional and used exclusively for account recovery.</p>
      </LegalSection>

      <LegalSection title="1a. Password Reset Emails">
        <p>If you add an email address to your account and request a password reset, we will send a single transactional email containing a secure reset link. This email is sent only on your explicit request, expires within 1 hour, and is never used for any other purpose.</p>
      </LegalSection>

      <LegalSection title="2. How We Use Your Data">
        <ul className="legal-list">
          <li>To display your dashboard and personalized course content.</li>
          <li>To save your notes, test attempts, and contributions.</li>
          <li>To show your public profile and contributions to other users.</li>
          <li>To improve the platform based on usage patterns.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. What Is Public">
        <p>The following information is visible to other StudyHub users:</p>
        <ul className="legal-list">
          <li>Your username.</li>
          <li>Study sheets and content you publish.</li>
          <li>Your contribution history.</li>
          <li>Your profile picture, if you choose to set one.</li>
        </ul>
        <p>Your personal notes are <strong>private by default</strong> and only visible to you unless you choose to share them.</p>
      </LegalSection>

      <LegalSection title="4. Data Security">
        <ul className="legal-list">
          <li>Passwords are hashed with bcrypt and never stored in plain text.</li>
          <li>Sessions use secure JWT tokens for authentication.</li>
          <li>Uploaded HTML files run in sandboxed environments.</li>
          <li>Rate limiting helps protect against brute-force attacks.</li>
          <li>All connections use HTTPS in production.</li>
        </ul>
      </LegalSection>

      <LegalSection title="5. Data Retention">
        <p>
          Your data is kept as long as your account is active. You can request deletion of your account and its associated data at any
          time by emailing{' '}
          <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a>
          {' '}from the address linked to your account.
        </p>
      </LegalSection>

      <LegalSection title="6. Third Parties">
        <p>
          StudyHub does not sell, rent, or share your personal data with third parties for advertising or marketing purposes. The only
          third-party service currently used is the Anthropic API for the AI assistant feature. Questions sent there are processed to
          generate responses and are not tied to public profile information.
        </p>
      </LegalSection>

      <LegalSection title="7. Your Rights">
        <ul className="legal-list">
          <li>Request a copy of all data we hold about you.</li>
          <li>Request correction of inaccurate data.</li>
          <li>Request deletion of your account and all associated data.</li>
          <li>Opt out of public display of your contributions where possible.</li>
        </ul>
        <p>
          To exercise these rights, email{' '}
          <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a>.
        </p>
      </LegalSection>

      <LegalSection title="8. Changes to This Policy">
        <p>
          We will announce significant changes to this policy through the platform&apos;s announcement system. Your continued use of
          StudyHub after changes constitutes acceptance.
        </p>
      </LegalSection>
    </LegalPageLayout>
  )
}

export default PrivacyPage
