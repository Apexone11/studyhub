/**
 * Code syntax highlighting configuration for the rich text editor.
 *
 * Uses lowlight (highlight.js core) with a curated set of languages
 * relevant to college study materials. Lazy-loads to keep initial
 * bundle size manageable.
 *
 * Languages chosen for STEM/CS coursework coverage:
 *   javascript, typescript, python, java, c, cpp, csharp, go, rust,
 *   sql, html, css, json, bash, markdown, latex, r, matlab
 */
import { createLowlight, common } from 'lowlight'

/**
 * Create a lowlight instance pre-loaded with common languages.
 * The 'common' bundle includes ~35 popular languages:
 *   javascript, typescript, python, java, c, cpp, csharp, go, rust,
 *   sql, xml/html, css, json, bash, shell, markdown, yaml, makefile,
 *   ruby, php, swift, kotlin, scala, perl, r, matlab, lua, etc.
 */
const lowlight = createLowlight(common)

export { lowlight }

/**
 * Curated list of language options for the code block language selector.
 * Displayed in the editor toolbar dropdown. Subset of what lowlight supports.
 */
export const CODE_LANGUAGES = [
  { value: '', label: 'Auto-detect' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'csharp', label: 'C#' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'sql', label: 'SQL' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'json', label: 'JSON' },
  { value: 'bash', label: 'Bash/Shell' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'yaml', label: 'YAML' },
  { value: 'r', label: 'R' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'php', label: 'PHP' },
  { value: 'swift', label: 'Swift' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'lua', label: 'Lua' },
  { value: 'xml', label: 'XML' },
]
