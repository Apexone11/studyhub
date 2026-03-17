import LegalPageLayout, { LegalSection } from '../../components/LegalPageLayout'
import { IconInfoCircle } from '../../components/Icons'
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '../../config'

function TermsPage() {
  return (
    <LegalPageLayout
      tone="blue"
      title="Terms of Use"
      updated="Last updated: March 2026"
      summary="The rules for using StudyHub responsibly, contributing content, and understanding how the platform is provided."
      intro="StudyHub is a student-built, open-source platform. By using it, you agree to these terms. If you disagree, please do not use the platform."
      icon={<IconInfoCircle size={26} />}
    >
      <LegalSection title="1. Who Can Use StudyHub">
        <p>
          StudyHub is open to any student, educator, or learner. You must be at least 13 years old to create an account.
          By registering, you confirm that you meet this requirement.
        </p>
      </LegalSection>

      <LegalSection title="2. Your Account">
        <p>
          You are responsible for keeping your username and password secure. Do not share your credentials. You are
          responsible for all activity that happens under your account. If you believe your account has been compromised,
          contact an administrator immediately at{' '}
          <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a>.
        </p>
      </LegalSection>

      <LegalSection title="3. Content You Upload">
        <p>When you upload study sheets, practice tests, notes, or any other content to StudyHub, you agree that:</p>
        <ul className="legal-list">
          <li>The content is your own original work or is properly attributed.</li>
          <li>You are not violating any copyright or intellectual property rights.</li>
          <li>You are not uploading content from textbooks, commercial sources, or publishers without explicit permission.</li>
          <li>You grant StudyHub a non-exclusive license to display your content to other users on the platform.</li>
          <li>You can request removal of your content at any time.</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Prohibited Content">
        <p>You may not upload or post content that:</p>
        <ul className="legal-list">
          <li>Contains malicious code, scripts, or anything designed to harm users.</li>
          <li>Harasses, bullies, or targets other users.</li>
          <li>Is sexually explicit or otherwise inappropriate.</li>
          <li>Promotes violence, discrimination, or hate.</li>
          <li>Violates any applicable law.</li>
          <li>Is designed to cheat or deceive other students academically.</li>
        </ul>
        <p>Violations can result in content removal and account suspension.</p>
      </LegalSection>

      <LegalSection title="5. HTML File Safety">
        <p>StudyHub allows users to upload HTML files for study sheets and practice tests. All uploaded HTML files are:</p>
        <ul className="legal-list">
          <li>Run inside a sandboxed environment that cannot access your account data.</li>
          <li>Scanned for malicious code before being made public.</li>
          <li>Subject to removal if found to contain harmful scripts.</li>
        </ul>
        <p>Never upload HTML files designed to steal data, redirect users, or perform any action outside the study content itself.</p>
      </LegalSection>

      <LegalSection title="6. Downloads">
        <p>
          StudyHub allows users to download study materials for personal offline use. Downloaded content remains subject to the
          original contributor&apos;s rights. You may not redistribute downloaded content as your own work.
        </p>
      </LegalSection>

      <LegalSection title="7. Open Source">
        <p>
          StudyHub&apos;s codebase is open source under the MIT License. You are free to inspect, fork, and contribute to the code on
          GitHub. The MIT License applies to the code only, not to user-submitted content.
        </p>
      </LegalSection>

      <LegalSection title="8. No Warranty">
        <p>
          StudyHub is provided as-is by student developers. We make no guarantees about uptime, accuracy of content, or fitness for
          any particular purpose. Study materials are user-generated and have not been verified by educators.
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
          For questions about these terms, email{' '}
          <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a>.
        </p>
      </LegalSection>
    </LegalPageLayout>
  )
}

export default TermsPage
