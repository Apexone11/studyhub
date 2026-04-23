// homeConstants.js — Data arrays and helper config for the HomePage feature.
import {
  IconAnnouncements,
  IconCheck,
  IconDownload,
  IconFork,
  IconMessages,
  IconPen,
  IconSchool,
  IconSheets,
  IconSpark,
  IconStar,
  IconTests,
  IconUsers,
} from '../../components/Icons'

export const HOME_TREE_COLORS = {
  main: 'var(--sh-home-tree-main)',
  secondary: 'var(--sh-home-tree-secondary)',
  tertiary: 'var(--sh-home-tree-tertiary)',
  leaf: 'var(--sh-home-tree-leaf)',
  study: 'var(--sh-home-tree-study)',
}

export const HOME_AVATAR_COLORS = [
  'var(--sh-home-avatar-1)',
  'var(--sh-home-avatar-2)',
  'var(--sh-home-avatar-3)',
  'var(--sh-home-avatar-4)',
  'var(--sh-home-avatar-5)',
  'var(--sh-home-avatar-6)',
]

export const FEATURES = [
  {
    Icon: IconSheets,
    title: 'Study Sheets',
    desc: 'Community-built guides for every course. Fork any sheet and make it your own.',
    toneClass: 'home-feature--blue',
  },
  {
    Icon: IconTests,
    title: 'Practice Tests',
    desc: 'Take student-made tests right in your browser. Download anytime for offline use.',
    toneClass: 'home-feature--green',
  },
  {
    Icon: IconAnnouncements,
    title: 'Announcements',
    desc: 'Real-time course updates from instructors. Never miss a deadline or change.',
    toneClass: 'home-feature--amber',
  },
  {
    Icon: IconSpark,
    title: 'Hub AI',
    desc: 'Stuck on a concept? Get instant explanations and AI-generated study sheets tailored to your courses.',
    toneClass: 'home-feature--purple',
  },
  {
    Icon: IconPen,
    title: 'Personal Notes',
    desc: 'Keep private notes tied to any course. Share with classmates when you are ready.',
    toneClass: 'home-feature--rose',
  },
  {
    Icon: IconFork,
    title: 'Fork and Contribute',
    desc: 'Like GitHub: fork any study sheet, improve it, and contribute it back.',
    toneClass: 'home-feature--teal',
  },
  {
    Icon: IconSchool,
    title: 'Multi-School',
    desc: 'All 30+ Maryland schools. Every subject, every course. Expanding nationwide.',
    toneClass: 'home-feature--orange',
  },
  {
    Icon: IconDownload,
    title: 'Download Anything',
    desc: 'Save any study material to your device. Works offline when you need it.',
    toneClass: 'home-feature--slate',
  },
  {
    Icon: IconCheck,
    title: 'Free to Start',
    desc: 'Core study tools are free. Sign up, share, and collaborate with your classmates today.',
    toneClass: 'home-feature--green',
  },
  {
    Icon: IconStar,
    title: 'BookHub Library',
    desc: 'Browse Google Books-powered titles, open available previews, save shelves, and keep your place with bookmarks while you study.',
    toneClass: 'home-feature--indigo',
  },
  {
    Icon: IconUsers,
    title: 'Study Groups',
    desc: 'Create groups, schedule study sessions, share resources, and discuss topics with classmates.',
    toneClass: 'home-feature--cyan',
  },
  {
    Icon: IconMessages,
    title: 'StudyHub Connect',
    desc: 'Real-time DMs and group chats with classmates. Connect instantly with built-in messaging.',
    toneClass: 'home-feature--pink',
  },
]

export const STEPS = [
  {
    n: '01',
    title: 'Create your account',
    desc: 'Sign up with email or Google in seconds. Verify your email and you are in.',
    icon: IconUsers,
  },
  {
    n: '02',
    title: 'Pick your school and courses',
    desc: 'Select from 30+ Maryland schools and hundreds of courses, or add your own.',
    icon: IconSchool,
  },
  {
    n: '03',
    title: 'Access everything',
    desc: 'Study sheets, tests, and announcements organized and ready for your courses.',
    icon: IconStar,
  },
]

export const TESTIMONIALS = [
  {
    text: 'StudyHub changed how I prepare for exams. The community sheets are so much better than studying alone.',
    name: 'Sarah M.',
    school: 'University of Maryland',
    initial: 'S',
    color: HOME_AVATAR_COLORS[0],
  },
  {
    text: 'Being able to fork and improve study sheets is genius. It is like GitHub but for students.',
    name: 'James K.',
    school: 'Towson University',
    initial: 'J',
    color: HOME_AVATAR_COLORS[1],
  },
  {
    text: 'The collaborative study sheets and forking system make it stand out from every other study platform.',
    name: 'Aisha R.',
    school: 'Morgan State University',
    initial: 'A',
    color: HOME_AVATAR_COLORS[2],
  },
]

export const PROOF_ITEMS = [
  { stroke: 'var(--sh-home-proof-primary)', label: 'No credit card required' },
  { stroke: 'var(--sh-home-proof-success)', label: 'Student built' },
  { stroke: 'var(--sh-home-proof-accent)', label: 'Open source' },
  { stroke: 'var(--sh-home-proof-warning)', label: 'Sign up in 60 seconds' },
]
