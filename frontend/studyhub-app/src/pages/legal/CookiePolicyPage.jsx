import LegalPageLayout, { LegalSection } from '../../components/LegalPageLayout'
import { IconShield } from '../../components/Icons'
import { LEGAL_EMAILS } from '../../lib/legalConstants'
import { POLICY_URLS } from '../../lib/legalVersions'

function CookiePolicyPage() {
  return (
    <LegalPageLayout
      tone="green"
      title="Cookie Policy"
      updated="Effective Date: April 2026"
      summary="How StudyHub uses cookies and similar tracking technologies."
      intro="This policy explains how StudyHub uses cookies and similar tracking technologies to recognize you when you visit our platform."
      icon={<IconShield size={26} />}
    >
      <LegalSection title="Cookie Policy">
        <p>
          This policy explains how StudyHub uses cookies and similar tracking technologies.
          For full details, please review the policy below.
        </p>
        <p>
          For cookie-related questions, contact{' '}
          <a href={`mailto:${LEGAL_EMAILS.privacy}`} style={{ color: 'var(--sh-brand)', textDecoration: 'none' }}>{LEGAL_EMAILS.privacy}</a>.
        </p>
        <iframe
          src={POLICY_URLS.cookies}
          style={{ width: '100%', minHeight: 600, border: 'none', borderRadius: 8 }}
          title="Cookie Policy"
        />
      </LegalSection>
    </LegalPageLayout>
  )
}

export default CookiePolicyPage
