/* ═══════════════════════════════════════════════════════════════════════════
 * aiSlashCommands.js — Slash-command catalog + trigger detection helpers.
 *
 * Split out of AiSlashCommandMenu.jsx so the menu file only exports
 * components (react-refresh constraint).
 * ═══════════════════════════════════════════════════════════════════════════ */

export const SLASH_COMMANDS = [
  {
    name: '/summarize',
    description: 'Summarize the latest uploaded document or this conversation.',
    template:
      'Summarize the most recently uploaded document. If no document is attached, summarize the conversation so far.',
  },
  {
    name: '/quiz',
    description: 'Generate quiz questions from the document or conversation.',
    template:
      'Generate 5–10 quiz questions from the most recently uploaded document or, if none is attached, from the conversation so far. Mix multiple choice, short answer, and one harder application question.',
  },
  {
    name: '/explain',
    description: 'Explain a concept at student level.',
    template:
      'Explain at a college-student level. Use simple language, give a concrete example, and end with one question that checks understanding. Topic: ',
  },
  {
    name: '/outline',
    description: 'Output a study outline as a markdown list.',
    template:
      'Produce a structured study outline as a nested markdown list. Cover the key concepts, sub-topics, and connections. Topic: ',
  },
  {
    name: '/cite',
    description:
      'Reformat the latest answer in a citation style (APA / MLA / Chicago / IEEE / Harvard).',
    template: "Re-format the previous answer's citations in this style: ",
  },
  {
    name: '/translate',
    description: 'Translate the latest answer or attached doc into another language.',
    template: 'Translate the previous answer into this language: ',
  },
  {
    name: '/define',
    description: 'Define a term with field-aware nuance.',
    template:
      'Give a precise, field-aware definition of this term, plus a one-sentence example showing it in use. Term: ',
  },
]

export function detectSlashTrigger(text) {
  if (!text || text[0] !== '/') return null
  const m = text.match(/^\/[A-Za-z]*/)
  return m ? m[0] : null
}

export function filterCommands(trigger) {
  if (!trigger || trigger === '/') return SLASH_COMMANDS
  const lc = trigger.toLowerCase()
  return SLASH_COMMANDS.filter((c) => c.name.toLowerCase().startsWith(lc))
}
