import LegalPageLayout, { LegalSection } from '../../components/LegalPageLayout'
import { IconShieldCheck } from '../../components/Icons'
import { LEGAL_EMAILS } from '../../lib/legalConstants'
import { TERMLY_DSAR_URL } from '../../lib/legalVersions'

function DataRequestPage() {
  return (
    <LegalPageLayout
      tone="blue"
      title="Data Request"
      updated="Your Privacy Rights"
      summary="Request access to, correction of, or deletion of your personal data."
      intro="Under privacy laws including CCPA and GDPR, you have the right to manage your personal data. Use this page to submit a request."
      icon={<IconShieldCheck size={26} />}
    >
      <LegalSection title="Submit a Data Request">
        <p>
          Under privacy laws including CCPA and GDPR, you have the right to request access
          to your personal data, ask for corrections, or request deletion. Use the form below
          to submit your request. We will respond within 24 hours.
        </p>
        <p>
          You can also email us directly at{' '}
          <a href={`mailto:${LEGAL_EMAILS.privacy}`} style={{ color: 'var(--sh-brand)', textDecoration: 'none' }}>{LEGAL_EMAILS.privacy}</a>.
        </p>
        <iframe
          src={TERMLY_DSAR_URL}
          style={{ width: '100%', minHeight: 700, border: 'none', borderRadius: 8 }}
          title="Data Subject Access Request Form"
        />
      </LegalSection>
    </LegalPageLayout>
  )
}

export default DataRequestPage
