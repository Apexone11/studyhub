// Library catalog constants (Google Books API)

export const CATEGORIES = [
  'Fiction',
  'Science',
  'History',
  'Philosophy',
  'Mathematics',
  'Poetry',
  'Drama',
  'Art',
  'Music',
  'Religion',
  'Biography & Autobiography',
  'Adventure',
  'Juvenile Fiction',
  'Law',
  'Medical',
]

export const SORT_OPTIONS = [
  { value: 'relevance', label: 'Most Relevant' },
  { value: 'newest', label: 'Newest First' },
]

export const READER_THEMES = {
  light: {
    bg: '#ffffff',
    text: '#1a1a1a',
    accent: '#2563eb',
  },
  sepia: {
    bg: '#faf6f1',
    text: '#3e2723',
    accent: '#8b4513',
  },
  dark: {
    bg: '#1a1a1a',
    text: '#e8e8e8',
    accent: '#60a5fa',
  },
}

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'es', label: 'Spanish' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
]
