import { IconUsers } from '../../components/Icons'
import LegalDocumentPage from './LegalDocumentPage'

function GuidelinesPage() {
  return (
    <LegalDocumentPage
      slug="guidelines"
      tone="amber"
      icon={<IconUsers size={26} />}
      fallbackTitle="Community Guidelines"
      fallbackUpdated="Last updated April 04, 2026"
      fallbackSummary="The shared standards that keep StudyHub useful, respectful, and safe for students."
      fallbackIntro="StudyHub is built for students. These guidelines define the platform norms that apply to publishing, collaboration, and communication."
    />
  )
}

export default GuidelinesPage
