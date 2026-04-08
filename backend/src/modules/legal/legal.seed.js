const fs = require('node:fs')
const path = require('node:path')

const CURRENT_LEGAL_VERSION = '2026-04-08'
const TERMLY_POLICY_BASE = 'https://app.termly.io/policy-viewer/policy.html?policyUUID='

const LEGAL_REQUIRED_SIGNUP_SLUGS = ['terms', 'privacy', 'guidelines']
const LEGAL_DOCUMENT_ORDER = ['terms', 'privacy', 'cookies', 'guidelines', 'disclaimer']

const LEGAL_DOCUMENT_SEEDS = [
  {
    slug: 'terms',
    version: CURRENT_LEGAL_VERSION,
    title: 'Terms and Conditions',
    summary: 'The legal terms that govern your access to and use of StudyHub.',
    intro: 'These legal terms explain how StudyHub works, what is expected from users, and the rules that apply when you use the platform.',
    updatedLabel: 'Last updated April 08, 2026',
    requiredAtSignup: true,
    termlyEmbedId: '84ea6e72-ac97-4827-ba6d-c34900aea542',
    termlyUrl: `${TERMLY_POLICY_BASE}84ea6e72-ac97-4827-ba6d-c34900aea542`,
    fileName: 'terms-2026-04-08.txt',
  },
  {
    slug: 'privacy',
    version: CURRENT_LEGAL_VERSION,
    title: 'Privacy Policy',
    summary: 'How StudyHub collects, uses, stores, and protects personal information.',
    intro: 'This privacy notice explains what data StudyHub collects, why it is processed, and the rights users have over their information.',
    updatedLabel: 'Last updated April 08, 2026',
    requiredAtSignup: true,
    termlyEmbedId: 'af795fa7-a5b0-41e4-b342-8797a0194d55',
    termlyUrl: `${TERMLY_POLICY_BASE}af795fa7-a5b0-41e4-b342-8797a0194d55`,
    fileName: 'privacy-2026-04-08.txt',
  },
  {
    slug: 'guidelines',
    version: CURRENT_LEGAL_VERSION,
    title: 'Community Guidelines',
    summary: 'The shared standards that keep StudyHub useful, respectful, and safe for students.',
    intro: 'StudyHub is built for students. These guidelines define the platform norms that apply to publishing, collaboration, and communication.',
    updatedLabel: 'Last updated April 08, 2026',
    requiredAtSignup: true,
    termlyEmbedId: null,
    termlyUrl: null,
    fileName: 'guidelines-2026-04-08.txt',
  },
  {
    slug: 'cookies',
    version: CURRENT_LEGAL_VERSION,
    title: 'Cookie Policy',
    summary: 'How StudyHub uses cookies, analytics, advertising technologies, and related preference controls.',
    intro: 'This cookie policy explains the cookies and similar technologies used across StudyHub and how users can manage their choices.',
    updatedLabel: 'Last updated April 08, 2026',
    requiredAtSignup: false,
    termlyEmbedId: '49c5d88c-ee36-4bbb-bde7-6c641a540268',
    termlyUrl: `${TERMLY_POLICY_BASE}49c5d88c-ee36-4bbb-bde7-6c641a540268`,
    fileName: 'cookie-2026-04-08.txt',
  },
  {
    slug: 'disclaimer',
    version: CURRENT_LEGAL_VERSION,
    title: 'Disclaimer',
    summary: 'Important limitations and liability notices for the StudyHub website and services.',
    intro: 'This disclaimer explains the limits of the information published on StudyHub and the extent of our liability for its use.',
    updatedLabel: 'Last updated April 08, 2026',
    requiredAtSignup: false,
    termlyEmbedId: '55c02c39-21be-41cf-a1aa-a8ae0181e69b',
    termlyUrl: `${TERMLY_POLICY_BASE}55c02c39-21be-41cf-a1aa-a8ae0181e69b`,
    fileName: 'disclaimer-2026-04-08.txt',
  },
]

function normalizeLegalBodyText(value) {
  const bell = String.fromCharCode(7)
  const verticalTab = String.fromCharCode(11)
  const formFeed = String.fromCharCode(12)
  const nonBreakingSpace = String.fromCharCode(160)
  const normalized = String(value || '')
    .split(bell).join('')
    .split(verticalTab).join('\n')
    .split(formFeed).join('\n')
    .split(nonBreakingSpace).join(' ')

  return Array.from(normalized)
    .filter((character) => {
      const code = character.charCodeAt(0)
      return code === 10 || code === 13 || code >= 32
    })
    .join('')
    .replace(/â€™/g, "'")
    .replace(/â€œ|â€\x9d/g, '"')
    .replace(/â€“/g, '-')
    .replace(/â€”/g, '--')
    .replace(/â€¦/g, '...')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/([A-Z][A-Z &'"/(),:;-]{6,})(Last updated\s+[A-Z][a-z]+\s+\d{2},\s+\d{4})/g, '$1\n$2')
    .replace(/(Last updated\s+[A-Z][a-z]+\s+\d{2},\s+\d{4})([A-Z])/g, '$1\n\n$2')
    .replace(/(TABLE OF CONTENTS)(\d+\.\s+)/g, '$1\n$2')
    .replace(/([^\n])(\d+\.\s+[A-Z])/g, '$1\n$2')
    .replace(/([a-z0-9)\]])\.([A-Z])/g, '$1.\n\n$2')
    .replace(/([a-z0-9,)])([A-Z]{2,}(?:\s+[A-Z0-9][A-Z0-9'"/&(),:;-]{2,}){1,})(?=[A-Z][a-z])/g, '$1\n\n$2')
    .replace(/(In Short:)([A-Z])/g, '$1 $2')
    .replace(/(following:)([A-Za-z])/gi, '$1\n$2')
    .replace(
      /(The personal information we collect may include the following:)\s*names\s*email addresses\s*usernames\s*passwords\s*debit\/credit card numbers/gi,
      '$1\n- names\n- email addresses\n- usernames\n- passwords\n- debit/credit card numbers',
    )
    .replace(/(These rights include:)\s*Right to/gi, '$1\n- Right to')
    .replace(/(Category [A-Z] - [^.]+)(Category [A-Z] - )/g, '$1\n$2')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function getLegalDocumentSeeds() {
  return LEGAL_DOCUMENT_SEEDS.map((seed) => {
    const filePath = path.join(__dirname, 'content', seed.fileName)
    const bodyText = normalizeLegalBodyText(fs.readFileSync(filePath, 'utf8'))

    return {
      ...seed,
      bodyText,
    }
  })
}

module.exports = {
  CURRENT_LEGAL_VERSION,
  LEGAL_DOCUMENT_ORDER,
  LEGAL_DOCUMENT_SEEDS,
  LEGAL_REQUIRED_SIGNUP_SLUGS,
  getLegalDocumentSeeds,
}
