import { IconInfoCircle } from '../../components/Icons'
import LegalDocumentPage from './LegalDocumentPage'

function DisclaimerPage() {
  return (
    <LegalDocumentPage
      slug="disclaimer"
      tone="amber"
      icon={<IconInfoCircle size={26} />}
      fallbackTitle="Disclaimer"
      fallbackUpdated="Last updated April 04, 2026"
      fallbackSummary="Important limitations and liability notices for the StudyHub site and services."
      fallbackIntro="This disclaimer explains the limits of the information published on StudyHub and the extent of our liability for its use."
    />
  )
}

export default DisclaimerPage
