import { IconInfoCircle } from '../../components/Icons'
import LegalDocumentPage from './LegalDocumentPage'

function TermsPage() {
  return (
    <LegalDocumentPage
      slug="terms"
      tone="blue"
      icon={<IconInfoCircle size={26} />}
      fallbackTitle="Terms of Use"
      fallbackUpdated="Last updated April 04, 2026"
      fallbackSummary="By using StudyHub, you agree to the legal terms that govern your access to the platform."
      fallbackIntro="StudyHub provides student-generated study materials, collaboration tools, and account services. These terms explain the rules that apply when you use StudyHub."
    />
  )
}

export default TermsPage
