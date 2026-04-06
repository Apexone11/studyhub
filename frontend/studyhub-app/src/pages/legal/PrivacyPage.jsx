import { IconShield } from '../../components/Icons'
import LegalDocumentPage from './LegalDocumentPage'

function PrivacyPage() {
  return (
    <LegalDocumentPage
      slug="privacy"
      tone="green"
      icon={<IconShield size={26} />}
      fallbackTitle="Privacy Policy"
      fallbackUpdated="Last updated April 04, 2026"
      fallbackSummary="How StudyHub collects, uses, stores, shares, and protects personal information."
      fallbackIntro="StudyHub is built for students, and this privacy notice explains what data we process, why we process it, and the rights you have over your information."
    />
  )
}

export default PrivacyPage
