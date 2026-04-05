import LegalPageLayout, { LegalSection } from '../../components/LegalPageLayout'
import { IconInfoCircle } from '../../components/Icons'
import { LEGAL_EMAILS } from '../../lib/legalConstants'
import { POLICY_URLS } from '../../lib/legalVersions'

function DisclaimerPage() {
  return (
    <LegalPageLayout
      tone="amber"
      title="Disclaimer"
      updated="Effective Date: April 2026"
      summary="Limitations of liability for StudyHub and its content."
      intro="This disclaimer outlines the limitations of liability for StudyHub and its content. StudyHub provides study materials created by students and does not guarantee their accuracy."
      icon={<IconInfoCircle size={26} />}
    >
      <LegalSection title="Disclaimer">
        <p>
          This disclaimer outlines the limitations of liability for StudyHub and its content.
          For full details, please review the disclaimer below.
        </p>
        <p>
          For legal inquiries, contact{' '}
          <a href={`mailto:${LEGAL_EMAILS.legal}`} style={{ color: 'var(--sh-brand)', textDecoration: 'none' }}>{LEGAL_EMAILS.legal}</a>.
        </p>
        <iframe
          src={POLICY_URLS.disclaimer}
          style={{ width: '100%', minHeight: 600, border: 'none', borderRadius: 8 }}
          title="Disclaimer"
        />
      </LegalSection>
    </LegalPageLayout>
  )
}

export default DisclaimerPage
