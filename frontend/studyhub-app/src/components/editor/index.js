/**
 * Editor barrel — re-exports editor components for clean imports.
 */
export { default as RichTextEditor } from './RichTextEditor'
export { sanitizeOutput, PURIFY_CONFIG } from './editorSanitize'
export { default as EditorToolbar } from './EditorToolbar'
export { MathInline, MathBlock, renderMath } from './MathExtension'
export { lowlight, CODE_LANGUAGES } from './codeHighlight'
