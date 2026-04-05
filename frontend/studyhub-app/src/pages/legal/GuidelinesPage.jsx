import LegalPageLayout, { LegalSection } from '../../components/LegalPageLayout'
import { IconUsers } from '../../components/Icons'
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '../../config'
import { LEGAL_EMAILS } from '../../lib/legalConstants'

function GuidelinesPage() {
  return (
    <LegalPageLayout
      tone="amber"
      title="Community Guidelines"
      updated="Effective Date: March 2026"
      summary="The shared standards that keep StudyHub useful, respectful, and safe for students."
      intro="StudyHub is built for students. These guidelines keep the platform welcoming, practical, and trustworthy for everyone."
      icon={<IconUsers size={26} />}
    >
      <LegalSection title="What We Expect">
        <p>You agree to:</p>
        <ul className="legal-list">
          <li>Be respectful and constructive.</li>
          <li>Avoid plagiarism or harmful content.</li>
          <li>Report suspicious content when seen.</li>
          <li>Follow school guidelines and honor codes.</li>
        </ul>
      </LegalSection>

      <LegalSection title="What We Encourage">
        <ul className="legal-list">
          <li>Uploading original study guides and notes for your courses.</li>
          <li>Forking and improving existing study materials.</li>
          <li>Writing clear, well-organized practice test questions.</li>
          <li>Leaving constructive comments on study materials.</li>
          <li>Helping classmates understand difficult concepts.</li>
          <li>Contributing to courses at your school and beyond.</li>
        </ul>
      </LegalSection>

      <LegalSection title="What Is Not Allowed">
        <ul className="legal-list">
          <li>Uploading copyrighted textbook content or publisher materials.</li>
          <li>Posting answers to graded exams or assignments.</li>
          <li>Uploading fake, misleading, or intentionally wrong study content.</li>
          <li>Harassing, bullying, or disrespecting other users.</li>
          <li>Spamming the platform with duplicate or low-quality content.</li>
          <li>Uploading malicious HTML files or files designed to harm users.</li>
          <li>Creating fake accounts or impersonating others.</li>
          <li>Using the platform for anything unrelated to studying and learning.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Content Quality Standards">
        <p>Good study content on StudyHub should:</p>
        <ul className="legal-list">
          <li>Be clearly titled with the course and topic.</li>
          <li>Use your own words rather than copied textbook passages.</li>
          <li>Include examples where possible.</li>
          <li>Be organized with headings and sections.</li>
          <li>Be accurate to the best of your knowledge.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Forking and Attribution">
        <p>When you fork someone else&apos;s study sheet:</p>
        <ul className="legal-list">
          <li>The original author is automatically credited.</li>
          <li>You can improve, expand, or adapt the content freely.</li>
          <li>Do not remove attribution from forked content.</li>
          <li>If you make major improvements, consider contributing them back.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Enforcement">
        <p>Violations may result in content removal or account suspension. Enforcement follows a progressive approach:</p>
        <ul className="legal-list">
          <li><strong>First offense:</strong> content removed and warning issued.</li>
          <li><strong>Second offense:</strong> temporary upload restriction.</li>
          <li><strong>Severe or repeated violations:</strong> account suspension.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Reporting">
        <ul className="legal-list">
          <li>Use the Report button on the relevant study sheet or post.</li>
          <li>Email <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a> with details and a link to the content.</li>
        </ul>
        <p>False or malicious reports are themselves a violation of these guidelines.</p>
        <p>
          To report concerns or appeal moderation decisions, contact{' '}
          <a href={`mailto:${LEGAL_EMAILS.legal}`} style={{ color: 'var(--sh-brand)', textDecoration: 'none' }}>{LEGAL_EMAILS.legal}</a>.
        </p>
      </LegalSection>
    </LegalPageLayout>
  )
}

export default GuidelinesPage
