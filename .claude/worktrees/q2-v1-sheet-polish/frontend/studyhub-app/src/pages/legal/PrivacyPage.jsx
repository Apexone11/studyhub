import LegalPageLayout, { LegalSection } from '../../components/LegalPageLayout'
import { IconShield } from '../../components/Icons'
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '../../config'

function PrivacyPage() {
  return (
    <LegalPageLayout
      tone="green"
      title="Privacy Policy"
      updated="Effective Date: March 2026"
      summary="How StudyHub collects, uses, and protects your data."
      intro="StudyHub is built by students who care about privacy. We collect only what we need to run the platform, and we do not sell your data."
      icon={<IconShield size={26} />}
    >
      <LegalSection title="1. What We Collect">
        <ul className="legal-list">
          <li><strong>Account info</strong> — username, email, school, and courses.</li>
          <li><strong>Content you submit</strong> — sheets, comments, and notes.</li>
          <li><strong>Usage analytics</strong> — basic performance and feature usage data.</li>
        </ul>
      </LegalSection>

      <LegalSection title="2. How We Use Data">
        <ul className="legal-list">
          <li>Provide and improve StudyHub services.</li>
          <li>Secure the platform against abuse.</li>
          <li>Admin review and moderation.</li>
          <li>Personalize your dashboard and course content.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Data Sharing">
        <p>We do not sell personal data. Data may be shared only for:</p>
        <ul className="legal-list">
          <li>Security enforcement.</li>
          <li>Legal compliance.</li>
          <li>Service hosting providers (under contract).</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. What Is Public">
        <p>The following information is visible to other StudyHub users:</p>
        <ul className="legal-list">
          <li>Your username.</li>
          <li>Study sheets and content you publish.</li>
          <li>Your contribution history.</li>
          <li>Your profile picture, if you choose to set one.</li>
        </ul>
        <p>Your personal notes are <strong>private by default</strong> and only visible to you unless you choose to share them.</p>
      </LegalSection>

      <LegalSection title="5. Security">
        <p>We apply technical and organizational safeguards to protect data:</p>
        <ul className="legal-list">
          <li>Passwords are hashed with bcrypt and never stored in plain text.</li>
          <li>Sessions use secure JWT tokens with CSRF protection.</li>
          <li>Uploaded HTML files run in sandboxed environments.</li>
          <li>Rate limiting protects against brute-force attacks.</li>
          <li>All connections use HTTPS in production.</li>
          <li>30-minute idle session timeout.</li>
        </ul>
      </LegalSection>

      <LegalSection title="6. Data Retention">
        <p>
          Your data is kept as long as your account is active. You can request deletion of your account and its associated data at any
          time by emailing <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a> from the address linked to your account,
          or from <strong>Settings &rarr; Account</strong>.
        </p>
      </LegalSection>

      <LegalSection title="7. Your Rights">
        <ul className="legal-list">
          <li>Request a copy of all data we hold about you.</li>
          <li>Request correction of inaccurate data.</li>
          <li>Request deletion of your account and all associated data.</li>
          <li>Opt out of public display of your contributions where possible.</li>
        </ul>
      </LegalSection>

      <LegalSection title="8. Changes to This Policy">
        <p>
          Significant changes will be announced through the platform&apos;s announcement system. Continued use after changes constitutes acceptance.
        </p>
      </LegalSection>

      <LegalSection title="9. Contact">
        <p>
          Privacy questions: <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a>.
        </p>
      </LegalSection>
    </LegalPageLayout>
  )
}

export default PrivacyPage
