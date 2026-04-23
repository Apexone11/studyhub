/**
 * docsContent.js — source of truth for the public /docs feature catalog.
 *
 * Week 2 ships the landing page + 3 feature sub-pages (feed, sheets,
 * study-groups). Weeks 3–4 add the remaining 9 sub-pages by dropping
 * entries into this file. No MDX dep — content is plain JSX strings.
 *
 * See docs/internal/design-refresh-v2-week2-brainstorm.md §12 and
 *     docs/internal/design-refresh-v2-week2-to-week5-execution.md.
 */

export const FEATURES = [
  {
    slug: 'feed',
    title: 'Feed',
    tagline: 'What your classmates are learning right now.',
    roles: ['student', 'teacher', 'self-learner'],
    tryTo: '/feed',
    sections: [
      {
        heading: 'What it is',
        body: 'The Feed is your home in StudyHub. It shows what classmates are sharing — study sheets, notes, questions, and announcements — prioritized by the courses and topics you follow.',
      },
      {
        heading: 'How it works',
        body: 'Posts are ranked by a mix of recency, engagement, and relevance to your courses. Use the topic chips to filter by interest. The Weekly Focus card at the top tracks your learning goal for the week.',
      },
      {
        heading: 'Who it is for',
        body: 'Students follow their courses. Teachers see posts from students in their classes. Self-learners see posts from topics they follow.',
      },
    ],
    tips: [
      'Follow 5+ topics to get a richer For You feed.',
      'Tap the heart on a post to save it for later.',
      'The streak bar rewards a single action a day — starring a sheet counts.',
    ],
  },
  {
    slug: 'sheets',
    title: 'Study sheets',
    tagline: 'Collaborative, forkable study guides — like GitHub for learning.',
    roles: ['student', 'teacher', 'self-learner'],
    tryTo: '/sheets',
    sections: [
      {
        heading: 'What it is',
        body: 'Study sheets are the core content unit in StudyHub. One sheet is one topic, written up the way you would explain it to a friend. You can fork a sheet, improve it, and contribute back — or keep your version private.',
      },
      {
        heading: 'How it works',
        body: 'Sheets can be uploaded, written from scratch in the lab, or generated with Hub AI. They attach to a course so other students in that course find them. Contributing a change opens a pull-request–style review with the original author.',
      },
      {
        heading: 'Who it is for',
        body: 'Students sharing notes before an exam. Teachers publishing lesson material. Self-learners documenting a topic they studied.',
      },
    ],
    tips: [
      'Star useful sheets — they land in your profile and your starred filter.',
      'The plagiarism check runs automatically; teacher-assigned sheets show a clean-source score.',
      'Sheets support LaTeX, code, and tables through the lab editor.',
    ],
  },
  {
    slug: 'study-groups',
    title: 'Study groups',
    tagline: 'Private rooms for a group of students working through the same material.',
    roles: ['student', 'teacher', 'self-learner'],
    tryTo: '/study-groups',
    sections: [
      {
        heading: 'What it is',
        body: 'Study groups are small-to-medium rooms for students sharing a course or a topic. Each group has its own discussion board, scheduled sessions, and a shared shelf of resources.',
      },
      {
        heading: 'How it works',
        body: 'Create a group around a course or topic. Invite classmates. Schedule a study session with a date and location. Post a discussion prompt. Share resources — any StudyHub sheet, note, or link.',
      },
      {
        heading: 'Who it is for',
        body: 'Classmates prepping for a test together. Teachers running a review cohort. Self-learners collaborating on a topic.',
      },
    ],
    tips: [
      'RSVP to sessions so the host knows who to expect.',
      'Pin a resource to the top of the shelf — the whole group sees it.',
      'The problem queue lets anyone post a question, and anyone can claim it.',
    ],
  },
  // --- Placeholders for later weeks (kept short so the grid still lists
  // them; clicking through shows a "coming soon" stub). ---
  {
    slug: 'notes',
    title: 'Notes',
    tagline: 'Private and shared notebooks.',
    roles: ['all'],
    comingSoon: true,
  },
  {
    slug: 'ai',
    title: 'Hub AI',
    tagline: 'Your AI study partner with course context.',
    roles: ['all'],
    comingSoon: true,
  },
  {
    slug: 'messages',
    title: 'Messages',
    tagline: 'Real-time DMs and group chats.',
    roles: ['all'],
    comingSoon: true,
  },
  {
    slug: 'library',
    title: 'Library',
    tagline: 'Searchable books and references.',
    roles: ['all'],
    comingSoon: true,
  },
  {
    slug: 'announcements',
    title: 'Announcements',
    tagline: 'Course-scoped broadcasts.',
    roles: ['all'],
    comingSoon: true,
  },
  {
    slug: 'tests',
    title: 'Tests & exams',
    tagline: 'Practice and scheduled assessments.',
    roles: ['all'],
    comingSoon: true,
  },
  {
    slug: 'playground',
    title: 'Playground',
    tagline: 'Experiment with code and ideas.',
    roles: ['all'],
    comingSoon: true,
  },
  {
    slug: 'contributions',
    title: 'Contributions',
    tagline: 'Pull-request–style sheet reviews.',
    roles: ['all'],
    comingSoon: true,
  },
  {
    slug: 'courses',
    title: 'Courses',
    tagline: 'The course directory and enrollment.',
    roles: ['all'],
    comingSoon: true,
  },
]

export const ROLE_WALKTHROUGHS = [
  {
    role: 'student',
    title: 'If you are a student',
    intro:
      'Start with your courses. Add the ones you are taking this term. The feed, sheets, and study groups pages will adapt to show you what matters for those courses.',
    steps: [
      'Add your school and major in Settings.',
      'Follow the 4–6 courses you are taking this term.',
      'Star a useful sheet or write your own.',
      'Add your upcoming exam dates so the Feed reminds you.',
      'Join a study group for at least one course.',
    ],
  },
  {
    role: 'teacher',
    title: 'If you are a teacher',
    intro:
      'Your workspace is My Materials. Build your lesson library first, then create a Section for each class you teach, and assign materials to those sections.',
    steps: [
      'Verify your teaching status in Settings.',
      'Publish your first material — upload a sheet or write one in the lab.',
      'Create a Section for one of your classes and invite students.',
      'Schedule a check-in session with your section.',
      'Drop a practice problem in the group problem queue for feedback.',
    ],
  },
  {
    role: 'self-learner',
    title: 'If you are a self-learner',
    intro:
      'No school, no courses — just topics and goals. The feed adapts to what you follow, and the Weekly Focus card keeps you on track.',
    steps: [
      'Pick at least one topic you want to learn.',
      'Set a learning goal for this week.',
      'Work through the generated task checklist.',
      'Star a sheet in your topic and write a reflection note.',
      'Join a topic-based group if you want to study with others.',
    ],
  },
]

export function findFeature(slug) {
  return FEATURES.find((f) => f.slug === slug) || null
}
