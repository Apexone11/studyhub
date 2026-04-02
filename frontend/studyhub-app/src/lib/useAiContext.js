/**
 * useAiContext.js -- Determines page-aware context chips for Hub AI.
 * Returns suggestion prompts based on the current route.
 */
import { useMemo } from 'react'
import { useLocation } from 'react-router-dom'

const CONTEXT_CHIPS = {
  '/sheets/:id': [
    { label: 'Summarize this sheet', prompt: 'Summarize the study sheet I am currently viewing.' },
    { label: 'Quiz me on this', prompt: 'Create a short quiz based on the study sheet I am currently viewing.' },
    { label: 'Explain key concepts', prompt: 'Explain the key concepts from the study sheet I am currently viewing.' },
  ],
  '/notes/:id': [
    { label: 'Improve this note', prompt: 'Help me improve the note I am currently viewing. Suggest better organization and any missing details.' },
    { label: 'Generate flashcards', prompt: 'Create flashcards from the note I am currently viewing.' },
    { label: 'Summarize this note', prompt: 'Summarize the note I am currently viewing into key points.' },
  ],
  '/library': [
    { label: 'Recommend a classic book', prompt: 'Recommend a classic book for my course.' },
    { label: 'Philosophy books to start with', prompt: 'What are the best philosophy books to start with?' },
  ],
  '/library/:id': [
    { label: 'Summarize this book', prompt: 'Summarize the book I am currently viewing.' },
    { label: 'Before reading tips', prompt: 'What should I know before reading this book?' },
  ],
  '/library/:id/read': [
    { label: 'Explain this passage', prompt: 'Explain this passage I am currently reading.' },
    { label: 'Quiz me', prompt: 'Quiz me on what I just read.' },
    { label: 'Word definition', prompt: 'What does this word mean?' },
  ],
  '/feed': [
    { label: 'Create a study sheet', prompt: 'Help me create a study sheet for ' },
    { label: 'What should I study?', prompt: 'Based on my enrolled courses, what topics should I focus on studying next?' },
  ],
  '/notes': [
    { label: 'Help organize my notes', prompt: 'Look at my recent notes and suggest how I could organize them better.' },
    { label: 'Create a new note', prompt: 'Help me create a new study note about ' },
  ],
  '/sheets': [
    { label: 'Create a study sheet', prompt: 'Help me create a study sheet for ' },
    { label: 'Find study gaps', prompt: 'Based on my courses and existing study sheets, what topics am I missing coverage on?' },
  ],
  '/study-groups': [
    { label: 'Suggest discussion topics', prompt: 'Suggest some discussion topics for a study group session.' },
    { label: 'Create group resources', prompt: 'Help me create a study resource I can share with my study group about ' },
  ],
  '/sheets/:id/lab': [
    { label: 'Review my changes', prompt: 'Review the changes I have made in Sheet Lab and suggest improvements.' },
    { label: 'Improve this HTML', prompt: 'Help me improve the HTML structure and formatting of this study sheet.' },
  ],
  '/my-courses': [
    { label: 'What should I study?', prompt: 'Based on my enrolled courses, suggest what I should study next.' },
    { label: 'Create a sheet for a course', prompt: 'Help me create a study sheet for ' },
  ],
  '/tests': [
    { label: 'Generate a practice test', prompt: 'Generate a practice test based on my study materials for ' },
    { label: 'Explain a question', prompt: 'Help me understand a practice test question: ' },
  ],
}

/**
 * Match the current path against known patterns and return context chips.
 */
export function useAiContext() {
  const location = useLocation()

  return useMemo(() => {
    const path = location.pathname

    // Check for parameterized routes first.
    if (path.match(/^\/sheets\/\d+\/lab/)) {
      return CONTEXT_CHIPS['/sheets/:id/lab'] || []
    }
    if (path.match(/^\/sheets\/\d+/)) {
      return CONTEXT_CHIPS['/sheets/:id'] || []
    }
    if (path.match(/^\/notes\/\d+/)) {
      return CONTEXT_CHIPS['/notes/:id'] || []
    }
    if (path.match(/^\/library\/\d+\/read/)) {
      return CONTEXT_CHIPS['/library/:id/read'] || []
    }
    if (path.match(/^\/library\/\d+/)) {
      return CONTEXT_CHIPS['/library/:id'] || []
    }

    // Check exact path matches.
    for (const [pattern, chips] of Object.entries(CONTEXT_CHIPS)) {
      if (pattern === path) return chips
    }

    // Default: generic suggestions.
    return [
      { label: 'Create a study sheet', prompt: 'Help me create a study sheet for ' },
      { label: 'Ask a question', prompt: '' },
    ]
  }, [location.pathname])
}
