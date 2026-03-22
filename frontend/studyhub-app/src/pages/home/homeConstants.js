// homeConstants.js — Data arrays and helper config for the HomePage feature.
import {
  IconAnnouncements,
  IconCheck,
  IconDownload,
  IconFork,
  IconPen,
  IconSchool,
  IconSheets,
  IconSpark,
  IconStar,
  IconTests,
  IconUsers,
} from '../../components/Icons'

export const FEATURES = [
  {
    Icon: IconSheets,
    title: 'Study Sheets',
    desc: 'Community-built guides for every course. Fork any sheet and make it your own.',
    toneClass: 'home-feature--blue'
  },
  {
    Icon: IconTests,
    title: 'Practice Tests',
    desc: 'Take student-made tests right in your browser. Download anytime for offline use.',
    toneClass: 'home-feature--green'
  },
  {
    Icon: IconAnnouncements,
    title: 'Announcements',
    desc: 'Real-time course updates from instructors. Never miss a deadline or change.',
    toneClass: 'home-feature--amber'
  },
  {
    Icon: IconSpark,
    title: 'AI Tutor',
    desc: 'Stuck on a concept? Get instant explanations tailored to your exact course.',
    toneClass: 'home-feature--purple',
    badge: 'Coming Soon'
  },
  {
    Icon: IconPen,
    title: 'Personal Notes',
    desc: 'Keep private notes tied to any course. Share with classmates when you are ready.',
    toneClass: 'home-feature--rose'
  },
  {
    Icon: IconFork,
    title: 'Fork and Contribute',
    desc: 'Like GitHub: fork any study sheet, improve it, and contribute it back.',
    toneClass: 'home-feature--teal'
  },
  {
    Icon: IconSchool,
    title: 'Multi-School',
    desc: 'All 30+ Maryland schools. Every subject, every course. Expanding nationwide.',
    toneClass: 'home-feature--orange'
  },
  {
    Icon: IconDownload,
    title: 'Download Anything',
    desc: 'Save any study material to your device. Works offline when you need it.',
    toneClass: 'home-feature--slate'
  },
  {
    Icon: IconCheck,
    title: 'Always Free',
    desc: 'No paywalls, no subscriptions, no ads. StudyHub is free forever.',
    toneClass: 'home-feature--green'
  }
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
  }
]

export const TESTIMONIALS = [
  {
    text: 'StudyHub changed how I prepare for exams. The community sheets are so much better than studying alone.',
    name: 'Sarah M.',
    school: 'University of Maryland',
    initial: 'S',
    color: '#3b82f6',
  },
  {
    text: 'Being able to fork and improve study sheets is genius. It is like GitHub but for students.',
    name: 'James K.',
    school: 'Towson University',
    initial: 'J',
    color: '#10b981',
  },
  {
    text: 'The fact that it is completely free with no ads makes it stand out from every other study platform.',
    name: 'Aisha R.',
    school: 'Morgan State University',
    initial: 'A',
    color: '#8b5cf6',
  }
]

export const PROOF_ITEMS = [
  { stroke: '#3b82f6', label: 'No credit card required' },
  { stroke: '#10b981', label: 'No ads, ever' },
  { stroke: '#8b5cf6', label: 'Open source' },
  { stroke: '#f59e0b', label: 'Sign up in 60 seconds' },
]
