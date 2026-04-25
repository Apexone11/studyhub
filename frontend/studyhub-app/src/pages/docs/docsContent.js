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
        body: 'The Feed is your home in StudyHub. It shows what the people around you are sharing in real time — new study sheets, quick notes, questions being asked, announcements from teachers — prioritized by the courses and topics you follow. Think of it as a course-aware activity stream: instead of a generic algorithm, the ordering is driven by what is happening in YOUR classes.',
      },
      {
        heading: 'How it works',
        body: 'Posts are ranked by a blend of recency, engagement, and relevance to the courses and topics on your profile. The topic chips along the top let you narrow the feed to a single subject. The Weekly Focus card tracks the learning goal you set that week and surfaces tasks to hit it; every action you take (starring, forking, commenting, joining a session) nudges the ranking toward more of what you like. For You is the default tab; Following only shows posts from people you follow directly.',
      },
      {
        heading: 'Who it is for',
        body: 'Students see posts from classmates in the courses they follow and from anyone they follow directly. Teachers see posts from students in their Sections, so they can spot questions and recurring misunderstandings quickly. Self-learners see posts tagged with topics they follow and from other self-learners working on the same material.',
      },
      {
        heading: 'Privacy and moderation',
        body: 'Blocking a user hides both sides of the feed — you do not see their posts, and they do not see yours. Muting is one-directional and silent. Posts flagged by the moderation engine either go to review (Tier 2) or are quarantined (Tier 3) before they ever reach another student. See the Block/Mute and Moderation sections of the docs for the full policy.',
      },
    ],
    tips: [
      'Follow 5+ topics to get a richer For You feed — the ranker needs signal.',
      'Tap the heart on a post to save it to your profile for later review.',
      'The streak bar rewards a single action a day; starring a sheet counts, you do not have to write anything to keep the streak alive.',
      'Switch to the Following tab during finals week if your For You feed gets too noisy.',
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
        body: "Study sheets are the core content unit in StudyHub. One sheet is one topic — a lecture, a chapter, a concept — written up the way you would explain it to a friend sitting next to you. Unlike a static PDF, every sheet is forkable: you can take someone else's sheet, make it clearer, add your own examples, and either contribute the improvement back to the original author or keep your edited version on your own profile.",
      },
      {
        heading: 'How it works',
        body: "A sheet is created by uploading a file (PDF, Markdown, HTML), writing it from scratch in the SheetLab editor, or generating a first draft with Hub AI and refining it from there. Every sheet is attached to a course so it surfaces in that course's directory for classmates. Forking creates a linked copy you own; editing your copy and submitting a contribution opens a pull-request-style review in which the original author sees a line-level diff and can accept, reject, or request changes. All sheets go through a risk-classification pipeline before publish: Tier 0 auto-publishes, Tier 1 publishes with a warning banner, Tier 2 goes to admin review, Tier 3 is quarantined for manual safety review.",
      },
      {
        heading: 'Who it is for',
        body: 'Students sharing polished notes before a big exam. Teachers publishing official lesson material their Section should study from. Self-learners documenting a topic they have taught themselves, so the next person learning it does not have to start from zero.',
      },
      {
        heading: 'Plagiarism and attribution',
        body: 'Every sheet is scanned against existing published sheets on upload. If you copy another sheet without forking, the viewer sees a similarity badge linking back to the original. Forking is always free and always attributed — that is the point. Teacher-assigned Section materials also show a "clean-source" score so students can tell verified teacher content from crowd-sourced content at a glance.',
      },
    ],
    tips: [
      'Star useful sheets — they land in your profile\'s Starred tab and filter into the "Starred" view on the Sheets page.',
      'The plagiarism check runs automatically on upload. It compares against currently-published sheets, not against the open web.',
      'Sheets support LaTeX math, highlighted code, and tables through the SheetLab editor; use the "Format" toolbar to insert equations inline or in a block.',
      'Use "Fork to edit" instead of copy-pasting; forks preserve the attribution chain and tell the original author their work was useful.',
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
        body: 'Study groups are small-to-medium rooms for people sharing a course or a topic. Each group has a discussion board for questions, a schedule for upcoming study sessions, a shelf for shared resources (any StudyHub sheet, note, or link), and a live member list. Groups can be public (anyone can find and join), unlisted (join by invite link), or private (members-only, invite required).',
      },
      {
        heading: 'How it works',
        body: "A member creates a group around a course or a topic. They invite classmates by link, username, or email. Anyone in the group can post a discussion prompt, schedule a session with date / time / location (or video link), pin a resource to the shelf, and reply to other members' posts. Sessions have RSVPs so hosts can see expected attendance. The Problem Queue lets any member post a question or practice problem; any other member can claim it, which puts it on their feed and marks the queue entry as in-progress.",
      },
      {
        heading: 'Who it is for',
        body: 'Classmates prepping for the same test together — one group per test or one per course. Teachers running a review cohort alongside their official Section (cohorts let the teacher see activity without running the group themselves). Self-learners collaborating on a topic where no formal course exists.',
      },
      {
        heading: 'Safety and moderation',
        body: 'Group creators and co-admins can remove members, lock threads, and delete posts. Every group has a shared report button that notifies both the group admins and the platform moderation team. Blocks still apply inside groups — a blocked user cannot see your posts and you cannot see theirs, even if you share a group.',
      },
    ],
    tips: [
      'RSVP to sessions early so the host knows how to pace the room.',
      'Pin the most valuable resource to the top of the shelf — every member sees the pin at the top of the Resources tab.',
      'The Problem Queue is the fastest way to get unstuck without starting a whole new discussion thread; post the problem, someone claims it, they reply.',
      'For exam-week groups, schedule a single long session the day before and pin the review sheet you want everyone to read first.',
    ],
  },
  {
    slug: 'notes',
    title: 'Notes',
    tagline: 'Private and shared notebooks with version history.',
    roles: ['all'],
    tryTo: '/notes',
    sections: [
      {
        heading: 'What it is',
        body: 'Notes are your personal notebooks inside StudyHub. Unlike sheets, notes are private by default — they are for your own studying, your own drafts, your own running "second brain." You can make an individual note public later, but the default is private.',
      },
      {
        heading: 'How it works',
        body: 'Every keystroke is auto-saved after a short debounce, with an IndexedDB draft that survives full browser crashes. Saves flush on tab close, tab hide, and connection restore, so you do not lose a paste or a paragraph even on a flaky network. Version history records both MANUAL snapshots (when you click "Save Version") and AUTO snapshots (time-based, while you edit), and you can restore any prior version — the current state is automatically saved as a new version before the restore, so nothing is lost.',
      },
      {
        heading: 'Tags, search, and sharing',
        body: 'Tag a note to group related entries together; the tag filter on the Notes page lists every tag you have used. Notes are indexed for full-text search, so a note from three months ago is one query away. Pin a note to keep it at the top of your list. When you are ready to share, flip the note to public and it becomes searchable by username on the global search.',
      },
    ],
    tips: [
      'You do not need to save manually — typing is enough. "Save Version" is only for labeled checkpoints ("after lecture 3", "final draft").',
      'Use tags consistently. "calc2" and "calculus-2" are treated as different tags.',
      'Pin no more than three notes at a time — the pin becomes meaningless if everything is pinned.',
    ],
  },
  {
    slug: 'ai',
    title: 'Hub AI',
    tagline: 'Your AI study partner with full course context.',
    roles: ['all'],
    tryTo: '/ai',
    sections: [
      {
        heading: 'What it is',
        body: 'Hub AI is a study assistant powered by Claude. Unlike a generic chatbot, it has StudyHub context: which courses you are taking, which sheets you have starred, and which page you are on right now. Ask it to explain a concept, generate practice problems, or draft a new study sheet — it will pull from your own course context to answer.',
      },
      {
        heading: 'How it works',
        body: 'Type a question in the chat tab or anywhere the floating AI bubble appears. Responses stream token-by-token. If you ask for a sheet, Hub AI can emit a full HTML study sheet that previews inline; you can publish it directly from the preview. Your messages are tied to conversations that persist across sessions, so you can resume a study thread the next day.',
      },
      {
        heading: 'Limits and safety',
        body: "Hub AI never helps with academic integrity violations — no test answers during a scheduled test, no copying someone else's submission. Daily message limits scale with your plan: 30 for regular accounts, 60 for email-verified, 120 for Pro and admins. Generated sheets go through the same security scan as user-uploaded HTML; scripts are never allowed.",
      },
    ],
    tips: [
      'Mention the course explicitly ("CMSC201 final review") for best context pulling.',
      'Use "Generate a study sheet for..." to get a full, publishable HTML sheet rather than a chat answer.',
      'If an answer feels generic, say "use my notes" — Hub AI will prioritize your own notes and starred sheets.',
    ],
  },
  {
    slug: 'messages',
    title: 'Messages',
    tagline: 'Real-time DMs and group chats with your classmates.',
    roles: ['all'],
    tryTo: '/messages',
    sections: [
      {
        heading: 'What it is',
        body: 'Messages is the real-time chat layer for StudyHub — a one-to-one DM or multi-person conversation with classmates, built on Socket.io. Use it for quick questions that do not belong in a public study group, or for a 2-3 person study partnership.',
      },
      {
        heading: 'How it works',
        body: 'Open the Messages tab, pick a username, and start a conversation. Typing indicators, read receipts, and delivery confirmations are live. Messages support reactions and edits within a 15-minute window. Deleting a message is soft — the record is retained for moderation but the content is removed from both sides of the conversation.',
      },
      {
        heading: 'Safety',
        body: 'Blocks apply across the product — a blocked user cannot DM you and cannot see your profile. Muting a conversation silences notifications without leaving the thread. Per-socket rate limits prevent spam: typing events are capped at 20/minute, and message writes at 60/minute.',
      },
    ],
    tips: [
      'Quote-reply to keep a long thread navigable — tap a message and choose "Reply."',
      'Emoji are allowed in message bodies (but not in platform UI). Use them.',
      'Jump into a DM directly from a profile page — the "Message" button auto-starts a conversation.',
    ],
  },
  {
    slug: 'library',
    title: 'Library',
    tagline: 'Searchable books and references, powered by Google Books.',
    roles: ['all'],
    tryTo: '/library',
    sections: [
      {
        heading: 'What it is',
        body: 'The Library is the reference layer of StudyHub — search textbooks, classics, and references directly, then save the volumes you actually use to your personal shelf. Books are pulled from the Google Books catalog; free and public-domain titles can be read in the inline reader.',
      },
      {
        heading: 'How it works',
        body: 'Type a title, author, or ISBN. Filter by free-only if you want to read it right away. Saving a book puts it on your Library shelf so it is one click away from any page. For public-domain titles, the "Read" button opens a reader view; for copyrighted titles, StudyHub links to the authorized source.',
      },
      {
        heading: 'Who it is for',
        body: 'Students building a reference list for a research paper. Teachers linking students to a textbook. Self-learners collecting the books they have read on a topic.',
      },
    ],
    tips: [
      'Use advanced search (Title + Author + ISBN) for exact-match when a title is ambiguous.',
      'Save only the books you actually open. The shelf is a working reference, not a wishlist.',
    ],
  },
  {
    slug: 'announcements',
    title: 'Announcements',
    tagline: 'Course-scoped broadcasts from your teachers and the platform.',
    roles: ['all'],
    tryTo: '/announcements',
    sections: [
      {
        heading: 'What it is',
        body: 'Announcements are one-way broadcasts, not conversations. They are posted by teachers into Sections, by group admins into their groups, and by platform admins for cross-cutting updates (maintenance, new features, policy changes).',
      },
      {
        heading: 'How it works',
        body: 'New announcements surface at the top of the Announcements page and are linked from your feed with a distinctive pinned card. You can react to announcements (not reply), and pinned announcements stay at the top of the list until the author unpins them.',
      },
    ],
    tips: [
      'Turn on announcement notifications in Settings if you rely on teacher announcements for assignment updates.',
      'Pinned announcements are usually time-sensitive — read them first.',
    ],
  },
  {
    slug: 'tests',
    title: 'Tests & exams',
    tagline: 'Scheduled assessments, practice tests, and auto-grading.',
    roles: ['all'],
    comingSoon: true,
    tryTo: '/tests',
  },
  {
    slug: 'playground',
    title: 'Playground',
    tagline: 'Experiment with code, run snippets, and try ideas safely.',
    roles: ['all'],
    comingSoon: true,
    tryTo: '/playground',
  },
  {
    slug: 'contributions',
    title: 'Contributions',
    tagline: 'Pull-request–style sheet reviews.',
    roles: ['all'],
    tryTo: '/submit',
    sections: [
      {
        heading: 'What it is',
        body: 'A contribution is a proposed change to someone else\'s sheet. Forking a sheet gives you a private working copy; clicking "Contribute back" takes your edits and opens a PR-style review page on the original sheet\'s author.',
      },
      {
        heading: 'How it works',
        body: 'Write your contribution message (what changed and why). The original author sees a line-level diff between their version and your proposed version. They can accept the whole contribution, request changes with inline comments, or reject it. Accepted contributions merge into the sheet and credit you as a contributor.',
      },
    ],
    tips: [
      'A good contribution message explains WHY the change matters, not WHAT changed — the diff shows what changed.',
      'Small, focused contributions get accepted more often than sweeping rewrites.',
    ],
  },
  {
    slug: 'courses',
    title: 'Courses',
    tagline: 'The course directory, enrollment, and per-course pages.',
    roles: ['all'],
    tryTo: '/my-courses',
    sections: [
      {
        heading: 'What it is',
        body: 'Courses are the organizing layer for content in StudyHub. Every sheet, note, announcement, and study group is attached to a course, and every user follows a set of courses. The Courses directory shows every course offered at every school registered in StudyHub.',
      },
      {
        heading: 'How it works',
        body: 'Find your school, search for your course code, and click "Follow." Followed courses drive the ranking on your feed and show up as filter chips on the Sheets page. Create-a-course lets you add a course that is not yet in the directory — the moderation team reviews it before it becomes searchable.',
      },
    ],
    tips: [
      'Follow courses at the term level, not the all-time level. Unfollow the ones from last semester so your feed stays focused.',
      'If your course is missing, request it. Do not attach your sheets to a wrong-but-close course.',
    ],
  },
]

