import LegalPageLayout, { LegalSection } from '../../components/LegalPageLayout'
import { IconInfoCircle } from '../../components/Icons'

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
        <iframe
          src="https://app.termly.io/policy-viewer/policy.html?policyUUID=55c02c39-21be-41cf-a1aa-a8ae0181e69b"
          style={{ width: '100%', minHeight: 600, border: 'none', borderRadius: 8 }}
          title="Disclaimer"
        />
      </LegalSection>
    </LegalPageLayout>
  )
}

export default DisclaimerPage
