import LegalPageLayout, { LegalSection } from '../../components/LegalPageLayout'
import { IconInfoCircle } from '../../components/Icons'
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '../../config'

function TermsPage() {
  return (
    <LegalPageLayout
      tone="blue"
      title="Terms of Use"
      updated="Effective Date: March 2026"
      summary="By using StudyHub, you agree to these Terms. If you disagree, please do not use the platform."
      intro="StudyHub provides student-generated study materials, tools, and collaboration features. These terms govern your use of the platform."
      icon={<IconInfoCircle size={26} />}
    >
      <LegalSection title="1. Who Can Use StudyHub">
        <p>
          StudyHub is open to any student, educator, or learner. You must be at least 13 years old to create an account.
          By registering, you confirm that you meet this requirement.
        </p>
        <p>Jurisdiction: Maryland, USA.</p>
      </LegalSection>

      <LegalSection title="2. Accounts">
        <p>
          You must provide accurate account information. You are responsible for all activity on your account.
          If you believe your account has been compromised, contact an administrator immediately at{' '}
          <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a>.
        </p>
      </LegalSection>

      <LegalSection title="3. Email Verification">
        <p>
          Verification protects StudyHub from abuse and ensures a safe environment.
          StudyHub requires a verified email address to use write features such as uploading sheets, posting comments,
          creating notes, forking sheets, and proposing contributions.
        </p>
        <ul className="legal-list">
          <li>New accounts receive a <strong>3-day grace period</strong> during which all features are available without verification.</li>
          <li>After the grace period, unverified accounts are limited to read-only access (browsing, viewing, and searching).</li>
          <li>You can verify your email at any time from <strong>Settings &rarr; Account</strong> by requesting a verification code and entering the 6-digit code sent to your email.</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Acceptable Use">
        <p>You agree not to:</p>
        <ul className="legal-list">
          <li>Upload malicious, harmful, or deceptive content.</li>
          <li>Attempt to bypass platform safeguards.</li>
          <li>Interfere with other users or the service.</li>
        </ul>
      </LegalSection>

      <LegalSection title="5. User Content">
        <p>
          You retain ownership of content you upload. You grant StudyHub a license to host and display it within the platform.
          You are responsible for the content you submit.
        </p>
        <ul className="legal-list">
          <li>The content must be your own original work or properly attributed.</li>
          <li>You must not violate any copyright or intellectual property rights.</li>
          <li>You can request removal of your content at any time.</li>
        </ul>
      </LegalSection>

      <LegalSection title="6. HTML File Safety">
        <p>StudyHub allows users to upload HTML files for study sheets and practice tests. All uploaded HTML files are:</p>
        <ul className="legal-list">
          <li>Run inside a sandboxed environment that cannot access your account data.</li>
          <li>Scanned for malicious code before being made public.</li>
          <li>Subject to removal if found to contain harmful scripts.</li>
        </ul>
        <p>Never upload HTML files designed to steal data, redirect users, or perform any action outside the study content itself.</p>
      </LegalSection>

      <LegalSection title="7. Suspension &amp; Removal">
        <p>
          We may suspend or remove accounts or content that violate these terms or pose a security risk.
          Appeals can be made by emailing <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a>.
        </p>
      </LegalSection>

      <LegalSection title="8. Disclaimers">
        <p>
          StudyHub is provided &quot;as-is&quot; without warranties. We do not guarantee uninterrupted access.
          Study materials are user-generated and have not been verified by educators.
        </p>
      </LegalSection>

      <LegalSection title="9. Changes to These Terms">
        <p>
          These terms may be updated as the platform grows. Significant changes will be announced through the platform&apos;s
          announcement system. Continued use after changes constitutes acceptance.
        </p>
      </LegalSection>

      <LegalSection title="10. Contact">
        <p>
          Questions about these terms: <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a>.
        </p>
      </LegalSection>
    </LegalPageLayout>
  )
}

export default TermsPage