export const ROLE_WALKTHROUGHS = [
  {
    role: 'student',
    title: 'If you are a student',
    intro:
      'Start with your courses. Add the ones you are taking this term and StudyHub adapts — the feed ranks posts by those courses, sheets surface from your classmates, and study groups suggest rooms for the classes you follow. The five steps below are the minimum setup to get a personalized experience on day one.',
    // Rendered as a numbered list. User explicitly asked for no hyphen
    // bullets here — only the self-learner walkthrough keeps those.
    listStyle: 'ordered',
    steps: [
      'Open Settings and fill in your school and major so course lookups match your catalog.',
      'Follow the 4–6 courses you are taking this term; this seeds your feed and unlocks course-filtered search.',
      'Star a useful sheet you find or publish one of your own — starred sheets stick to your profile and the "Starred" filter.',
      'Add your upcoming exam dates in Settings → Study; the Feed surfaces a countdown card and Hub AI prioritizes those courses in its context.',
      'Join a study group for at least one course so you have a private room for questions, shared resources, and scheduled sessions.',
    ],
  },
  {
    role: 'teacher',
    title: 'If you are a teacher',
    intro:
      'Your workspace is "My Materials." Build a lesson library you control, then create a Section for each class you teach and publish the materials your students should see. Because teacher verification changes what counts as an "official" source on a plagiarism check, the first step is specifically the identity gate.',
    // Rendered as a numbered list. User explicitly asked for no hyphen
    // bullets here — only the self-learner walkthrough keeps those.
    listStyle: 'ordered',
    steps: [
      'Verify your teaching status in Settings → Account → Teacher verification; unverified teacher accounts read as students until this is approved.',
      'Publish your first material — upload a PDF or write a sheet in the lab. Your materials become the source-of-truth for plagiarism checks in your assigned sections.',
      'Create a Section for one of your classes, set visibility, and invite students by link, email, or directly by username.',
      'Schedule a check-in session with the Section; students see it on their upcoming-sessions widget and can RSVP.',
      'Drop a practice problem into the Section problem queue — anyone in the Section can claim it, and the claim surfaces on their feed.',
    ],
  },
  {
    role: 'self-learner',
    title: 'If you are a self-learner',
    intro:
      'No school, no courses — just topics and goals. The feed adapts to what you follow, the Weekly Focus card keeps you on track, and the generated task checklist gives you a concrete next action whenever you open the app.',
    // User asked to keep the hyphen bullets on this walkthrough only.
    listStyle: 'dash',
    steps: [
      'Pick at least one topic you want to learn — physics, a language, a framework — anything StudyHub has a tag for.',
      'Set a learning goal for this week; the goal drives the Weekly Focus card and the task generator.',
      'Work through the generated task checklist; each task is a small, time-boxed action, not a full lesson.',
      'Star a sheet in your topic and write a reflection note — writing is how the topic stops being abstract.',
      'Join a topic-based group if you want to study with others; the group discussion board is a good place to ask questions without a teacher.',
    ],
  },
]

export function findFeature(slug) {
  return FEATURES.find((f) => f.slug === slug) || null
}
