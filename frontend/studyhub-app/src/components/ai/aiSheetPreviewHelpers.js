/**
 * Extract HTML content from a markdown code block with language tag "html".
 * Returns the first match or null.
 */
export function extractHtmlFromMessage(content) {
  if (!content) return null
  const match = content.match(/```html\s*\n([\s\S]*?)```/)
  return match ? match[1].trim() : null
}
