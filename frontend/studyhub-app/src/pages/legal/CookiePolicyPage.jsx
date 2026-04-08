import { IconShield } from '../../components/Icons'
import LegalDocumentPage from './LegalDocumentPage'

function CookiePolicyPage() {
  return (
    <LegalDocumentPage
      slug="cookies"
      tone="green"
      icon={<IconShield size={26} />}
      fallbackTitle="Cookie Policy"
      fallbackUpdated="Last updated April 04, 2026"
      fallbackSummary="How StudyHub uses cookies, analytics, advertising technologies, and cookie preference controls."
      fallbackIntro="This cookie policy explains the cookies and similar technologies used on StudyHub and how you can control them."
    />
  )
}

export default CookiePolicyPage
