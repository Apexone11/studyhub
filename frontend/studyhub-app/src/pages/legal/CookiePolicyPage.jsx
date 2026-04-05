import LegalPageLayout, { LegalSection } from '../../components/LegalPageLayout'
import { IconShield } from '../../components/Icons'

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
        <iframe
          src="https://app.termly.io/policy-viewer/policy.html?policyUUID=49c5d88c-ee36-4bbb-bde7-6c641a540268"
          style={{ width: '100%', minHeight: 600, border: 'none', borderRadius: 8 }}
          title="Cookie Policy"
        />
      </LegalSection>
    </LegalPageLayout>
  )
}

export default CookiePolicyPage
